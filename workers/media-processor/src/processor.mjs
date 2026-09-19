import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const AUDIO_OUTPUT_MIME_TYPE = 'audio/mp4';
const AUDIO_BITRATE = '256k';
const VIDEO_OUTPUT_MIME_TYPE = 'video/mp4';
const VIDEO_AUDIO_BITRATE = '192k';
const VIDEO_CRF = '20';
const VIDEO_MAX_HEIGHT = 1080;
const IMAGE_OUTPUT_MIME_TYPE = 'image/jpeg';
const IMAGE_MAX_EDGE = 3000;
const IMAGE_QUALITY = '3';

// Flatten any alpha onto white, force square pixels, cap the longer edge, and
// encode a delivery JPEG. scale2ref sizes the white backdrop from the source,
// and the two setsar=1 calls stop the backdrop and the -2 rounding from leaving
// a non-square sample aspect ratio behind.
const IMAGE_FILTER_COMPLEX = [
  'color=c=white[bg]',
  '[bg][0:v]scale2ref[bg][fg]',
  `[bg][fg]overlay=format=auto:shortest=1,setsar=1,`
    + `scale=w='if(gt(iw,ih),min(${IMAGE_MAX_EDGE},iw),-2)':`
    + `h='if(gt(iw,ih),-2,min(${IMAGE_MAX_EDGE},ih))':flags=lanczos,`
    + 'setsar=1,format=yuvj420p',
].join(';');

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

export function getConfig() {
  const r2Driver = process.env.R2_DRIVER || 'wrangler';

  // Validate storage access before the worker ever claims a job. A missing R2
  // credential is an infrastructure problem, not a media-file failure; letting
  // the worker claim jobs first would burn their retry attempts one by one.
  if (r2Driver === 's3') {
    requireEnv('R2_ACCOUNT_ID');
    requireEnv('R2_ACCESS_KEY_ID');
    requireEnv('R2_SECRET_ACCESS_KEY');
  }

  return {
    supabaseUrl: requireEnv('SUPABASE_URL').replace(/\/+$/, ''),
    supabasePublishableKey: requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    mediaWorkerToken: requireEnv('MEDIA_WORKER_TOKEN'),
    mediaWorkerId: process.env.MEDIA_WORKER_ID || `media-processor-${process.pid}`,
    r2Driver,
    workDir: process.env.MEDIA_WORK_DIR || tmpdir(),
  };
}

async function callRpc(config, name, payload) {
  const headers = {
    apikey: config.supabasePublishableKey,
    'accept-profile': 'public',
    'content-profile': 'public',
    'content-type': 'application/json',
  };

  if (process.env.SUPABASE_ACCESS_TOKEN) {
    headers.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
  }

  const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  const body = bodyText ? JSON.parse(bodyText) : null;

  if (!response.ok) {
    const message = body?.message || bodyText || `${name} failed`;
    throw new Error(`Supabase RPC ${name} failed with ${response.status}: ${message}`);
  }

  return Array.isArray(body) ? body : [];
}

function spawnChecked(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function getWranglerCommand() {
  if (process.env.WRANGLER_COMMAND) {
    return {
      command: process.env.WRANGLER_COMMAND,
      prefix: [],
    };
  }

  return process.platform === 'win32'
    ? { command: 'cmd.exe', prefix: ['/d', '/s', '/c', 'npx.cmd', 'wrangler'] }
    : { command: 'npx', prefix: ['wrangler'] };
}

function getS3Client() {
  const accountId = requireEnv('R2_ACCOUNT_ID');

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
}

async function streamToBuffer(stream) {
  if (typeof stream?.transformToByteArray === 'function') {
    return Buffer.from(await stream.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function downloadObject(config, bucket, key, destinationPath) {
  if (config.r2Driver === 's3') {
    const client = getS3Client();
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const data = await streamToBuffer(response.Body);
    await writeFile(destinationPath, data);
    return;
  }

  const wrangler = getWranglerCommand();
  await spawnChecked(wrangler.command, [
    ...wrangler.prefix,
    'r2',
    'object',
    'get',
    `${bucket}/${key}`,
    '--remote',
    '--file',
    destinationPath,
  ]);
}

async function uploadObject(config, bucket, key, sourcePath, contentType) {
  if (config.r2Driver === 's3') {
    const client = getS3Client();
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(sourcePath),
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }));
    return;
  }

  const wrangler = getWranglerCommand();
  await spawnChecked(wrangler.command, [
    ...wrangler.prefix,
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--remote',
    '--file',
    sourcePath,
    '--content-type',
    contentType,
    '--cache-control',
    'public, max-age=31536000, immutable',
  ]);
}

async function sha256File(filePath) {
  const data = await readFile(filePath);
  return createHash('sha256').update(data).digest('hex');
}

async function probeMedia(filePath) {
  const { stdout } = await spawnChecked(ffprobeStatic.path, [
    '-v',
    'error',
    '-show_format',
    '-show_streams',
    '-print_format',
    'json',
    filePath,
  ]);

  return JSON.parse(stdout);
}

function assertAudioInput(probe) {
  const audioStream = probe.streams?.find((stream) => stream.codec_type === 'audio');

  if (!audioStream) {
    throw new Error('Input media has no audio stream');
  }
}

function assertM4aOutput(probe) {
  const audioStream = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const formatName = String(probe.format?.format_name || '');

  if (!audioStream) {
    throw new Error('Output media has no audio stream');
  }

  if (audioStream.codec_name !== 'aac') {
    throw new Error(`Output audio codec is ${audioStream.codec_name}, expected aac`);
  }

  if (!formatName.includes('mp4') && !formatName.includes('m4a')) {
    throw new Error(`Output format is ${formatName}, expected mp4/m4a`);
  }
}

function assertVideoInput(probe) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');

  if (!videoStream) {
    throw new Error('Input media has no video stream');
  }
}

