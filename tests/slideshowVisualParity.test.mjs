import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const [verseBlock, slideshow, layout, documentHtml, bibleHtml] = await Promise.all([
  readFile(new URL('../src/components/chc/VerseBlock.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/chc/SlideshowContainer.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/chc/slideshowLayout.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/chc/documentHtml.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/chc/bibleDocumentHtml.ts', import.meta.url), 'utf8'),
]);

test('scroll and slideshow consume the same document visual metrics', () => {
  assert.match(documentHtml, /getDocumentVisualMetrics/);
  assert.match(documentHtml, /DOCUMENT_CONTROL_GEOMETRY/);
  assert.match(layout, /getDocumentVisualMetrics/);
  assert.match(layout, /DOCUMENT_CONTROL_GEOMETRY/);
  assert.match(slideshow, /DOCUMENT_CONTROL_GEOMETRY/);
});

test('slideshow verse styling uses the scroll reader palette and rubric rules', () => {
  assert.match(verseBlock, /\? COLORS\.silent/);
  assert.match(verseBlock, /\? COLORS\.refrain/);
  assert.match(verseBlock, /COLORS\.metropolitanBrackets/);
  assert.match(verseBlock, /refrain: "Refrain:"/);
  assert.match(verseBlock, /refrain: "قرار:"/);
  assert.match(verseBlock, /refrain: COLORS\.refrain/);

  assert.doesNotMatch(verseBlock, /#9FFFD0/);
  assert.doesNotMatch(verseBlock, /#C5CBD2/);
});

test('scripture numbers match scroll mode emphasis and do not justify away from verse text', () => {
  assert.match(documentHtml, /\.bible-verse-number \{ color: \$\{COLORS\.gold\}; font-weight: 700; \}/);
  assert.match(verseBlock, /color: COLORS\.gold, fontWeight: "700"/);
  assert.match(verseBlock, /"\\u2005"/);
});

test('slideshow controls keep the scroll reader geometry', () => {
  assert.match(slideshow, /DOCUMENT_CONTROL_GEOMETRY\.subdocument\.minHeight/);
  assert.match(slideshow, /DOCUMENT_CONTROL_GEOMETRY\.hyperlink\.minHeight/);
  assert.match(slideshow, /DOCUMENT_CONTROL_GEOMETRY\.gospelRite\.marginBottom/);
  assert.match(slideshow, /flexDirection: "row"/);
});

test('Bible slideshow preserves the scrolling reader verse-row decoration', () => {
  assert.doesNotMatch(bibleHtml, /\.slide-page \.verse-row\s*\{\s*border-bottom:\s*0/);
  assert.match(bibleHtml, /font-weight: 700/);
});
