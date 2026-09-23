import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

// The production Railway Hobby processor has 1 GB RAM AND 1 GB scratch disk.
// Never stage a several-GB original or output on that service.
export const STREAMING_THRESHOLD_BYTES = 256 * 1024 * 1024;
export const STREAMING_PART_BYTES = 32 * 1024 * 1024;

function imageExtension(key) {
  const extension = String(key || '').match(/\.[a-z0-9]{1,8}$/i)?.[0];
  return extension || '.mp4';
}

/**
 * FFmpeg and ffprobe need random access to MP4/M4V metadata, sometimes at the
 * very end of the original. An R2-backed localhost HTTP Range server allows
 * arbitrary seeks without staging the original on the Railway filesystem or
 * exposing a private object publicly.
 */
export async function openR2RangeServer(client, bucket, key, info) {
  const objectSize = Number(info.ContentLength);
  if (!Number.isSafeInteger(objectSize) || objectSize <= 0) {
    throw new Error('R2 did not provide a valid original file size');
  }

  const server = createServer((req, res) => {
    void (async () => {
      if (!req.url?.startsWith('/media') || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(404).end();
        return;
      }

      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', info.ContentType || 'application/octet-stream');

      const requestedRange = req.headers.range;
      if (requestedRange && !/^bytes=\d+-\d*$/.test(requestedRange)) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + objectSize }).end();
        return;
      }

      if (req.method === 'HEAD') {
        if (requestedRange) {
          const match = requestedRange.match(/^bytes=(\d+)-(\d*)$/);
          const first = Number(match[1]);
          const last = match[2] ? Number(match[2]) : objectSize - 1;
          if (first >= objectSize || last < first) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + objectSize }).end();
            return;
          }
          const end = Math.min(last, objectSize - 1);
          res.writeHead(206, {
            'Content-Length': end - first + 1,
            'Content-Range': 'bytes ' + first + '-' + end + '/' + objectSize,
          }).end();
        } else {
          res.writeHead(200, { 'Content-Length': objectSize }).end();
        }
        return;
      }

      const object = await client.send(new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(requestedRange ? { Range: requestedRange } : {}),
      }));
      if (!object.Body) throw new Error('R2 returned an empty media object body');
      if (requestedRange && !object.ContentRange) {
        throw new Error('R2 did not honor the requested media byte range');
      }
      if (object.ContentLength !== undefined) {
        res.setHeader('Content-Length', object.ContentLength);
      }
      if (object.ContentRange) {
        res.setHeader('Content-Range', object.ContentRange);
      }
      res.statusCode = object.ContentRange ? 206 : 200;
      await pipeline(object.Body, res);
    })().catch(() => {
      if (!res.headersSent) res.writeHead(502).end('R2 media range request failed');
      else res.destroy();
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = 'http://127.0.0.1:' + address.port + '/media' + imageExtension(key);
  return {
    url,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

export async function probeUrl(url) {
  const args = ['-v', 'error', '-show_format', '-show_streams', '-print_format', 'json', url];
  const child = spawn(ffprobeStatic.path, args, { shell: false, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    if (stdout.length > 8 * 1024 * 1024) child.kill();
  });
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-16384); });
  const outcome = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ error }));
    child.once('close', (code) => resolve({ code }));
  });
  if (outcome.error || outcome.code !== 0) {
    throw new Error('FFprobe could not read streamed media: ' + (outcome.error?.message || stderr || outcome.code));
  }
  return JSON.parse(stdout);
}

function assertOutput(jobType, probe) {
  const stream = probe.streams?.find((part) => part.codec_type === (jobType === 'video_delivery' ? 'video' : 'audio'));
  const expectedCodec = jobType === 'video_delivery' ? 'h264' : 'aac';
  if (!stream || stream.codec_name !== expectedCodec) {
    throw new Error('Streamed delivery validation failed: missing ' + expectedCodec + ' output');
  }
  const formatName = String(probe.format?.format_name || '');
  if (!formatName.includes('mp4') && !formatName.includes('m4a')) {
    throw new Error('Streamed delivery is not MP4/M4A: ' + formatName);
  }
}

