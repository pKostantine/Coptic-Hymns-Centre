const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadBuilder() {
  let source = fs.readFileSync('src/components/chc/bibleDocumentHtml.ts', 'utf8');
  source = source
    .replace(
      "import { COLORS } from '../../constants/theme';",
      "const COLORS = { white: '#fff', border: '#222', gold: '#ca2', priest: '#d45', refrain: '#8d9' };",
    )
    .replace(
      "import { formatEnglishDisplayText } from '../../utils/displayText';",
      "const formatEnglishDisplayText = (value) => String(value || '');",
    );
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    require,
    moduleObject,
    'bibleDocumentHtml.ts',
    process.cwd(),
  );
  return moduleObject.exports.buildBibleChapterHtml;
}

test('Bible slideshow emits valid presentation JavaScript and max-size safeguards', () => {
  const buildBibleChapterHtml = loadBuilder();
  const html = buildBibleChapterHtml({
    verses: [{
      verseNumber: 1,
      english: 'In the beginning',
      englishNkjv: '',
      englishFromCoptic: '',
      coptic: 'ⲁ̅ ⲃ̅',
      greek: '',
      arabic: 'فِي الْبَدْءِ',
      arabicFromCoptic: '',
      french: '',
    }],
    languageKeys: ['english', 'coptic', 'arabic'],
    fontSize: 78,
    copticFontDataUri: 'data:font/ttf;base64,AA==',
    isSlideshow: true,
    bottomContentInset: 0,
  });
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /height: 100dvh/);
  assert.match(html, /data-segment-progress/);
  assert.match(html, /document\.fonts\.ready/);
  assert.match(html, /PageDown/);
  assert.match(html, /suppressClickUntil/);
  assert.match(html, /font-weight: 700/);
  assert.match(html, /bottom\) \+ 0px/);
  assert.match(html, /page\.style\.display = isCurrent \? 'block' : 'none'/);
  assert.doesNotMatch(html, /width: max-content/);
  assert.match(html, /initialPaginationDone/);
  assert.match(html, /resizeTimer = setTimeout/);
});

test('Bible slideshow route excludes the Now Playing overlay from pagination', () => {
  const route = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');
  assert.match(route, /bottomContentInset:\s*preferences\.slideshowMode\s*\?\s*0\s*:\s*nowPlayingInset/);
});
