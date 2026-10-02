const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

/** Both modules import only types beyond each other, so they transpile and load as-is. */
function load() {
  const compile = (path, replacements = []) => {
    let source = fs.readFileSync(path, 'utf8');
    for (const [from, to] of replacements) source = source.replace(from, to);
    return ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
  };

  const manifest = { exports: {} };
  new Function('exports', 'require', 'module', compile('src/constants/manifest.ts'))(
    manifest.exports, require, manifest,
  );

  const chrome = { exports: {} };
  const js = compile('src/utils/desktopChrome.ts');
  new Function('exports', 'require', 'module', js)(
    chrome.exports,
    (id) => (id === '@/constants/manifest' ? manifest.exports : require(id)),
    chrome,
  );
  return { keepsWholeWindow: chrome.exports.keepsWholeWindow, CATEGORIES: manifest.exports.CATEGORIES };
}

test('every Books section keeps the whole window', () => {
  // books/index pushes `/${category.id}`, so a section missing from the rule
  // would be the one page that still shows a sidebar it has no tab bar for.
  const { keepsWholeWindow, CATEGORIES } = load();
  assert.ok(CATEGORIES.length >= 7, `only ${CATEGORIES.length} categories loaded`);
  for (const category of CATEGORIES) {
    assert.ok(keepsWholeWindow([category.id]), `${category.id} should keep the whole window`);
    assert.ok(keepsWholeWindow([category.id, 'index']), `${category.id}/index should too`);
  }
  assert.ok(keepsWholeWindow(['season-selector']));
});

test('the reader and the full players keep the whole window', () => {
  const { keepsWholeWindow } = load();
  assert.ok(keepsWholeWindow(['liturgy', 'raising-of-incense', '[serviceId]']));
  assert.ok(keepsWholeWindow(['bible', '[bookKey]', '[chapter]']));
  assert.ok(keepsWholeWindow(['holy-week', '[dayId]', '[hourId]']));
  assert.ok(keepsWholeWindow(['music', 'now-playing']));
});

test('the top-level sections keep their sidebar', () => {
  // These are the five the sidebar links to; losing it would strand the user.
  const { keepsWholeWindow } = load();
  for (const route of [[], ['index'], ['books'], ['music'], ['learn'], ['account'], ['search'], ['settings']]) {
    assert.equal(keepsWholeWindow(route), false, `${route.join('/') || '(root)'} should keep the sidebar`);
  }
});

test('Books itself is not treated as one of its own submenus', () => {
  // `books` is the section the sidebar highlights; only what it pushes to is a
  // submenu, and no category is named "books".
  const { keepsWholeWindow, CATEGORIES } = load();
  assert.equal(keepsWholeWindow(['books']), false);
  assert.ok(!CATEGORIES.some((category) => category.id === 'books'));
});
