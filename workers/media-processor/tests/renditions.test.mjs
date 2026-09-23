import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { after, before, describe, it } from 'node:test';
import ffmpegPath from 'ffmpeg-static';

import {
  handleAudioDelivery,
  handleImageDelivery,
  handleVideoDelivery,
} from '../src/processor.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stderr = '';

    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr}`));
      }
    });
  });
}

function streamOf(probe, type) {
  return probe.streams.find((stream) => stream.codec_type === type);
}

let workDir;

before(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'chc-media-test-'));
});

after(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe('audio_delivery', () => {
  it('produces AAC-LC M4A at 256k', async () => {
    const source = path.join(workDir, 'tone.wav');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
      source,
    ]);

    const result = await handleAudioDelivery(source, workDir);
    const audio = streamOf(result.probe.output, 'audio');

    assert.equal(result.mimeType, 'audio/mp4');
    assert.equal(audio.codec_name, 'aac');
    assert.equal(audio.profile, 'LC');
    assert.equal(result.probe.transcode.targetBitrate, '256k');
    assert.match(result.probe.output.format.format_name, /mp4|m4a/);
  });

  it('extracts a standalone audio rendition from a video lesson', async () => {
    const source = path.join(workDir, 'lesson-with-audio.mp4');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', source,
    ]);

    const result = await handleAudioDelivery(source, workDir);
    const audio = streamOf(result.probe.output, 'audio');
    const video = streamOf(result.probe.output, 'video');

    assert.equal(result.mimeType, 'audio/mp4');
    assert.equal(audio.codec_name, 'aac');
    assert.equal(video, undefined);
    assert.match(result.probe.output.format.format_name, /mp4|m4a/);
  });

  it('rejects a source with no audio stream', async () => {
    const source = path.join(workDir, 'silent.mp4');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=black:s=320x240:d=1',
      '-pix_fmt', 'yuv420p', source,
    ]);

    await assert.rejects(
      handleAudioDelivery(source, workDir),
      /no audio stream/,
    );
  });
});

describe('image_delivery', () => {
  it('flattens transparency and keeps square pixels', async () => {
    const source = path.join(workDir, 'alpha.png');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=red@0.0:s=1200x800,format=rgba',
      '-frames:v', '1', source,
    ]);

    const result = await handleImageDelivery(source, workDir);
    const image = streamOf(result.probe.output, 'video');

    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(image.codec_name, 'mjpeg');
    assert.equal(image.sample_aspect_ratio ?? '1:1', '1:1');
    assert.equal(image.width, 1200);
    assert.equal(image.height, 800);
  });

  it('caps the longest edge without upscaling', async () => {
    const large = path.join(workDir, 'large.png');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=blue:s=4000x2500',
      '-frames:v', '1', large,
    ]);

    const capped = await handleImageDelivery(large, workDir);
    const cappedImage = streamOf(capped.probe.output, 'video');

    assert.equal(cappedImage.width, 3000);
    assert.equal(cappedImage.sample_aspect_ratio ?? '1:1', '1:1');

    const small = path.join(workDir, 'small.png');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'color=c=green:s=400x400',
      '-frames:v', '1', small,
    ]);

    const untouched = await handleImageDelivery(small, workDir);
    const untouchedImage = streamOf(untouched.probe.output, 'video');

    assert.equal(untouchedImage.width, 400);
    assert.equal(untouchedImage.height, 400);
  });

  it('rejects a source with no image stream', async () => {
    const source = path.join(workDir, 'audio-only.m4a');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:a', 'aac', source,
    ]);

    await assert.rejects(
      handleImageDelivery(source, workDir),
      /no image stream/,
    );
  });
});

describe('video_delivery', () => {
  it('produces a faststart H.264 MP4 capped at 1080p', async () => {
    const source = path.join(workDir, 'clip.mkv');
    await run(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc=size=3840x2160:duration=1:rate=10',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest', source,
    ]);

    const result = await handleVideoDelivery(source, workDir);
    const video = streamOf(result.probe.output, 'video');

    assert.equal(result.mimeType, 'video/mp4');
    assert.equal(video.codec_name, 'h264');
    assert.equal(video.height, 1080);
    assert.equal(video.sample_aspect_ratio ?? '1:1', '1:1');
  });
});
