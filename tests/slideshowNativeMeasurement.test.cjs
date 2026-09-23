const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

test('native line probe contributes its full height to slideshow measurement', () => {
  const source = fs.readFileSync('src/components/chc/JustifiedText.js', 'utf8');
  const probe = source.match(/const measuringNode = isMeasuring \? \(([\s\S]*?)\n\s*\) : null;/)?.[1] || '';

  assert.match(probe, /opacity:\s*0/);
  assert.doesNotMatch(probe, /position:\s*["']absolute["']/);
});

test('liturgical slideshow pagination is independent of Now Playing geometry', () => {
  const surface = fs.readFileSync('src/components/chc/DocumentSurface.tsx', 'utf8');
  const slideshowBranch = surface.match(/if \(preferences\.slideshowMode\) \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  const container = fs.readFileSync('src/components/chc/SlideshowContainer.js', 'utf8');
  const overlay = fs.readFileSync('src/components/playback/GlobalNowPlayingOverlay.tsx', 'utf8');

  assert.doesNotMatch(slideshowBranch, /nowPlayingInset|bottomContentInset/);
  assert.doesNotMatch(container, /bottomContentInset/);
  assert.match(overlay, /if \(!allowDisplay \|\| preferences\.slideshowMode\) \{\s*reportNowPlayingInset\(0\)/);
});

test('collapsed Now Playing control cannot create a full-width slideshow mask', () => {
  const overlay = fs.readFileSync('src/components/playback/GlobalNowPlayingOverlay.tsx', 'utf8');
  const collapsedStart = overlay.indexOf('if (isCollapsed)');
  const collapsedEnd = overlay.indexOf('\n  return (', collapsedStart);
  const collapsedBranch = overlay.slice(collapsedStart, collapsedEnd);
  const container = fs.readFileSync('src/components/chc/SlideshowContainer.js', 'utf8');

  assert.match(collapsedBranch, /pointerEvents="box-none"/);
  assert.match(collapsedBranch, /width:\s*42/);
  assert.match(collapsedBranch, /height:\s*42/);
  assert.match(collapsedBranch, /backgroundColor:\s*'transparent'/);
  for (const styleName of ['container', 'slide', 'slideDeck']) {
    const style = container.match(new RegExp(`${styleName}:\\s*\\{([^}]*)\\}`))?.[1] || '';
    assert.match(style, /overflow:\s*["']visible["']/);
    assert.doesNotMatch(style, /overflow:\s*["']hidden["']/);
  }
});