function assertMp4Output(probe) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');
  const formatName = String(probe.format?.format_name || '');

  if (!videoStream) {
    throw new Error('Output media has no video stream');
  }

  if (videoStream.codec_name !== 'h264') {
    throw new Error(`Output video codec is ${videoStream.codec_name}, expected h264`);
  }

  if (!formatName.includes('mp4')) {
    throw new Error(`Output format is ${formatName}, expected mp4`);
  }
}

function assertImageInput(probe) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');

  if (!videoStream) {
    throw new Error('Input media has no image stream');
  }

  if (!videoStream.width || !videoStream.height) {
    throw new Error('Input image has no readable dimensions');
  }
}

function assertJpegOutput(probe) {
  const videoStream = probe.streams?.find((stream) => stream.codec_type === 'video');

  if (!videoStream) {
    throw new Error('Output image has no image stream');
  }

  if (videoStream.codec_name !== 'mjpeg') {
    throw new Error(`Output image codec is ${videoStream.codec_name}, expected mjpeg`);
  }

  if (Math.max(videoStream.width || 0, videoStream.height || 0) > IMAGE_MAX_EDGE) {
    throw new Error(`Output image is larger than ${IMAGE_MAX_EDGE}px on its longest edge`);
  }
}

async function transcodeToM4a(inputPath, outputPath) {
  await spawnChecked(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vn',
    '-c:a',
    'aac',
    '-b:a',
    AUDIO_BITRATE,
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

async function remuxAacToM4a(inputPath, outputPath) {
  await spawnChecked(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-vn',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

async function transcodeToMp4(inputPath, outputPath) {
  await spawnChecked(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    VIDEO_CRF,
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    // Cap the height at 1080p without ever upscaling a smaller source.
    '-vf',
    `scale=w=-2:h='min(${VIDEO_MAX_HEIGHT},ih)':flags=lanczos,setsar=1`,
    '-c:a',
    'aac',
    '-b:a',
    VIDEO_AUDIO_BITRATE,
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

async function renderDeliveryJpeg(inputPath, outputPath) {
  await spawnChecked(ffmpegPath, [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-filter_complex',
    IMAGE_FILTER_COMPLEX,
    '-frames:v',
    '1',
    '-q:v',
    IMAGE_QUALITY,
    outputPath,
  ]);
}

function sourceExtension(inputPath) {
  const extension = path.extname(inputPath || '');
  return extension && /^[.a-z0-9]+$/i.test(extension) ? extension : '.source';
}

export async function handleAudioDelivery(inputPath, jobDir) {
  const outputPath = path.join(jobDir, 'audio.m4a');
  const inputProbe = await probeMedia(inputPath);

  assertAudioInput(inputProbe);
  const inputAudio = inputProbe.streams?.find((stream) => stream.codec_type === 'audio');
  const canStreamCopy = inputAudio?.codec_name === 'aac';

  // CHC Artists commonly uploads M4A/AAC. Re-encoding that audio wastes time
  // and quality for no benefit, so compatible AAC is only remuxed with
  // +faststart. This is normally several times faster than real-time.
  if (canStreamCopy) {
    await remuxAacToM4a(inputPath, outputPath);
  } else {
    await transcodeToM4a(inputPath, outputPath);
  }

  const outputProbe = await probeMedia(outputPath);
  assertM4aOutput(outputProbe);

  return {
    outputPath,
    mimeType: AUDIO_OUTPUT_MIME_TYPE,
    probe: {
      input: inputProbe,
      output: outputProbe,
      transcode: canStreamCopy
        ? {
            audioCodec: 'aac',
            mode: 'stream_copy',
            container: 'm4a',
          }
        : {
            audioCodec: 'aac',
            mode: 'encode',
            targetBitrate: AUDIO_BITRATE,
            container: 'm4a',
          },
    },
  };
}

export async function handleVideoDelivery(inputPath, jobDir) {
  const outputPath = path.join(jobDir, 'video.mp4');
  const inputProbe = await probeMedia(inputPath);

  assertVideoInput(inputProbe);
  await transcodeToMp4(inputPath, outputPath);

  const outputProbe = await probeMedia(outputPath);
  assertMp4Output(outputProbe);

  return {
    outputPath,
    mimeType: VIDEO_OUTPUT_MIME_TYPE,
    probe: {
      input: inputProbe,
      output: outputProbe,
      transcode: {
        videoCodec: 'h264',
        audioCodec: 'aac',
        crf: Number(VIDEO_CRF),
        maxHeight: VIDEO_MAX_HEIGHT,
        container: 'mp4',
      },
    },
  };
}

export async function handleImageDelivery(inputPath, jobDir) {
  const outputPath = path.join(jobDir, 'cover.jpg');
  const inputProbe = await probeMedia(inputPath);

  assertImageInput(inputProbe);
  await renderDeliveryJpeg(inputPath, outputPath);

  const outputProbe = await probeMedia(outputPath);
  assertJpegOutput(outputProbe);

  const outputStream = outputProbe.streams?.find((stream) => stream.codec_type === 'video');

  return {
    outputPath,
    mimeType: IMAGE_OUTPUT_MIME_TYPE,
    probe: {
      input: inputProbe,
      output: outputProbe,
      transcode: {
        imageCodec: 'mjpeg',
        maxEdge: IMAGE_MAX_EDGE,
        quality: Number(IMAGE_QUALITY),
        container: 'jpeg',
        width: outputStream?.width ?? null,
        height: outputStream?.height ?? null,
      },
    },
  };
}

const JOB_HANDLERS = {
  audio_delivery: handleAudioDelivery,
  video_delivery: handleVideoDelivery,
  image_delivery: handleImageDelivery,
};

export function isSupportedJobType(jobType) {
  return Object.hasOwn(JOB_HANDLERS, jobType);
}

async function runJob(config, job) {
  const handler = JOB_HANDLERS[job.job_type];

  if (!handler) {
    throw new Error(`No handler for job type ${job.job_type}`);
  }

  const jobDir = path.join(config.workDir, `chc-media-job-${job.job_id}`);
  const inputPath = path.join(jobDir, `input${sourceExtension(job.input_path)}`);

  try {
    await mkdir(jobDir, { recursive: true });
    await downloadObject(config, job.input_bucket, job.input_path, inputPath);

    const result = await handler(inputPath, jobDir);
    const outputStat = await stat(result.outputPath);
    const outputChecksum = await sha256File(result.outputPath);

    await uploadObject(
      config,
      job.output_bucket,
      job.output_path,
      result.outputPath,
      result.mimeType,
    );

    const completedRows = await callRpc(config, 'complete_media_processing_job', {
      p_worker_token: config.mediaWorkerToken,
      p_job_id: job.job_id,
      p_output_mime_type: result.mimeType,
      p_output_size_bytes: outputStat.size,
      p_output_checksum_sha256: outputChecksum,
      p_probe: result.probe,
    });

    return {
      status: 'completed',
      jobId: job.job_id,
      jobType: job.job_type,
      uploadIntentId: job.upload_intent_id,
      outputBucket: job.output_bucket,
      outputPath: job.output_path,
      outputMimeType: result.mimeType,
      outputSizeBytes: outputStat.size,
      outputChecksumSha256: outputChecksum,
      completion: completedRows[0] ?? null,
    };
  } finally {
    if (process.env.MEDIA_KEEP_WORK_DIR !== '1') {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

async function reportFailure(config, job, error) {
  const message = error instanceof Error ? error.message : String(error);

  try {
    const failedRows = await callRpc(config, 'fail_media_processing_job', {
      p_worker_token: config.mediaWorkerToken,
      p_job_id: job.job_id,
      p_error_message: message,
    });
    const failure = failedRows[0] ?? null;

    return {
      status: 'failed',
      jobId: job.job_id,
      jobType: job.job_type,
      uploadIntentId: job.upload_intent_id,
      error: message,
      // `queued` here means the job will be retried after its backoff window;
      // `failed` means it ran out of attempts and nothing will pick it up again.
      jobStatus: failure?.status ?? null,
      attemptCount: failure?.attempt_count ?? job.attempt_count ?? null,
      maxAttempts: failure?.max_attempts ?? job.max_attempts ?? null,
      retryAt: failure?.available_at ?? null,
      willRetry: failure ? failure.status === 'queued' : null,
    };
  } catch (failError) {
    return {
      status: 'fail_report_error',
      jobId: job.job_id,
      jobType: job.job_type,
      error: message,
      reportError: failError instanceof Error ? failError.message : String(failError),
    };
  }
}

/**
 * Claims one queued job and processes it.
 *
 * Returns `{ status: 'no_job' }` when the queue is empty, and never throws for a
 * job-level failure: the failure is reported back to Supabase (which decides
 * whether to retry with backoff or mark the job failed) and returned to the
 * caller so a long-running worker keeps going.
 */
export async function claimAndProcessOne(config) {
  const claimedRows = await callRpc(config, 'claim_media_processing_job', {
    p_worker_token: config.mediaWorkerToken,
    p_worker_id: config.mediaWorkerId,
  });
  const job = claimedRows[0];

  if (!job) {
    return { status: 'no_job' };
  }

  if (!isSupportedJobType(job.job_type)) {
    return reportFailure(config, job, new Error(`Unsupported job type ${job.job_type}`));
  }

  try {
    return await runJob(config, job);
  } catch (error) {
    return reportFailure(config, job, error);
  }
}
