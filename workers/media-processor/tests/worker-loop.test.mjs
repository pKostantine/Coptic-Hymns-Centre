import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';

const workerEntry = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'worker.mjs',
);

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('error', reject);
    request.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

/**
 * Stands in for Supabase: `handlers` maps an RPC name to a function returning
 * either rows or `{ status, rows }` for an error response.
 */
async function startFakeSupabase(handlers) {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const name = request.url.replace('/rest/v1/rpc/', '');
    const payload = await readBody(request);
    calls.push({ name, payload });

    const handler = handlers[name];

    if (!handler) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ message: `no handler for ${name}` }));
      return;
    }

    const result = await handler(payload, calls);
    const status = result?.status ?? 200;
    const rows = result?.rows ?? result;

    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(rows));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function startWorker(supabaseUrl, env = {}) {
  const child = spawn(process.execPath, [workerEntry], {
    env: {
      ...process.env,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
      MEDIA_WORKER_TOKEN: 'test-worker-token',
      MEDIA_WORKER_ID: 'test-worker',
      MEDIA_POLL_INTERVAL_MS: '100',
      MEDIA_ERROR_BACKOFF_MS: '50',
      MEDIA_MAX_ERROR_BACKOFF_MS: '200',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const lines = [];
  let buffer = '';

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const parts = buffer.split('\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      if (part.trim()) {
        lines.push(JSON.parse(part));
      }
    }
  });

  return { child, lines };
}

function waitFor(predicate, { timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('Timed out waiting for worker output'));
      }
    }, 25);
  });
}

function stopWorker(child) {
  return new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
    child.kill('SIGTERM');
  });
}

describe('worker loop', () => {
  it('drains the queue, keeps running after job failures, then polls', async () => {
    const queued = [
      {
        job_id: '11111111-1111-4111-8111-111111111111',
        upload_intent_id: '22222222-2222-4222-8222-222222222222',
        job_type: 'metadata_probe',
        attempt_count: 1,
        max_attempts: 3,
        input_bucket: 'chc-submissions',
        input_path: 'a.bin',
        output_bucket: 'chc-music',
        output_path: 'out/a',
      },
      {
        job_id: '33333333-3333-4333-8333-333333333333',
        upload_intent_id: '44444444-4444-4444-8444-444444444444',
        job_type: 'metadata_probe',
        attempt_count: 1,
        max_attempts: 3,
        input_bucket: 'chc-submissions',
        input_path: 'b.bin',
        output_bucket: 'chc-music',
        output_path: 'out/b',
      },
    ];

    const supabase = await startFakeSupabase({
      claim_media_processing_job: () => (queued.length ? [queued.shift()] : []),
      fail_media_processing_job: (payload) => [{
        job_id: payload.p_job_id,
        status: 'queued',
        attempt_count: 1,
        max_attempts: 3,
        available_at: '2026-01-01T00:00:00Z',
        error_message: payload.p_error_message,
      }],
    });

    const { child, lines } = startWorker(supabase.url);

    try {
      await waitFor(() => lines.filter((line) => line.status === 'failed').length === 2);

      const failures = lines.filter((line) => line.status === 'failed');
      assert.deepEqual(
        failures.map((failure) => failure.jobId),
        [
          '11111111-1111-4111-8111-111111111111',
          '33333333-3333-4333-8333-333333333333',
        ],
      );
      assert.match(failures[0].error, /Unsupported job type metadata_probe/);
      assert.equal(failures[0].willRetry, true);
      assert.equal(failures[0].retryAt, '2026-01-01T00:00:00Z');

      // Both jobs were claimed back to back, without an idle wait in between.
      const claimsBeforeDrain = supabase.calls.filter(
        (call) => call.name === 'claim_media_processing_job',
      ).length;
      assert.ok(claimsBeforeDrain >= 3, `expected the queue to be drained, saw ${claimsBeforeDrain} claims`);

      // And the worker keeps polling an empty queue instead of exiting.
      const claimsAtDrain = supabase.calls.filter(
        (call) => call.name === 'claim_media_processing_job',
      ).length;
      await waitFor(() => supabase.calls.filter(
        (call) => call.name === 'claim_media_processing_job',
      ).length > claimsAtDrain);

      const claim = supabase.calls.find((call) => call.name === 'claim_media_processing_job');
      assert.equal(claim.payload.p_worker_token, 'test-worker-token');
      assert.equal(claim.payload.p_worker_id, 'test-worker');

      const exit = await stopWorker(child);
      assert.equal(exit.code, 0);
      assert.ok(lines.some((line) => line.status === 'worker_stopped'));
    } finally {
      child.kill('SIGKILL');
      await supabase.close();
    }
  });

  it('backs off and recovers when the queue is unreachable', async () => {
    let failClaims = 3;

    const supabase = await startFakeSupabase({
      claim_media_processing_job: () => {
        if (failClaims > 0) {
          failClaims -= 1;
          return { status: 500, rows: { message: 'database unavailable' } };
        }

        return [];
      },
    });

    const { child, lines } = startWorker(supabase.url);

    try {
      await waitFor(() => lines.filter((line) => line.status === 'queue_unavailable').length === 3);

      const outages = lines.filter((line) => line.status === 'queue_unavailable');
      assert.deepEqual(outages.map((outage) => outage.retryInMs), [50, 100, 200]);
      assert.match(outages[0].error, /database unavailable/);

      // Once the queue answers again the worker returns to normal polling.
      const claimsAfterOutage = supabase.calls.length;
      await waitFor(() => supabase.calls.length > claimsAfterOutage + 1);
      assert.equal(lines.filter((line) => line.status === 'queue_unavailable').length, 3);

      const exit = await stopWorker(child);
      assert.equal(exit.code, 0);
    } finally {
      child.kill('SIGKILL');
      await supabase.close();
    }
  });
});
