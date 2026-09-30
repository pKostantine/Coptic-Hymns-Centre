const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const hymnLibrarySource = fs.readFileSync('src/utils/hymnLibrary.js', 'utf8');
const conditionEngineSource = fs.readFileSync('src/utils/conditionEngine.js', 'utf8');

function slice(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `${startMarker} not found`);
  return source.slice(start, end);
}

test('Palm Sunday\'s Liturgy splices its own rite, Coptic Gospel Rite toggle and all', () => {
  assert.match(hymnLibrarySource, /PALM_SUNDAY_LITURGY_GOSPEL_RITE: \{ schema: "gospel_rite", table: "palm_sunday_liturgy_gospel_rite" \}/);
  assert.match(hymnLibrarySource, /const GOSPEL_RITE_KEYS = new Set\(\[[^\]]*"PALM_SUNDAY_LITURGY_GOSPEL_RITE"/);
});

test('an order row\'s implying_conditions switch flags on (and "!" off) for its hymn', () => {
  const withImpliedConditions = new Function(
    `${slice(hymnLibrarySource, 'function withImpliedConditions(', '\nasync function hydrateWithFlags(')}\nreturn withImpliedConditions;`,
  )();
  const flags = { Liturgy: true, PalmSunday: true };
  assert.equal(withImpliedConditions(flags, null), flags);
  assert.deepEqual(withImpliedConditions(flags, 'FirstPsalm'), { Liturgy: true, PalmSunday: true, FirstPsalm: true });
  assert.deepEqual(withImpliedConditions(flags, 'FourthGospel, SecondPsalm'), {
    Liturgy: true, PalmSunday: true, FourthGospel: true, SecondPsalm: true,
  });
  assert.deepEqual(withImpliedConditions(flags, '!PalmSunday'), { Liturgy: true, PalmSunday: false });

  // Every order table is read whole, so the column comes through where it exists.
  assert.match(hymnLibrarySource, /const ORDER_FIELDS = "\*";/);
  assert.match(hymnLibrarySource, /implying_conditions: normalizeText\(orderRow\.implying_conditions\)/);
  assert.equal((hymnLibrarySource.match(/withImpliedConditions\(sectionFlagsForRow \? sectionFlagsForRow\(section\) : documentFlags, section\.implyingConditions\)/g) || []).length, 2);
});

test('ordinal Liturgy sentinels read the day\'s Psalms and Gospels in reading_code order', () => {
  const definition = slice(hymnLibrarySource, 'export const READING_SENTINELS', '\nlet readingsForDateCache').replace('export const', 'const');
  const { isReadingSentinel, selectSentinelReading, map } = new Function(
    `${definition}\nreturn { isReadingSentinel, selectSentinelReading, map: READING_SENTINEL_MAP };`,
  )();
  const readings = [
    { service: 'Liturgy', reading_type: 'Gospel', reading_code: 'l_gospel_2', id: 'mark' },
    { service: 'Liturgy', reading_type: 'Gospel', reading_code: 'l_gospel_1', id: 'matthew' },
    { service: 'Liturgy', reading_type: 'Gospel', reading_code: 'l_gospel_4', id: 'john' },
    { service: 'Liturgy', reading_type: 'Gospel', reading_code: 'l_gospel_3', id: 'luke' },
    { service: 'Liturgy', reading_type: 'Psalm', reading_code: 'l_psalm_2', id: 'psalm2' },
    { service: 'Liturgy', reading_type: 'Psalm', reading_code: 'l_psalm_1', id: 'psalm1' },
    { service: 'Matins', reading_type: 'Gospel', reading_code: 'm_gospel', id: 'matins' },
  ];
  const read = (sentinel) => selectSentinelReading(map[sentinel], readings)?.id ?? null;
  assert.equal(read('FIRST_LITURGY_PSALM_WITH_COPTIC'), 'psalm1');
  assert.equal(read('SECOND_LITURGY_PSALM_WITHOUT_COPTIC'), 'psalm2');
  assert.equal(read('FIRST_LITURGY_GOSPEL_WITHOUT_COPTIC'), 'matthew');
  assert.equal(read('SECOND_LITURGY_GOSPEL_WITH_COPTIC'), 'mark');
  assert.equal(read('THIRD_LITURGY_GOSPEL_WITHOUT_COPTIC'), 'luke');
  assert.equal(read('FOURTH_LITURGY_GOSPEL_WITH_COPTIC'), 'john');
  // The unnumbered sentinels still read the first.
  assert.equal(read('LITURGY_GOSPEL_WITH_COPTIC'), 'matthew');
  assert.equal(read('MATINS_GOSPEL_WITHOUT_COPTIC'), 'matins');
  for (const sentinel of Object.keys(map)) {
    assert.equal(isReadingSentinel(sentinel), true, sentinel);
    assert.equal(map[sentinel].withCoptic, sentinel.endsWith('_WITH_COPTIC'), sentinel);
  }
});

test('a titled reading inside an untitled hymn is its own section, with its own minimization', () => {
  // palmSunday2ndAnd3rdGospels' Coptic Mark and Luke collapse like copticGospel's Matthew and John.
  const branch = slice(hymnLibrarySource, 'if (isReadingSentinel(verse.inlineHymnKey) && isoDate) {', 'const wholeTableTarget');
  assert.match(branch, /Boolean\(verse\.inlineHymnTitleShown\) &&\s+!\(section\.title\?\.english \|\| section\.title\?\.arabic\)/);
  assert.match(branch, /ownSection \? verse\.inlineHymnMinimization : null/);
  assert.doesNotMatch(branch, /isPaschaRiteReading/);
});

test('an ordinal reading\'s title names its reading: "Coptic Psalm (80:3,1-2)", "Coptic Gospel (Matthew 21:1-17)"', () => {
  const titleWithCitation = new Function(
    'formatArabicDigits',
    `${slice(hymnLibrarySource, 'function titleWithCitation(', '\n/**')}\nreturn titleWithCitation;`,
  )((text) => text.replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]));
  const psalm = { english: 'Psalm 80:3,1-2', arabic: 'مزمور 80:3,1-2', french: 'Psaume 80:3,1-2', reference: '80:3,1-2' };
  assert.deepEqual(
    titleWithCitation({ english: 'Coptic Psalm', arabic: 'المزمور القبطي', french: 'Psaume copte' }, psalm, true),
    { english: 'Coptic Psalm (80:3,1-2)', arabic: 'المزمور القبطي (٨٠:٣,١-٢)', french: 'Psaume copte (80:3,1-2)' },
  );
  const gospel = { english: 'Matthew 21:1-17', arabic: 'متى 21:1-17', french: 'Matthieu 21:1-17', reference: '21:1-17' };
  assert.deepEqual(
    titleWithCitation({ english: 'Coptic Gospel', arabic: 'الإنجيل القبطي', french: 'Évangile copte' }, gospel, false),
    { english: 'Coptic Gospel (Matthew 21:1-17)', arabic: 'الإنجيل القبطي (متى ٢١:١-١٧)', french: 'Évangile copte (Matthieu 21:1-17)' },
  );
  // An untitled hymn stays untitled.
  assert.deepEqual(titleWithCitation({ english: '', arabic: '' }, gospel, false), { english: '', arabic: '', french: undefined });
});

test('litanies named directly by a service are looked up in the litanies schema', () => {
  assert.match(hymnLibrarySource, /const HYMN_KEY_FALLBACK_SCHEMAS = \[[^\]]*"litanies"\]/);
});

test('a service reading several evangelists raises none of their flags', async () => {
  const computeGospelAuthorFlags = (authorsByService) => new Function(
    'getGospelAuthorsByService',
    `${slice(conditionEngineSource, 'async function computeGospelAuthorFlags(', '\n/**')}\nreturn computeGospelAuthorFlags;`,
  )(async () => authorsByService);
  const palmSunday = computeGospelAuthorFlags({ Liturgy: ['matthew', 'mark', 'luke', 'john'], Matins: ['luke'] });
  assert.deepEqual(await palmSunday('2027-04-25', { Liturgy: true }), {});
  assert.deepEqual(await palmSunday('2027-04-25', { Matins: true }), { GospelLuke: true });
  assert.deepEqual(await palmSunday('2027-04-25', {}), {});
});