function ffmpegArgs(jobType, inputUrl, inputProbe) {
  const args = [
    '-nostdin', '-hide_banner', '-loglevel', 'error',
    '-rw_timeout', '120000000', '-i', inputUrl,
    '-sn', '-dn',
  ];
  if (jobType === 'video_delivery') {
    if (!inputProbe.streams?.some((stream) => stream.codec_type === 'video')) {
      throw new Error('Source has no video stream');
    }
    args.push(
      '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'fast', '-threads', '2',
      '-filter_threads', '1', '-crf', '20',
      '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-vf', "scale=w=-2:h='min(1080,ih)':flags=lanczos,setsar=1",
      '-c:a', 'aac', '-b:a', '192k',
    );
  } else {
    const audio = inputProbe.streams?.find((stream) => stream.codec_type === 'audio');
    if (!audio) throw new Error('Cannot extract audio: source video has no audio stream');
    args.push('-map', '0:a:0', '-vn', '-c:a', audio.codec_name === 'aac' ? 'copy' : 'aac');
    if (audio.codec_name !== 'aac') args.push('-b:a', '256k');
  }

  // A normal +faststart MP4 must be seeked at the end, which is impossible on
  // stdout. Fragmented MP4 begins with a valid moov header and supports R2
  // byte-range playback while the output is streamed without scratch files.
  args.push(
    '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
    '-frag_duration', '4000000',
    '-f', 'mp4', 'pipe:1',
  );
  return args;
}

/**
 * FFmpeg stdout -> bounded 32 MiB buffers -> R2 multipart. No source or
 * rendition ever lands on scratch disk and no whole-file Buffer is allocated.
 */
export async function streamTranscodeToR2(client, inputUrl, inputProbe, jobType, bucket, key) {
  const contentType = jobType === 'video_delivery' ? 'video/mp4' : 'audio/mp4';
  const created = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket, Key: key, ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  if (!created.UploadId) throw new Error('R2 did not return a streaming upload ID');

  let child;
  try {
    child = spawn(ffmpegPath, ffmpegArgs(jobType, inputUrl, inputProbe), {
      shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-32768); });
    // Convert process events to values so an early FFmpeg error cannot create
    // an unhandled promise rejection while the stdout multipart loop runs.
    const closed = new Promise((resolve) => {
      child.once('error', (error) => resolve({ error }));
      child.once('close', (code) => resolve({ code }));
    });

    const parts = [];
    const checksum = createHash('sha256');
    let totalBytes = 0;
    let pending = [];
    let pendingBytes = 0;
    async function uploadPart(bytes) {
      const partNumber = parts.length + 1;
      const response = await client.send(new UploadPartCommand({
        Bucket: bucket, Key: key,
        UploadId: created.UploadId,
        PartNumber: partNumber,
        Body: bytes,
        ContentLength: bytes.length,
      }));
      if (!response.ETag) throw new Error('R2 did not return ETag for output part ' + partNumber);
      parts.push({ PartNumber: partNumber, ETag: response.ETag });
    }

    for await (const chunk of child.stdout) {
      checksum.update(chunk);
      totalBytes += chunk.length;
      pending.push(chunk);
      pendingBytes += chunk.length;
      if (pendingBytes >= STREAMING_PART_BYTES) {
        const joined = Buffer.concat(pending, pendingBytes);
        await uploadPart(joined.subarray(0, STREAMING_PART_BYTES));
        const tail = joined.subarray(STREAMING_PART_BYTES);
        pending = tail.length ? [tail] : [];
        pendingBytes = tail.length;
      }
    }

    const result = await closed;
    if (result.error || result.code !== 0) {
      throw new Error('FFmpeg streamed transcode failed: ' + (result.error?.message || stderr || result.code));
    }
    if (!totalBytes) throw new Error('FFmpeg produced an empty media file');

    if (pendingBytes > 0) await uploadPart(Buffer.concat(pending, pendingBytes));
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: key,
      UploadId: created.UploadId,
      MultipartUpload: { Parts: parts },
    }));
    return {
      outputSizeBytes: totalBytes,
      outputChecksumSha256: checksum.digest('hex'),
      outputMimeType: contentType,
      partsCount: parts.length,
    };
  } catch (error) {
    if (child?.exitCode === null) child.kill('SIGTERM');
    await client.send(new AbortMultipartUploadCommand({
      Bucket: bucket, Key: key, UploadId: created.UploadId,
    })).catch(() => undefined);
    throw error;
  }
}

