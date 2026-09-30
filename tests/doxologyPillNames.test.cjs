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

const { doxologyPillNames, shortEnglishDoxologyName, shortFrenchDoxologyName } =
  loadPureTypeScript('src/utils/doxologyPillNames.ts');

const dox = (hymnKey, english, french) => ({ hymnKey, title: { english, french } });

test('doxology pills drop "Doxology for" and keep what tells them apart', () => {
  const names = doxologyPillNames([
    dox('doxIntroductionToTheDoxologies', 'Introduction to the Doxologies'),
    dox('doxFeastOfTheCross', 'Doxology for the Feast of the Cross'),
    dox('doxMidnightDoxologyForTheVirgin', 'The Midnight Doxology for the Virgin'),
    dox('doxArchangelMichael', 'Doxology for Archangel Michael'),
    dox('doxAllTheHeavenlyBeings', 'Doxology for All the Heavenly Beings'),
    dox('doxStJohnTheBaptist', 'Doxology for St. John the Baptist'),
    dox('doxAnotherDoxologyForStJohnTheBaptist', 'Another Doxology for St. John the Baptist'),
    dox('doxKiahkDoxologyForArchangelGabriel', 'Kiahk Doxology for Archangel Gabriel'),
    dox('doxConclusionOfTheDoxologies', 'The Conclusion of the Doxologies'),
    { hymnKey: 'ourFather', title: { english: 'Our Father' } },
  ], false);
  assert.deepEqual(names, [
    'Introduction',
    'Feast of the Cross',
    'Midnight Virgin',
    'Archangel Michael',
    'Angels',
    'St. John the Baptist 1',
    'St. John the Baptist 2',
    'Kiahk Archangel Gabriel',
    'Conclusion',
    null,
  ]);
});

test('numbers come from "Another" and ordinal titles, and only where they tell doxologies apart', () => {
  assert.deepEqual(doxologyPillNames([
    dox('doxApostles', 'Doxology for the Apostles'),
    dox('doxApostles2', 'Another Doxology for the Apostles'),
    dox('doxFirstDoxologyForKiahk', 'First Doxology for Kiahk'),
    dox('doxSecondDoxologyForKiahk', 'Second Doxology for Kiahk'),
    dox('doxNativity', 'Doxology for the Nativity'),
    dox('doxSecondDoxologyForTheNativity', 'Second Doxology for the Nativity'),
    dox('doxStMina', 'Doxology for St. Mina'),
  ], false), ['Apostles 1', 'Apostles 2', 'Kiahk 1', 'Kiahk 2', 'Nativity 1', 'Nativity 2', 'St. Mina']);
  // A second doxology shown without its first still says which it is.
  assert.deepEqual(doxologyPillNames([dox('doxAnotherDoxologyForStGeorge', 'Another Doxology for St. George')], false), ['St. George 2']);
});

test('French pills shorten the French titles and take their numbers from the English ones', () => {
  assert.deepEqual(doxologyPillNames([
    dox('doxFeastOfTheCross', 'Doxology for the Feast of the Cross', 'Doxologie de la fête de la Sainte Croix'),
    dox('doxStGeorge', 'Doxology for St. George', 'Doxologie pour Saint Georges'),
    dox('doxAnotherDoxologyForStGeorge', 'Another Doxology for St. George', 'Doxologie pour saint Georges (2)'),
    dox('doxAllTheHeavenlyBeings', 'Doxology for All the Heavenly Beings', 'Doxologie pour les célestes'),
    dox('doxStBesa', 'Doxology for St. Besa'),
  ], true), ['Fête de la Sainte Croix', 'Saint Georges 1', 'Saint Georges 2', 'Anges', 'St. Besa']);
  assert.equal(shortFrenchDoxologyName("Doxologie de l'Annonciation"), 'Annonciation');
  assert.equal(shortFrenchDoxologyName('Introduction aux doxologies'), 'Introduction');
});

test('the long titles take the names they were given', () => {
  assert.deepEqual(doxologyPillNames([
    dox('doxEntryIntoEgypt', 'Doxology for the Entrance of the Lord Christ into the Land of Egypt', "Doxologie de l'entrée du Christ en Egypte"),
    dox('doxEntryIntoTheTemple', 'Doxology for the Presentation of the Lord Christ in the Temple'),
    dox('doxStruggleMantledSaintsTheCrossBearers', 'Doxology for the Struggle-mantled Saints, the Cross-bearers'),
    dox('doxSaturdaysAndSundaysOfTheGreatFast', 'Doxology for Saturdays and Sundays of Lent'),
  ], false), ['Entry of the Holy Family into Egypt', 'Entry of Christ into the Temple', 'Cross-bearers', 'Weekends of Lent']);
  // No French name was given, so a French pill shortens the French title.
  assert.deepEqual(doxologyPillNames([
    dox('doxEntryIntoEgypt', 'Doxology for the Entrance of the Lord Christ into the Land of Egypt', "Doxologie de l'entrée du Christ en Egypte"),
    dox('doxSaturdaysAndSundaysOfTheGreatFast', 'Doxology for Saturdays and Sundays of Lent'),
  ], true), ['Entrée du Christ en Egypte', 'Weekends of Lent']);
});

test('every other doxology title keeps its full name once "Doxology for" is gone', () => {
  assert.deepEqual(shortEnglishDoxologyName('Doxology For Any Female Martyr or Saint'), { name: 'Any Female Martyr or Saint' });
  assert.deepEqual(shortEnglishDoxologyName('The Vespers Doxology for the Virgin'), { name: 'Vespers Virgin' });
  assert.deepEqual(shortEnglishDoxologyName('Fourth Doxology for Lent'), { name: 'Lent', index: 4 });
  assert.deepEqual(shortEnglishDoxologyName('Melody for the Feast of Palm Sunday (2)'), { name: 'Melody for the Feast of Palm Sunday', index: 2 });
  assert.deepEqual(shortEnglishDoxologyName('Matins of the Resurrection by Hegumen Philotheous'), { name: 'Matins of the Resurrection by Hegumen Philotheous' });
});
