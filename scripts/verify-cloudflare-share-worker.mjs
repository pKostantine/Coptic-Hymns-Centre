import { readFile } from 'node:fs/promises';

const requiredRoutes = [
  '/share/*',
  '/__share-image',
  '/music/artist/*',
  '/music/release/*',
  '/music/track/*',
];

const [worker, routesSource] = await Promise.all([
  readFile(new URL('../dist/_worker.js', import.meta.url), 'utf8'),
  readFile(new URL('../dist/_routes.json', import.meta.url), 'utf8'),
]);
const routes = JSON.parse(routesSource);

for (const marker of ['X-CHC-Share-Preview', '/__share-image', 'get_share_preview', 'Content-Profile']) {
  if (!worker.includes(marker)) {
    throw new Error(`Cloudflare share worker is missing required marker: ${marker}`);
  }
}

for (const route of requiredRoutes) {
  if (!routes.include?.includes(route)) {
    throw new Error(`Cloudflare route manifest is missing: ${route}`);
  }
}

console.log('Verified dynamic entity share worker in dist.');
