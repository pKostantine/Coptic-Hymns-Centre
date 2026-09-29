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

test('Bible captures the current verse and restores it without deep-link highlighting', () => {
  const html = fs.readFileSync('src/components/chc/bibleDocumentHtml.ts', 'utf8');
  const chapter = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');
  const native = fs.readFileSync('src/components/chc/BibleWebView.tsx', 'utf8');
  const web = fs.readFileSync('src/components/chc/BibleWebView.web.tsx', 'utf8');
  assert.match(html, /type: 'currentVerse'/);
  assert.match(html, /restoreVerse \|\| initialVerse/);
  assert.match(html, /initialVerse && !restoreVerse/);
  assert.match(html, /window\.addEventListener\('scroll', scheduleScrollReport/);
  assert.match(chapter, /restoreVerse=\{restoreVerse\}/);
  assert.match(chapter, /restoreGuardRef/);
  assert.match(chapter, /blurredSnapshotRef/);
  assert.match(native, /onLoadEnd/);
  assert.match(web, /onLoad/);
});

test('Bible verse selector freezes its opening verse across successive language toggles', () => {
  const chapter = fs.readFileSync('src/app/bible/[bookKey]/[chapter].tsx', 'utf8');
  const html = fs.readFileSync('src/components/chc/bibleDocumentHtml.ts', 'utf8');
  assert.match(chapter, /selectorAnchorRef\.current = currentVerseRef\.current/);
  assert.match(chapter, /const anchor = selectorAnchorRef\.current \|\| currentVerseRef\.current/);
  assert.match(chapter, /selectorOpenRef\.current\) return/);
  assert.match(chapter, /setBibleVisibleLanguages\(next\)/);
  assert.match(chapter, /action\.readerId !== readerId/);
  assert.match(html, /message\.readerId = readerId/);
  assert.match(html, /initialAnchorVerse = restoreVerse \|\| initialVerse/);
});

