const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadPureTypeScript(path) {
  const source = fs.readFileSync(path, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function('exports', 'module', outputText)(module.exports, module);
  return module.exports;
}

const { resolveDocumentRestore, visibleDocumentSectionIds } =
  loadPureTypeScript('src/utils/sectionRestore.ts');

test('every settings change returns to the START of the same surviving hymn', () => {
  const original = ['opening', 'psalm', 'gospel', 'closing'];
  assert.deepEqual(
    resolveDocumentRestore(original, 'gospel', ['opening', 'psalm', 'gospel', 'closing']),
    { sectionId: 'gospel', edge: 'start' },
  );
});

test('a removed hymn lands at the END of the nearest preceding survivor', () => {
  const original = ['opening', 'seasonal-a', 'seasonal-b', 'agios', 'closing'];
  assert.deepEqual(
    resolveDocumentRestore(original, 'seasonal-b', ['opening', 'seasonal-a', 'agios', 'closing']),
    { sectionId: 'seasonal-a', edge: 'end' },
  );
  assert.deepEqual(
    resolveDocumentRestore(original, 'seasonal-b', ['opening', 'agios', 'closing']),
    { sectionId: 'opening', edge: 'end' },
  );
});

test('do not jump to a following hymn when an earlier one survives', () => {
  assert.deepEqual(
    resolveDocumentRestore(['first', 'missing', 'last'], 'missing', ['first', 'last']),
    { sectionId: 'first', edge: 'end' },
  );
});

test('the first hymn disappearing falls back to the new start; empty documents have no target', () => {
  assert.deepEqual(resolveDocumentRestore(['first', 'last'], 'first', ['last']), {
    sectionId: 'last', edge: 'start',
  });
  assert.equal(resolveDocumentRestore(['first'], 'first', []), null);
});

test('visibility matches silent prayer, bishop, and Gospel Rite filters', () => {
  const sections = [
    { id: 'ordinary' },
    { id: 'silent', titlePrayerType: 'Silent Prayer' },
    { id: 'bishop', bishopOnly: true },
    { id: 'priest', priestOnly: true },
    { id: 'coptic-rite', copticGospelRiteOnly: true },
    { id: 'standard-rite', nonCopticGospelRiteOnly: true },
  ];
  const visible = visibleDocumentSectionIds(sections, {
    displaySilentPrayers: false, bishopPresent: false, copticGospelRite: false,
  });
  assert.deepEqual(visible, ['ordinary', 'priest', 'standard-rite']);
  const updated = visibleDocumentSectionIds(sections, {
    displaySilentPrayers: true, bishopPresent: true, copticGospelRite: true,
  });
  assert.deepEqual(updated, ['ordinary', 'silent', 'bishop', 'coptic-rite']);
  assert.deepEqual(
    resolveDocumentRestore(sections.map(s => s.id), 'silent', visible),
    { sectionId: 'ordinary', edge: 'end' },
  );
});

test('a frozen snapshot survives multiple settings/date changes and is cleared only for its transaction', () => {
  const {
    captureDocumentRestore, getPendingDocumentRestore, markPendingDocumentRestoresDirty,
    clearPendingDocumentRestore,
  } = loadPureTypeScript('src/utils/lastDocumentPosition.ts');
  captureDocumentRestore('vespers', 'old-hymn', ['intro', 'old-hymn', 'closing'], 'original');
  markPendingDocumentRestoresDirty();
  captureDocumentRestore('vespers', 'wrong-after-reflow', ['wrong-after-reflow'], 'updated');
  markPendingDocumentRestoresDirty();
  const pending = getPendingDocumentRestore('vespers');
  assert.equal(pending.sectionId, 'old-hymn');
  assert.deepEqual(pending.originalSectionIds, ['intro', 'old-hymn', 'closing']);
  assert.equal(pending.signature, 'original');
  assert.equal(pending.revision, 2);
  clearPendingDocumentRestore('vespers', pending.sequence + 1);
  assert.ok(getPendingDocumentRestore('vespers'));
  clearPendingDocumentRestore('vespers', pending.sequence);
  assert.equal(getPendingDocumentRestore('vespers'), undefined);
});

test('native, iframe, and slideshow implement the two distinct target edges', () => {
  const html = fs.readFileSync('src/components/chc/documentHtml.ts', 'utf8');
  const native = fs.readFileSync('src/components/chc/DocumentWebView.tsx', 'utf8');
  const web = fs.readFileSync('src/components/chc/DocumentWebView.web.tsx', 'utf8');
  const slides = fs.readFileSync('src/components/chc/SlideshowContainer.js', 'utf8');
  const surface = fs.readFileSync('src/components/chc/DocumentSurface.tsx', 'utf8');
  const reader = fs.readFileSync('src/components/chc/screens/ServiceDocument.tsx', 'utf8');
  assert.match(html, /targetEdge === 'end'/);
  assert.match(html, /getBoundingClientRect\(\)\.bottom/);
  assert.match(native, /restoreRequest\?\.token/);
  assert.match(web, /restoreRequest\?\.token/);
  assert.match(slides, /edge === 'end' \|\| targetSlideIndex < 0/);
  assert.match(slides, /lastAppliedRestoreTokenRef/);
  assert.match(surface, /restoreRequest=\{restoreRequest\}/);
  assert.match(reader, /captureDocumentRestore\(/);
  assert.match(reader, /resolveDocumentRestore\(/);
});
