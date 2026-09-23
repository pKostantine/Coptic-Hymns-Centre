import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { before, after, test } from 'node:test';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import ffmpegPath from 'ffmpeg-static';
import {
  maybeRunStreamedMediaJob,
  openR2RangeServer,
  probeUrl,
} from '../src/streamed-media.mjs';

let dir;
let original;
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'chc-streamed-job-'));
  const source = path.join(dir, 'source.m4v');
  await new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:duration=2:rate=12',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', '-f', 'mp4', source,
    ]);
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve() : reject(Error(stderr)));
  });
  original = await readFile(source);
});
after(async () => { await rm(dir, { recursive: true, force: true }); });

function fakeR2() {
  const objects = new Map([['chc-submissions/source.m4v', original]]);
  const pending = new Map();
  const created = [];
  let nextId = 0;
  return {
    objects, created,
    async send(command) {
      const p = command.input;
      const objectKey = p.Bucket + '/' + p.Key;
      if (command instanceof HeadObjectCommand) {
        const bytes = objects.get(objectKey);
        if (!bytes) throw Error('Missing R2 object: ' + objectKey);
        return {
          ContentLength: bytes.length,
          ContentType: p.Key.endsWith('.m4v') ? 'video/x-m4v'
            : p.Key.endsWith('.m4a') ? 'audio/mp4' : 'video/mp4',
        };
      }
      if (command instanceof GetObjectCommand) {
        const bytes = objects.get(objectKey);
        if (!bytes) throw Error('Missing R2 object: ' + objectKey);
        const match = p.Range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = match ? Number(match[1]) : 0;
        const end = match && match[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1;
        if (start >= bytes.length || start > end) throw Error('Unsatisfiable range');
        const selected = bytes.subarray(start, end + 1);
        return {
          Body: Readable.from([selected]),
          ContentLength: selected.length,
          ...(match ? { ContentRange: 'bytes ' + start + '-' + end + '/' + bytes.length } : {}),
        };
      }
      if (command instanceof CreateMultipartUploadCommand) {
        const id = 'fake-' + ++nextId;
        pending.set(id, new Map());
        created.push(objectKey);
        return { UploadId: id };
      }
      if (command instanceof UploadPartCommand) {
        const parts = pending.get(p.UploadId);
        assert.ok(parts, 'multipart upload must exist');
        assert.equal(p.ContentLength, p.Body.length);
        parts.set(p.PartNumber, p.Body);
        return { ETag: '"part-' + p.PartNumber + '"' };
      }
      if (command instanceof CompleteMultipartUploadCommand) {
        const parts = pending.get(p.UploadId);
        assert.ok(parts);
        assert.deepEqual(
          p.MultipartUpload.Parts.map((part) => part.PartNumber),
          [...parts.keys()],
        );
        objects.set(objectKey, Buffer.concat([...parts.entries()]
          .sort((a,b) => a[0]-b[0]).map(([, bytes]) => bytes)));
        pending.delete(p.UploadId);
        return {};
      }
      if (command instanceof AbortMultipartUploadCommand) {
        pending.delete(p.UploadId);
        return {};
      }
      throw Error('Unexpected fake S3 command ' + command.constructor.name);
    },
  };
}

test('R2 localhost range server supports FFprobe seek and private byte ranges', async () => {
  const client = fakeR2();
  const info = await client.send(new HeadObjectCommand({
    Bucket: 'chc-submissions', Key: 'source.m4v',
  }));
  const server = await openR2RangeServer(client, 'chc-submissions', 'source.m4v', info);
  try {
    const head = await fetch(server.url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), original.length);
    const range = await fetch(server.url, { headers: { Range: 'bytes=100-399' } });
    assert.equal(range.status, 206);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), original.subarray(100,400));
    const probe = await probeUrl(server.url);
    assert.ok(probe.streams.some((s) => s.codec_name === 'h264'));
    assert.ok(probe.streams.some((s) => s.codec_name === 'aac'));
  } finally {
    await server.close();
  }
});

test('streaming video job transcodes directly to R2 and completes without scratch files', async () => {
  const client = fakeR2();
  const payloads = [];
  const config = { r2Driver: 's3', mediaWorkerToken: 'test-only' };
  const job = {
    job_id: 'video-123', upload_intent_id: 'intent-123',
    job_type: 'video_delivery',
    input_bucket: 'chc-submissions', input_path: 'source.m4v',
    output_bucket: 'chc-learning', output_path: 'processed/video.mp4',
  };
  const result = await maybeRunStreamedMediaJob(config, job, {
    getS3Client: () => client,
    callRpc: async (_config, name, payload) => {
      assert.equal(name, 'complete_media_processing_job');
      payloads.push(payload);
      return [{ status: 'completed' }];
    },
    deleteObject: async () => { throw Error('no cleanup expected'); },
  }, 0);
  assert.equal(result.streamed, true);
  assert.equal(result.status, 'completed');
  assert.equal(result.outputMimeType, 'video/mp4');
  assert.ok(result.outputSizeBytes > 0);
  assert.ok(client.objects.get('chc-learning/processed/video.mp4'));
  assert.equal(payloads[0].p_output_size_bytes, result.outputSizeBytes);
  assert.equal(payloads[0].p_probe.transcode.mode, 'streamed');
  assert.equal(payloads[0].p_probe.output.streams.find(s=>s.codec_type==='video').codec_name, 'h264');
});

test('audio-only from a video uses the same private R2 original, with zero re-upload', async () => {
  const client = fakeR2();
  const config = { r2Driver: 's3', mediaWorkerToken: 'test-only' };
  const job = {
    job_id: 'audio-123', upload_intent_id: 'intent-123',
    job_type: 'audio_delivery',
    input_bucket: 'chc-submissions', input_path: 'source.m4v',
    output_bucket: 'chc-learning', output_path: 'processed/audio.m4a',
  };
  let probe;
  const result = await maybeRunStreamedMediaJob(config, job, {
    getS3Client: () => client,
    callRpc: async (_config, _name, payload) => {
      probe = payload.p_probe;
      return [{ status: 'completed' }];
    },
    deleteObject: async () => { throw Error('no cleanup expected'); },
  }, 0);
  assert.equal(result.status, 'completed');
  assert.equal(result.outputMimeType, 'audio/mp4');
  assert.equal(probe.output.streams.find(s=>s.codec_type==='audio').codec_name, 'aac');
  assert.equal(probe.transcode.sourceCodec, 'aac');
  assert.equal(probe.transcode.mode, 'streamed');
  assert.ok(client.objects.get('chc-learning/processed/audio.m4a').length > 0);
});
