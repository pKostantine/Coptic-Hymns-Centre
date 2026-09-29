const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

/** appText.ts, with the stored App Language it reads by default stubbed out. */
function loadAppText(currentLanguage = 'en') {
  const source = fs.readFileSync('src/utils/appText.ts', 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const module = { exports: {} };
  const stubRequire = (name) => {
    if (name === './preferencesStorage') return { getCurrentAppLanguage: () => currentLanguage };
    return require(name);
  };
  new Function('module', 'exports', 'require', outputText)(module, module.exports, stubRequire);
  return module.exports;
}

test('menu text shows French in French, falling back to English, and Arabic in Arabic', () => {
  const { tr, appText, entryLabel } = loadAppText();
  assert.equal(tr('Search', 'Rechercher', 'بحث', 'fr'), 'Rechercher');
  assert.equal(tr('Search', 'Rechercher', 'بحث', 'ar'), 'بحث');
  assert.equal(tr('Search', 'Rechercher', 'بحث', 'en'), 'Search');

  const withFrench = { english: 'Vespers', arabic: 'عشية', french: 'Vêpres' };
  const withoutFrench = { english: 'Tasbeha', arabic: 'تسبحة' };
  assert.equal(appText(withFrench, 'fr'), 'Vêpres');
  assert.equal(appText(withoutFrench, 'fr'), 'Tasbeha');
  assert.equal(appText({ english: '', arabic: 'تسبحة' }, 'fr'), 'تسبحة');
  assert.equal(appText(withFrench, 'ar'), 'عشية');
  assert.equal(entryLabel({ title: 'Matins', arabic: 'باكر', french: 'Matines' }, 'fr'), 'Matines');
});

test('with no language given, the stored App Language decides', () => {
  const { tr } = loadAppText('fr');
  assert.equal(tr('Today', 'Aujourd’hui', 'اليوم'), 'Aujourd’hui');
});

// The React Compiler memoizes JSX by the values it can see. tr()/appText()
// read the App Language when they run, which it can't see, so a compiled
// component would keep its first language's text after a switch between
// English and French (see src/utils/appText.ts).
test('every component file rendering App Language text opts out of the React Compiler', () => {
  const helpers = /\b(tr|appText|entryLabel|appTextIsArabic|appLocale|formatWeekdayDate|formatCopticDate|formatGregorianMonthTitle|formatCopticYear|formatGregorianDate|formatGregorianDateRange|formatRowDate|formatLongDate|formatMonthDay|weekdayName|getSeasonIndicatorName|getSeasonShortName|getCurrentAppLanguage)\(/;
  const missing = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.tsx')) {
        const source = fs.readFileSync(full, 'utf8');
        if (helpers.test(source) && !source.startsWith("'use no memo'")) missing.push(full);
      }
    }
  };
  walk('src');
  assert.deepEqual(missing, []);
});
