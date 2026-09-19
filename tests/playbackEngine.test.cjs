const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadHelpers() {
  const source = fs.readFileSync('src/utils/playbackEngine.ts', 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    require,
    moduleObject,
    'playbackEngine.ts',
    process.cwd(),
  );
  return moduleObject.exports;
}

test('manual queue navigation respects repeat-all boundaries', () => {
  const { getManualNextIndex, getManualPreviousIndex } = loadHelpers();
  assert.equal(getManualNextIndex(3, 1, 'off'), 2);
  assert.equal(getManualNextIndex(3, 2, 'off'), 2);
  assert.equal(getManualNextIndex(3, 2, 'all'), 0);
  assert.equal(getManualPreviousIndex(3, 0, 'off'), 0);
  assert.equal(getManualPreviousIndex(3, 0, 'all'), 2);
});

test('track completion distinguishes stop, repeat-one, and repeat-all', () => {
  const { getFinishedTrackAction } = loadHelpers();
  assert.deepEqual(getFinishedTrackAction(3, 1, 'off'), { type: 'advance', index: 2 });
  assert.deepEqual(getFinishedTrackAction(3, 2, 'off'), { type: 'stop' });
  assert.deepEqual(getFinishedTrackAction(3, 2, 'all'), { type: 'advance', index: 0 });
  assert.deepEqual(getFinishedTrackAction(3, 1, 'one'), { type: 'replay' });
});

test('shuffle preserves the currently playing entry and can restore original order', () => {
  const { restoreOriginalQueue, shuffleQueuePreservingCurrent } = loadHelpers();
  const original = [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }];
  const values = [0.8, 0.1, 0.6];
  let cursor = 0;
  const shuffled = shuffleQueuePreservingCurrent(original, 1, () => values[cursor++] ?? 0.5);

  assert.equal(shuffled.currentIndex, 1);
  assert.equal(shuffled.queue[1].key, 'b');
  assert.notDeepEqual(shuffled.queue.map((entry) => entry.key), original.map((entry) => entry.key));

  const restored = restoreOriginalQueue(original, shuffled.queue, shuffled.currentIndex);
  assert.deepEqual(restored.queue.map((entry) => entry.key), ['a', 'b', 'c', 'd']);
  assert.equal(restored.currentIndex, 1);
});

test('local playback wins when available and falls back to remote when missing', () => {
  const { choosePlaybackUri } = loadHelpers();
  assert.equal(choosePlaybackUri('file:///track.m4a', 'https://cdn.example/track.m4a', true), 'file:///track.m4a');
  assert.equal(choosePlaybackUri('file:///missing.m4a', 'https://cdn.example/track.m4a', false), 'https://cdn.example/track.m4a');
  assert.equal(choosePlaybackUri(null, 'https://cdn.example/track.m4a', false), 'https://cdn.example/track.m4a');
  assert.equal(choosePlaybackUri(null, null, false), null);
});

test('persisted snapshots are sanitized before restoration', () => {
  const { sanitizePlaybackSnapshot } = loadHelpers();
  const entry = {
    key: 'music:1:0',
    playable: {
      id: '1',
      kind: 'music_track',
      title: 'Track',
      source: { remoteUri: 'https://cdn.example/track.m4a' },
    },
  };
  const snapshot = sanitizePlaybackSnapshot({
    version: 1,
    queue: [entry],
    originalQueue: [entry],
    currentIndex: 9,
    positionMs: 1234.4,
    repeatMode: 'all',
    shuffleEnabled: true,
  });

  assert.equal(snapshot.currentIndex, 0);
  assert.equal(snapshot.positionMs, 1234);
  assert.equal(snapshot.repeatMode, 'all');
  assert.equal(snapshot.shuffleEnabled, true);
  assert.equal(sanitizePlaybackSnapshot({ version: 99 }), null);
});

test('reordering the queue keeps the playing entry selected', () => {
  const { moveQueueEntry } = loadHelpers();
  const entries = ['a', 'b', 'c', 'd', 'e'];

  // Moving the playing entry itself.
  assert.deepEqual(moveQueueEntry(entries, 1, 1, 3), { queue: ['a', 'c', 'd', 'b', 'e'], currentIndex: 3 });
  // Moving an earlier entry past the playing one shifts it back.
  assert.deepEqual(moveQueueEntry(entries, 2, 0, 4), { queue: ['b', 'c', 'd', 'e', 'a'], currentIndex: 1 });
  // Moving a later entry in front of the playing one shifts it forward.
  assert.deepEqual(moveQueueEntry(entries, 2, 4, 0), { queue: ['e', 'a', 'b', 'c', 'd'], currentIndex: 3 });
  // Moves that do not cross the playing entry leave it alone.
  assert.deepEqual(moveQueueEntry(entries, 0, 3, 1), { queue: ['a', 'd', 'b', 'c', 'e'], currentIndex: 0 });
  // Out-of-range targets clamp instead of corrupting the queue.
  assert.deepEqual(moveQueueEntry(entries, 0, 1, 99), { queue: ['a', 'c', 'd', 'e', 'b'], currentIndex: 0 });
});

test('clearing the queue keeps only the playing entry', () => {
  const { keepOnlyCurrentEntry } = loadHelpers();
  assert.deepEqual(keepOnlyCurrentEntry(['a', 'b', 'c'], 1), { queue: ['b'], currentIndex: 0 });
  assert.deepEqual(keepOnlyCurrentEntry(['a', 'b', 'c'], -1), { queue: [], currentIndex: -1 });
});
