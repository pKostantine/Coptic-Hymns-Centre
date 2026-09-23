import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  classifyReadingDevice,
  DEFAULT_READING_FONT_LEVEL,
  migrateReadingFontLevel,
  readingFontSizeForLevel,
  READING_FONT_SIZES,
} from '../src/utils/readingFontSize.js';

test('the 1-10 tables use the approved phone, tablet, and desktop sizes', () => {
  assert.equal(DEFAULT_READING_FONT_LEVEL, 5);
  assert.deepEqual(READING_FONT_SIZES.phone, [14, 16, 17, 19, 20, 23, 26, 30, 34, 38]);
  assert.deepEqual(READING_FONT_SIZES.tablet, [16, 18, 20, 22, 24, 27, 30, 34, 38, 44]);
  assert.deepEqual(READING_FONT_SIZES.desktop, [16, 18, 20, 22, 24, 27, 30, 34, 38, 44]);
  assert.equal(readingFontSizeForLevel(5, 'phone'), 20);
  assert.equal(readingFontSizeForLevel(5, 'tablet'), 24);
  assert.equal(readingFontSizeForLevel(5, 'desktop'), 24);
});

test('device classification and level size are invariant through rotation', () => {
  const portrait = classifyReadingDevice({
    platform: 'android',
    deviceType: 0,
    osName: 'Android',
    screenWidth: 390,
    screenHeight: 844,
  });
  const landscape = classifyReadingDevice({
    platform: 'android',
    deviceType: 0,
    osName: 'Android',
    screenWidth: 844,
    screenHeight: 390,
  });

  assert.equal(portrait, 'phone');
  assert.equal(landscape, 'phone');
  assert.equal(readingFontSizeForLevel(5, portrait), 20);
  assert.equal(readingFontSizeForLevel(5, landscape), 20);
  assert.equal(classifyReadingDevice({
    platform: 'ios',
    deviceType: 0,
    osName: 'iPadOS',
    screenWidth: 1024,
    screenHeight: 768,
  }), 'tablet');
  assert.equal(classifyReadingDevice({
    platform: 'web',
    deviceType: 3,
    osName: 'Windows',
    screenWidth: 390,
    screenHeight: 844,
  }), 'desktop');
});

test('old font preferences migrate by nearest rendered size', () => {
  assert.equal(migrateReadingFontLevel(2, 20, 'phone'), 6);
  assert.equal(migrateReadingFontLevel(2, 20, 'tablet'), 5);
  assert.equal(migrateReadingFontLevel(1, undefined, 'phone'), 6);
  assert.equal(migrateReadingFontLevel(1, undefined, 'tablet'), 5);
  assert.equal(migrateReadingFontLevel(20, 20, 'phone'), 10);
  assert.equal(migrateReadingFontLevel(5, 10, 'phone'), 5);
});

test('every CHC reading renderer receives the same base-size calculation', () => {
  const surface = fs.readFileSync('src/components/chc/DocumentSurface.tsx', 'utf8');
  const bible = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');

  assert.match(surface, /const fontSize = fontScaleToPx\(preferences\.fontScale\);/);
  assert.match(bible, /const fontSize = fontScaleToPx\(preferences\.fontScale\);/);
  assert.doesNotMatch(surface, /fontScaleMultiplier|fontSize\s*=\s*[^;]*(?:screenWidth|screenHeight)/);
});
