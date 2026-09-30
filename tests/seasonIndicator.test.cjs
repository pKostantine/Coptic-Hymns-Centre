const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

/** seasonNames.ts, with appText answering in English. */
function loadSeasonNames() {
  const source = fs.readFileSync('src/constants/seasonNames.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  const stubRequire = (path) => (path.endsWith('/appText') ? { appText: (name) => name.english } : require(path));
  new Function('module', 'exports', 'require', outputText)(module, module.exports, stubRequire);
  return module.exports;
}

const { getSeasonIndicatorName } = loadSeasonNames();
const pill = (seasons, events) => getSeasonIndicatorName(seasons.map((key) => ({ key })), events.map((key) => ({ key })));

test('the Annunciation outranks Lazarus Saturday, which outranks Holy Week, which outranks the Annunciation', () => {
  // Holy Week's range opens on Lazarus Saturday.
  assert.equal(pill(['holy-week'], ['lazarus-saturday']), 'Lazarus Saturday');
  // The Annunciation on Lazarus Saturday: it outranks Lazarus Saturday, and Holy Week has no claim that day.
  assert.equal(pill(['holy-week'], ['lazarus-saturday', 'annunciation']), 'Annunciation');
  // The Annunciation on any other day of Holy Week gives way to it.
  assert.equal(pill(['holy-week'], ['annunciation']), 'Holy Week');
  // Holy Week's own feasts still outrank both.
  assert.equal(pill(['holy-week'], ['annunciation', 'good-friday']), 'Good Friday');
  assert.equal(pill(['holy-week'], ['annunciation', 'palm-sunday']), 'Palm Sunday');
});

test('outside Holy Week the Annunciation shows as before', () => {
  assert.equal(pill(['lent'], ['annunciation']), 'Annunciation');
  assert.equal(pill(['holy-50-days'], ['annunciation']), 'Annunciation');
  assert.equal(pill([], []), 'Annual');
});
