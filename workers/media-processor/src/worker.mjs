import { claimAndProcessOne, getConfig } from './processor.mjs';
import { startAdminServer } from './admin-server.mjs';

// Keep the queue feeling immediate for creator uploads. One second is short
// enough that a completed upload is normally claimed before the artist has
// finished entering the rest of the submission metadata.
const IDLE_POLL_MS = Number(process.env.MEDIA_POLL_INTERVAL_MS || 1000);
// Backoff applied when the queue itself is unreachable (Supabase down, network
// blip), so a broken dependency does not turn into a request flood.
const MIN_ERROR_BACKOFF_MS = Number(process.env.MEDIA_ERROR_BACKOFF_MS || 5000);
const MAX_ERROR_BACKOFF_MS = Number(process.env.MEDIA_MAX_ERROR_BACKOFF_MS || 300000);

let shuttingDown = false;
let wakeUp = null;
let adminServer = null;

function log(payload) {
  console.log(JSON.stringify({ at: new Date().toISOString(), ...payload }));
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      wakeUp = null;
      resolve();
    }, durationMs);

    // Let a shutdown signal cut the idle wait short instead of holding the
    // container open for a full poll interval.
    wakeUp = () => {
      clearTimeout(timer);
      wakeUp = null;
      resolve();
    };
  });
}

function requestShutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  log({ status: 'shutdown_requested', signal });
  adminServer?.close();
  wakeUp?.();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => requestShutdown(signal));
}

async function main() {
  const config = getConfig();
  let consecutiveQueueErrors = 0;

  adminServer = startAdminServer(config, { onLog: log });

  log({
    status: 'worker_started',
    workerId: config.mediaWorkerId,
    r2Driver: config.r2Driver,
    idlePollMs: IDLE_POLL_MS,
  });

  while (!shuttingDown) {
    let result;

    try {
      result = await claimAndProcessOne(config);
      consecutiveQueueErrors = 0;
    } catch (error) {
      // claimAndProcessOne only throws when the queue could not be reached at
      // all; job-level failures come back as a result.
      consecutiveQueueErrors += 1;

      const backoffMs = Math.min(
        MIN_ERROR_BACKOFF_MS * 2 ** (consecutiveQueueErrors - 1),
        MAX_ERROR_BACKOFF_MS,
      );

      log({
        status: 'queue_unavailable',
        error: error instanceof Error ? error.message : String(error),
        consecutiveErrors: consecutiveQueueErrors,
        retryInMs: backoffMs,
      });

      await sleep(backoffMs);
      continue;
    }

    if (result.status === 'no_job') {
      await sleep(IDLE_POLL_MS);
      continue;
    }

    log(result);
    // Keep claiming while there is work: only an empty queue pauses the loop.
  }

  log({ status: 'worker_stopped' });
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'fatal',
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