test('A document never reloads for the Now Playing bar or an unchanged language set', () => {
  // Reloading the reader throws its place away; a subdocument opened a moment
  // ago has no remembered place, so it landed back at the top.
  for (const file of ['src/components/chc/DocumentWebView.tsx', 'src/components/chc/DocumentWebView.web.tsx']) {
    const view = fs.readFileSync(file, 'utf8');
    const buildDeps = view.slice(view.indexOf('const html = useMemo('), view.indexOf('],', view.indexOf('const html = useMemo(')));
    assert.match(buildDeps, /bottomContentInset: 0/, file);
    assert.doesNotMatch(buildDeps.split('[').pop(), /bottomContentInset/, file);
    assert.match(view, /const applyBottomInset = \(\) =>/, file);
  }
  const surface = fs.readFileSync('src/components/chc/DocumentSurface.tsx', 'utf8');
  assert.match(surface, /visibleColumns=\{visibleColumns\}/);
  assert.match(surface, /const visibleColumns = useMemo\(/);
  const chrome = fs.readFileSync('src/context/BottomChromeContext.tsx', 'utf8');
  assert.match(chrome, /reportNowPlayingInset: \(id: string, inset: number \| null\) => void/);
});

test('Calendar and Settings opened from a subdocument close with the edge swipe', () => {
  const modal = fs.readFileSync('src/components/chc/screens/DocumentModal.tsx', 'utf8');
  assert.match(modal, /const overlaySwipePanResponder = useMemo\(/);
  assert.match(modal, /isMobileDocument \? overlaySwipePanResponder\.panHandlers/);
  assert.match(modal, /screen === 'seasons' \? 'calendar' : null/);
});

test('a reload or a jump never lets the page\'s first "at the top" report replace where the reader is', () => {
  // A (re)loaded page reports its top before its restore arrives, and a jump
  // reports sections it passes; in a subdocument that sent a jump straight
  // back to the top.
  for (const file of ['src/components/chc/DocumentWebView.tsx', 'src/components/chc/DocumentWebView.web.tsx']) {
    const view = fs.readFileSync(file, 'utf8');
    assert.match(view, /if \(loadingRef\.current\) \{\s*reportDuringLoadRef\.current = action;\s*return;/, file);
    assert.match(view, /guard\.sectionId !== action\.sectionId && Date\.now\(\) < guard\.until\) return;/, file);
    // A jump records its target before the page has scrolled anywhere.
    assert.match(view, /scrollToSection: \(id: string, edge: 'start' \| 'end' = 'start'\) => \{\s*preservedSectionIdRef\.current = id;\s*preservedEdgeRef\.current = edge;\s*guardJump\(id\);/, file);
    // Reports count again only once the restore has been sent.
    assert.match(view, /guardJump\(candidates\[0\]\.sectionId\);\s*\}\s*loadingRef\.current = false;/, file);
  }
  const native = fs.readFileSync('src/components/chc/DocumentWebView.tsx', 'utf8');
  assert.match(native, /onLoadStart=\{\(\) => \{\s*loadingRef\.current = true;/);
  const web = fs.readFileSync('src/components/chc/DocumentWebView.web.tsx', 'utf8');
  assert.match(web, /useLayoutEffect\(\(\) => \{\s*loadingRef\.current = true;[\s\S]*?\}, \[html\]\);/);
  // The subdocument remembers a jump itself, so a remounted reader lands there.
  const modal = fs.readFileSync('src/components/chc/screens/DocumentModal.tsx', 'utf8');
  assert.match(modal, /function jumpToSection\(id: string\) \{[\s\S]*?setCurrentSectionId\(id\);/);
});

// The document page's own jump hold (documentHtml.ts), run against a minimal
// window. On the phone the native scroll view can put back its own offset
// after a jump has landed -- the subdocument "went there and shot back to the
// top" -- so a jump the app asked for is held briefly against anything that
// moves the page, but never against the reader.
function loadJumpHold() {
  const source = fs.readFileSync('src/components/chc/documentHtml.ts', 'utf8');
  const start = source.indexOf('      function currentScrollY() {');
  const end = source.indexOf('      window.scrollToTune = function');
  assert.ok(start > 0 && end > start, 'jump hold script not found');
  const script = source.slice(start, end);
  assert.doesNotMatch(script, /\$\{/, 'the extracted script must not depend on template values');

  const listeners = {};
  const sectionTops = { a: 0, b: 2000, c: 4000 };
  const win = {
    pageYOffset: 0,
    innerHeight: 800,
    scrollTo(xOrOptions, y) {
      const top = typeof xOrOptions === 'object' ? xOrOptions.top : y;
      win.pageYOffset = top;
    },
    addEventListener(type, handler) {
      (listeners[type] ||= []).push(handler);
    },
  };
  const doc = {
    documentElement: { scrollHeight: 6000, scrollTop: 0 },
    getElementById(id) {
      if (!(id in sectionTops)) return null;
      return {
        isConnected: true,
        getBoundingClientRect: () => ({
          top: sectionTops[id] - win.pageYOffset,
          bottom: sectionTops[id] + 1500 - win.pageYOffset,
        }),
      };
    },
    querySelector: () => null,
  };
  new Function('window', 'document', script)(win, doc);
  const fire = (type) => (listeners[type] || []).forEach((handler) => handler({ type }));
  // Something outside the page moving it, as the native scroll view does.
  const moveFromOutside = (top) => {
    win.pageYOffset = top;
    fire('scroll');
  };
  return { win, fire, moveFromOutside };
}

test('a jump holds against the page being moved back to the top, but never against the reader', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { win, fire, moveFromOutside } = loadJumpHold();

  assert.equal(win.scrollToSection('b'), true);
  assert.equal(win.pageYOffset, 1999);
  moveFromOutside(0);
  assert.equal(win.pageYOffset, 1999, 'a reset right after the jump is undone');

  // Undone on a schedule too, for a reset that sends no scroll event.
  win.pageYOffset = 0;
  t.mock.timers.tick(700);
  assert.equal(win.pageYOffset, 1999);

  // The reader's own touch ends the hold at once.
  fire('touchstart');
  moveFromOutside(350);
  assert.equal(win.pageYOffset, 350);

  // And it lapses on its own: long after a jump, nothing is pulled back.
  win.scrollToSection('c');
  assert.equal(win.pageYOffset, 3999);
  t.mock.timers.tick(3000);
  moveFromOutside(10);
  assert.equal(win.pageYOffset, 10);
});

test('a restore to a hymn\'s end and a verse jump are held the same way', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { win, moveFromOutside } = loadJumpHold();
  // Restore candidates, as DocumentWebView's load handler sends them.
  win.scrollToSection([{ sectionId: 'missing', edge: 'start' }, { sectionId: 'b', edge: 'end' }]);
  assert.equal(win.pageYOffset, 2000 + 1500 - 800 + 16);
  moveFromOutside(0);
  assert.equal(win.pageYOffset, 2716);
  // A smooth scroll can't be held, and ends an earlier hold rather than
  // being pulled back to it.
  win.releaseHeldJump();
  moveFromOutside(5);
  assert.equal(win.pageYOffset, 5);
});

test('a subdocument (and its Settings/Calendar) can be swiped out from a landscape phone\'s notch inset', () => {
  // The edge swipe starts in the side safe-area padding in landscape, which
  // the PanResponder was never offered; raw touches there are read instead,
  // and the PanResponder leaves those starts alone so nothing fires twice.
  const modal = fs.readFileSync('src/components/chc/screens/DocumentModal.tsx', 'utf8');
  assert.match(modal, /function useInsetEdgeSwipe\(/);
  assert.match(modal, /onTouchStart: \(event: GestureResponderEvent\) => \{[\s\S]*?if \(!startsInInset\(pageX\)\) return;/);
  assert.match(modal, /if \(start\.edge === 'left' && dx > 60\) onSwipeFromLeft\(\);/);
  assert.match(modal, /isMobileDocument \? insetEdgeSwipe\.handlers/);
  assert.match(modal, /isMobileDocument \? overlayInsetEdgeSwipe\.handlers/);
  assert.match(modal, /isStylusGestureEvent\(_\) \|\| startsInInset\(gestureState\.x0\)\) return false;/);
  assert.match(modal, /isStylusGestureEvent\(event\) \|\| startsInInset\(gestureState\.x0\)\) return;/);
});
