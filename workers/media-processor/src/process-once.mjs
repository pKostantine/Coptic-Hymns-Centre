import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const AUDIO_OUTPUT_MIME_TYPE = 'audio/mp4';
const AUDIO_BITRATE = '256k';

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function getConfig() {
  return {
    supabaseUrl: requireEnv('SUPABASE_URL').replace(/\/+$/, ''),
    supabasePublishableKey: requireEnv('SUPABASE_PUBLISHABLE_KEY'),
    mediaWorkerToken: requireEnv('MEDIA_WORKER_TOKEN'),
    mediaWorkerId: process.env.MEDIA_WORKER_ID || `media-processor-${process.pid}`,
    r2Driver: process.env.R2_DRIVER || 'wrangler',
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
    await import('node:fs/promises').then(({ writeFile }) => writeFile(destinationPath, data));
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

function sourceExtension(inputPath) {
  const extension = path.extname(inputPath);
  return extension && /^[.a-z0-9]+$/i.test(extension) ? extension : '.source';
}

async function processOne() {
  const config = getConfig();
  const claimedRows = await callRpc(config, 'claim_media_processing_job', {
    p_worker_token: config.mediaWorkerToken,
    p_worker_id: config.mediaWorkerId,
  });
  const job = claimedRows[0];

  if (!job) {
    console.log(JSON.stringify({ status: 'no_job' }));
    return;
  }

  const jobDir = path.join(config.workDir, `chc-media-job-${job.job_id}`);
  const inputPath = path.join(jobDir, `input${sourceExtension(job.input_path)}`);
  const outputPath = path.join(jobDir, 'audio.m4a');

  try {
    await mkdir(jobDir, { recursive: true });
    await downloadObject(config, job.input_bucket, job.input_path, inputPath);

    const inputProbe = await probeMedia(inputPath);
    assertAudioInput(inputProbe);

    await transcodeToM4a(inputPath, outputPath);

    const outputProbe = await probeMedia(outputPath);
    assertM4aOutput(outputProbe);

    const outputStat = await stat(outputPath);
    const outputChecksum = await sha256File(outputPath);

    await uploadObject(config, job.output_bucket, job.output_path, outputPath, AUDIO_OUTPUT_MIME_TYPE);

    const completedRows = await callRpc(config, 'complete_media_processing_job', {
      p_worker_token: config.mediaWorkerToken,
      p_job_id: job.job_id,
      p_output_mime_type: AUDIO_OUTPUT_MIME_TYPE,
      p_output_size_bytes: outputStat.size,
      p_output_checksum_sha256: outputChecksum,
      p_probe: {
        input: inputProbe,
        output: outputProbe,
        transcode: {
          audioCodec: 'aac',
          targetBitrate: AUDIO_BITRATE,
          container: 'm4a',
        },
      },
    });

    console.log(JSON.stringify({
      status: 'completed',
      jobId: job.job_id,
      uploadIntentId: job.upload_intent_id,
      outputBucket: job.output_bucket,
      outputPath: job.output_path,
      outputSizeBytes: outputStat.size,
      outputChecksumSha256: outputChecksum,
      completion: completedRows[0],
    }, null, 2));
  } catch (error) {
    await callRpc(config, 'fail_media_processing_job', {
      p_worker_token: config.mediaWorkerToken,
      p_job_id: job.job_id,
      p_error_message: error instanceof Error ? error.message : String(error),
    }).catch((failError) => {
      console.error(JSON.stringify({
        status: 'fail_report_error',
        jobId: job.job_id,
        error: failError instanceof Error ? failError.message : String(failError),
      }));
    });
    throw error;
  } finally {
    if (process.env.MEDIA_KEEP_WORK_DIR !== '1') {
      await rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

processOne().catch((error) => {
  console.error(JSON.stringify({
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
