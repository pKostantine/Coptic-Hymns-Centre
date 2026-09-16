const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadHelpers() {
  const source = fs.readFileSync('src/utils/synchronizedLyrics.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    require,
    moduleObject,
    'synchronizedLyrics.ts',
    process.cwd(),
  );
  return moduleObject.exports;
}

test('LRC timestamps parse and format with millisecond precision', () => {
  const { formatLrcTimestamp, parseLrcTimestamp } = loadHelpers();

  assert.equal(parseLrcTimestamp('[01:02.345]'), 62345);
  assert.equal(parseLrcTimestamp('01:02.34'), 62340);
  assert.equal(parseLrcTimestamp('[00:03.5]'), 3500);
  assert.equal(formatLrcTimestamp(62345), '[01:02.345]');
});

test('LRC import keeps multiple timestamps and sorts into canonical sequence order', () => {
  const { parseLrc } = loadHelpers();

  const lines = parseLrc([
    '[00:05.000]Third',
    '[00:01.000][00:03.000]Repeated',
    '[ar:Ignored metadata]',
  ].join('\n'));

  assert.deepEqual(lines.map((line) => [line.sequence, line.startMs, line.text]), [
    [1, 1000, 'Repeated'],
    [2, 3000, 'Repeated'],
    [3, 5000, 'Third'],
  ]);
});

test('plain pasted lyrics become editable draft lines', () => {
  const { applyLyricLineTimestamp, createLyricLinesFromText, renumberLyricLines } = loadHelpers();

  const draftLines = createLyricLinesFromText(' Alpha \n\nBeta\nGamma ');
  assert.deepEqual(draftLines.map((line) => [line.sequence, line.startMs, line.text]), [
    [1, null, 'Alpha'],
    [2, null, 'Beta'],
    [3, null, 'Gamma'],
  ]);

  const reordered = renumberLyricLines([draftLines[2], draftLines[0]]);
  assert.deepEqual(reordered.map((line) => [line.sequence, line.text]), [
    [1, 'Gamma'],
    [2, 'Alpha'],
  ]);

  assert.equal(applyLyricLineTimestamp(draftLines, 2, 1200)[1].startMs, 1200);
});

test('active lyric selection follows playback position and line boundaries', () => {
  const { findActiveLyricLineIndex, getActiveLyricLine } = loadHelpers();

  const lines = [
    { sequence: 1, startMs: 0, endMs: null, text: 'Alpha' },
    { sequence: 2, startMs: 1200, endMs: 2500, text: 'Beta' },
    { sequence: 3, startMs: 2500, endMs: null, text: 'Gamma' },
  ];

  assert.equal(findActiveLyricLineIndex(lines, 0), 0);
  assert.equal(findActiveLyricLineIndex(lines, 1199), 0);
  assert.equal(findActiveLyricLineIndex(lines, 1200), 1);
  assert.equal(findActiveLyricLineIndex(lines, 2500), 2);
  assert.equal(getActiveLyricLine(lines, 3000).text, 'Gamma');
});

test('LRC export omits untimed draft lines and preserves playback order', () => {
  const { formatLrc } = loadHelpers();

  assert.equal(formatLrc([
    { sequence: 2, startMs: 2000, endMs: null, text: 'Second line' },
    { sequence: 1, startMs: null, endMs: null, text: 'Draft line' },
    { sequence: 3, startMs: 1000, endMs: null, text: 'First   line' },
  ]), '[00:01.000]First line\n[00:02.000]Second line');
});
