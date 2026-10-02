const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadBuilder() {
  let source = fs.readFileSync('src/components/vine/bibleDocumentHtml.ts', 'utf8');
  source = source
    .replace(
      "import { COLORS } from '../../constants/theme';",
      "const COLORS = { white: '#fff', border: '#222', gold: '#ca2', priest: '#d45', refrain: '#8d9' };",
    )
    .replace(
      "import { formatEnglishDisplayText } from '../../utils/displayText';",
      "const formatEnglishDisplayText = (value) => String(value || '');",
    );
  // The builder's local imports: the shared highlighting layer and numerals.
  const localModules = {
    './textHighlights': evaluateModule(fs.readFileSync('src/components/vine/textHighlights.ts', 'utf8'), 'textHighlights.ts', require),
    '../../utils/bibleNumerals': evaluateModule(fs.readFileSync('src/utils/bibleNumerals.ts', 'utf8'), 'bibleNumerals.ts', require),
  };
  const localRequire = (name) => localModules[name] || require(name);
  return evaluateModule(source, 'bibleDocumentHtml.ts', localRequire).buildBibleChapterHtml;
}

function evaluateModule(source, filename, moduleRequire) {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    moduleRequire,
    moduleObject,
    filename,
    process.cwd(),
  );
  return moduleObject.exports;
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
  // The CSS pixel font size is the same after rotation; only the page budget
  // and line wrapping change. Disable mobile browser text inflation in WebView.
  assert.match(html, /-webkit-text-size-adjust:\s*none/);
  assert.match(html, /text-size-adjust:\s*none/);
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

test('Bible reading view highlights by stored chapter and verse, and offers Copy', () => {
  const buildBibleChapterHtml = loadBuilder();
  const html = buildBibleChapterHtml({
    verses: [{
      verseNumber: 1,
      sourceChapter: 9,
      sourceVerse: 22,
      english: 'Why, O Lord, do You stand afar off?',
      englishNkjv: '',
      englishFromCoptic: '',
      coptic: '',
      greek: '',
      arabic: 'يَا رَبُّ',
      arabicFromCoptic: '',
      french: '',
    }],
    languageKeys: ['english', 'arabic'],
    fontSize: 18,
    copticFontDataUri: 'data:font/ttf;base64,AA==',
    selectText: true,
    highlighting: true,
    highlightLabels: { copy: 'Copy', remove: 'Remove' },
    copyReference: { english: 'Psalm 10', arabic: 'مزمور ١٠', coptic: 'Ⲯⲁⲗⲙⲟⲥ ⲓ̅' },
  });
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 2);
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
  // A masoretic Psalm verse anchors to the Septuagint chapter:verse it is stored under.
  assert.match(html, /data-sermon-verse-id="9:22" data-sermon-language="english"/);
  assert.match(html, /data-sermon-verse-id="9:22" data-sermon-language="arabic"/);
  assert.match(html, /"copy":"copyBibleText"/);
  assert.match(html, /addAction\('copy', "Copy"\)/);
  assert.match(html, /window\.__vineBiblePost = post/);
  // Copy — the toolbar's and the system's — is signed with the chapter. The
  // toolbar writes it through the page's copy command, and the host only when
  // that is refused.
  assert.match(html, /var copyReference = \{"english":"Psalm 10","arabic":"مزمور ١٠","coptic":"Ⲯⲁⲗⲙⲟⲥ ⲓ̅"\}/);
  // A copy is the reader's base size whatever the column's own size.
  assert.match(html, /'font-size': '18px'/);
  assert.match(html, /window\.__vineBibleCopyPayload = bibleCopyPayload/);
  assert.match(html, /var build = window\.__vineBibleCopyPayload;/);
  assert.match(html, /pendingCopy = payload;[\s\S]*?document\.execCommand\('copy'\);[\s\S]*?if \(!copyWritten && ACTIONS\.copy\) emit\(ACTIONS\.copy, payload\)/);
  // A phone's tap clears the live selection before a click: the toolbar takes
  // the touch itself and acts on the selection it kept.
  assert.match(html, /palette\.addEventListener\('touchstart', function \(event\) \{\s*paletteTouch = [^;]+;\s*if \(event\.cancelable\) event\.preventDefault\(\);/);
  assert.match(html, /palette\.addEventListener\('touchend'[\s\S]*?pressPaletteButton\(released\)/);
  assert.match(html, /function commitSelection\(color\) \{\s*var selection = selectionForToolbar\(\);/);
  // …and appears for a selection made with a long press, which never lifts a finger on the page.
  assert.match(html, /showTimer = setTimeout\(function \(\) \{ showPaletteForSelection\(false\); \}, 300\)/);
  const route = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');
  assert.match(route, /getBibleChapterReferences\(book, bookKey, currentChapterNumber\)/);
  assert.match(route, /writeRichClipboard\(action\.text, action\.html\)/);

  const slideshow = buildBibleChapterHtml({
    verses: [{ verseNumber: 1, english: 'In the beginning', englishNkjv: '', englishFromCoptic: '', coptic: '', greek: '', arabic: '', arabicFromCoptic: '', french: '' }],
    languageKeys: ['english'],
    fontSize: 18,
    copticFontDataUri: 'data:font/ttf;base64,AA==',
    isSlideshow: true,
    highlighting: true,
  });
  assert.doesNotMatch(slideshow, /sermon-annotatable-text"/);
});
