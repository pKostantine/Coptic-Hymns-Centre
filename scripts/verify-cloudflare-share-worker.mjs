import { access, readFile } from 'node:fs/promises';

const requiredRoutes = [
  '/share/*',
  '/__share-image',
  '/music/artist/*',
  '/music/playlist/*',
  '/music/release/*',
  '/music/track/*',
  '/learn/cantor/*',
  '/learn/album/*',
  '/learn/lesson/*',
];

const [worker, configSource, appShell] = await Promise.all([
  readFile(new URL('../workers/web-app/src/index.js', import.meta.url), 'utf8'),
  readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
]);
const config = JSON.parse(configSource);

if (!appShell.includes('CHC_SHARE_META_START')) {
  throw new Error('Expo app shell is missing the replaceable share metadata block.');
}

for (const marker of ['X-CHC-Share-Preview', '/__share-image', 'get_share_preview', 'Content-Profile']) {
  if (!worker.includes(marker)) {
    throw new Error(`Cloudflare share worker is missing required marker: ${marker}`);
  }
}

for (const route of requiredRoutes) {
  if (!config.assets?.run_worker_first?.includes(route)) {
    throw new Error(`Cloudflare Worker-first routes are missing: ${route}`);
  }
}

if (config.main !== './workers/web-app/src/index.js') {
  throw new Error('Wrangler main must point to the web app Worker entry point.');
}

if (
  config.assets?.directory !== './dist'
  || config.assets?.binding !== 'ASSETS'
  || config.assets?.not_found_handling !== 'single-page-application'
) {
  throw new Error('Wrangler static asset configuration is incomplete.');
}

for (const pagesArtifact of ['../dist/_worker.js', '../dist/_routes.json']) {
  try {
    await access(new URL(pagesArtifact, import.meta.url));
  } catch (error) {
    if (error?.code === 'ENOENT') continue;
    throw error;
  }
  throw new Error(`Pages-only artifact must not be uploaded by Workers: ${pagesArtifact}`);
}

console.log('Verified Workers Static Assets and dynamic entity share routes.');
