/**
 * Rebuilds public/coptic-vine-share.png, the image WhatsApp, iMessage and the
 * rest show when a Coptic Vine link is pasted into a chat.
 *
 * Run it after the seal changes:  node scripts/build-share-card.mjs
 *
 * The constraints the card is built to, which are why it is not simply the
 * seal file served directly:
 *  - 1200x630 is the Open Graph size both WhatsApp and Apple render as a wide
 *    banner. A square image gets a small thumbnail tile in WhatsApp instead.
 *  - No alpha. The seal's corners are transparent, and clients disagree about
 *    what to put behind them — some black, some white.
 *  - Small. WhatsApp gives up on images past a few hundred KB, and the seal on
 *    its own is ~790KB.
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const WIDTH = 1200;
const HEIGHT = 630;
/** Leaves a margin top and bottom while keeping the seal the whole subject. */
const SEAL = 520;
const SOURCE = new URL('../assets/images/coptic-vine-seal.png', import.meta.url);
const OUTPUT = new URL('../public/coptic-vine-share.png', import.meta.url);

const background = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="46%" r="62%">
      <stop offset="0%" stop-color="#1D4424"/>
      <stop offset="55%" stop-color="#14301B"/>
      <stop offset="100%" stop-color="#0A1A0F"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>
</svg>`);

const seal = await sharp(await readFile(SOURCE))
  .resize(SEAL, SEAL, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .toBuffer();

const card = await sharp(background)
  .composite([{ input: seal, top: Math.round((HEIGHT - SEAL) / 2), left: Math.round((WIDTH - SEAL) / 2) }])
  .flatten({ background: '#14301B' })
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toBuffer();

const sizeKb = card.length / 1024;
if (sizeKb > 300) {
  throw new Error(`Share card is ${sizeKb.toFixed(0)}KB; WhatsApp may skip it. Lower the palette quality.`);
}

await writeFile(OUTPUT, card);
console.log(`Wrote public/coptic-vine-share.png — ${WIDTH}x${HEIGHT}, ${sizeKb.toFixed(0)}KB`);
