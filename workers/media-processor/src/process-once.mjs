import { claimAndProcessOne, getConfig } from './processor.mjs';

const config = getConfig();

claimAndProcessOne(config)
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));

    // A one-shot run still exits non-zero on a job failure so a CI or manual
    // invocation notices, even though the queue itself has already been told.
    if (result.status === 'failed' || result.status === 'fail_report_error') {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(JSON.stringify({
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  });
