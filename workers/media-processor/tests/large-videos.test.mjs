import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';

import { downloadObject, multipartUploadObject, sha256File } from '../src/processor.mjs';

let dir;
before(async () => { dir = await mkdtemp(path.join(tmpdir(), 'chc-large-video-')); });
after(async () => { await rm(dir, { recursive: true, force: true }); });

test('R2 original download is a streaming file write (no whole-file buffer)', async () => {
  const chunks = Array.from({ length: 8 }, (_, i) => Buffer.alloc(512 * 1024, i));
  const fakeClient = {
    async send(command) {
      assert.ok(command instanceof GetObjectCommand);
      return { Body: Readable.from(chunks) };
    },
  };
  const destination = path.join(dir, 'download.m4v');
  await downloadObject({ r2Driver: 's3' }, 'chc-submissions', 'large.m4v', destination, fakeClient);
  const downloaded = await readFile(destination);
  assert.deepEqual(downloaded, Buffer.concat(chunks));
  assert.equal(await sha256File(destination), createHash('sha256').update(downloaded).digest('hex'));
});

test('5+ GB output uses bounded multipart chunks and never puts a whole source into memory', async () => {
  const size = 5 * 1024 ** 3 + 123;
  const source = path.join(dir, 'sparse-5g.mp4');
  const handle = await open(source, 'w');
  try { await handle.truncate(size); } finally { await handle.close(); }
  const uploaded = [];
  let completed = false;
  const fakeClient = {
    async send(command) {
      if (command instanceof CreateMultipartUploadCommand) {
        assert.equal(command.input.ContentType, 'video/mp4');
        return { UploadId: 'test-5g' };
      }
      if (command instanceof UploadPartCommand) {
        const part = command.input;
        uploaded.push({ number: part.PartNumber, length: part.ContentLength });
        assert.ok(part.ContentLength <= 64 * 1024 * 1024);
        part.Body.destroy();
        return { ETag: `"part-${part.PartNumber}"` };
      }
      if (command instanceof CompleteMultipartUploadCommand) {
        completed = true;
        assert.deepEqual(command.input.MultipartUpload.Parts.map((p) => p.PartNumber),
          uploaded.map((p) => p.number));
        return {};
      }
      throw new Error(`Unexpected command ${command.constructor.name}`);
    },
  };
  await multipartUploadObject(fakeClient, 'chc-learning', 'large.mp4', source, size, 'video/mp4');
  assert.equal(completed, true);
  assert.equal(uploaded.reduce((sum, part) => sum + part.length, 0), size);
  assert.ok(uploaded.length > 80);
  assert.equal((await stat(source)).size, size);
});

test('multipart delivery aborts R2 session when a part fails', async () => {
  const source = path.join(dir, 'small.mp4');
  await writeFile(source, Buffer.from('test video output'));
  let aborted = false;
  const fakeClient = {
    async send(command) {
      if (command instanceof CreateMultipartUploadCommand) return { UploadId: 'abort-test' };
      if (command instanceof UploadPartCommand) throw new Error('network failure');
      if (command instanceof AbortMultipartUploadCommand) { aborted = true; return {}; }
      throw new Error('Unexpected command');
    },
  };
  await assert.rejects(
    multipartUploadObject(fakeClient, 'chc-learning', 'small.mp4', source, 17, 'video/mp4'),
    /network failure/,
  );
  assert.equal(aborted, true);
});