/** Return null for small files that still use the ordinary FFmpeg pipeline. */
export async function maybeRunStreamedMediaJob(config, job, operations, thresholdBytes = STREAMING_THRESHOLD_BYTES) {
  if (config.r2Driver !== 's3' || !['video_delivery', 'audio_delivery'].includes(job.job_type)) {
    return null;
  }

  const client = operations.getS3Client();
  const head = await client.send(new HeadObjectCommand({
    Bucket: job.input_bucket,
    Key: job.input_path,
  }));
  if (Number(head.ContentLength || 0) < thresholdBytes) return null;

  const source = await openR2RangeServer(client, job.input_bucket, job.input_path, head);
  let outputExists = false;
  try {
    const inputProbe = await probeUrl(source.url);
    const output = await streamTranscodeToR2(
      client, source.url, inputProbe, job.job_type, job.output_bucket, job.output_path,
    );
    outputExists = true;
    const outputHead = await client.send(new HeadObjectCommand({
      Bucket: job.output_bucket,
      Key: job.output_path,
    }));
    if (Number(outputHead.ContentLength) !== output.outputSizeBytes) {
      throw new Error('R2 streamed delivery size does not match FFmpeg output');
    }
    const outputServer = await openR2RangeServer(
      client, job.output_bucket, job.output_path, outputHead,
    );
    let outputProbe;
    try {
      outputProbe = await probeUrl(outputServer.url);
      assertOutput(job.job_type, outputProbe);
    } finally {
      await outputServer.close();
    }

    const video = job.job_type === 'video_delivery';
    const inputAudio = inputProbe.streams?.find((stream) => stream.codec_type === 'audio');
    const transcoding = video
      ? { videoCodec: 'h264', audioCodec: 'aac', crf: 20, maxHeight: 1080,
          container: 'fragmented_mp4', mode: 'streamed' }
      : { audioCodec: 'aac', container: 'm4a', mode: 'streamed',
          sourceCodec: inputAudio?.codec_name,
          targetBitrate: inputAudio?.codec_name === 'aac' ? null : '256k' };

    const completedRows = await operations.callRpc(config, 'complete_media_processing_job', {
      p_worker_token: config.mediaWorkerToken,
      p_job_id: job.job_id,
      p_output_mime_type: output.outputMimeType,
      p_output_size_bytes: output.outputSizeBytes,
      p_output_checksum_sha256: output.outputChecksumSha256,
      p_probe: { input: inputProbe, output: outputProbe, transcode: transcoding },
    });
    return {
      status: 'completed',
      jobId: job.job_id,
      jobType: job.job_type,
      uploadIntentId: job.upload_intent_id,
      outputBucket: job.output_bucket,
      outputPath: job.output_path,
      outputMimeType: output.outputMimeType,
      outputSizeBytes: output.outputSizeBytes,
      outputChecksumSha256: output.outputChecksumSha256,
      completion: completedRows[0] ?? null,
      streamed: true,
    };
  } catch (error) {
    if (outputExists) {
      await operations.deleteObject(config, job.output_bucket, job.output_path)
        .catch(() => undefined);
    }
    throw error;
  } finally {
    await source.close();
  }
}
