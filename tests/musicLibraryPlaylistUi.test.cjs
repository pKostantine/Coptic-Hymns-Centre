const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

test('playlist destructive and reorder controls are edit-only drag controls', () => {
  const playlist = read('src/app/music/playlist/[id].tsx');
  const editorRow = read('src/components/music/PlaylistTrackEditorRow.tsx');

  assert.match(playlist, /playlist\.isOwner && editing \? \(/);
  assert.doesNotMatch(playlist, /accessibilityLabel="Move track (?:up|down)"/);
  assert.match(editorRow, /PanResponder\.create/);
  assert.match(editorRow, /name="reorder"/);
  assert.match(editorRow, /onMove\(index, boundedTarget\)/);
  assert.match(editorRow, /Remove \$\{track\.title\} from playlist/);
});

test('playlist cover supports upload, removal, and first-track fallback', () => {
  const playlist = read('src/app/music/playlist/[id].tsx');
  const coverService = read('src/services/playlistCoverService.ts');
  const migration = read('supabase/migrations/20260921124505_playlist_covers_recents_and_library.sql');
  const storagePolicy = read('supabase/migrations/20260921131700_fix_playlist_cover_path_policy_binding.sql');

  assert.match(playlist, /playlistCoverService\.pickAndUpload/);
  assert.match(playlist, /playlistCoverService\.remove/);
  assert.match(playlist, /automatically follows the first track/);
  assert.match(coverService, /launchImageLibraryAsync/);
  assert.match(coverService, /\.upload\(path, bytes/);
  assert.match(migration, /playlist\.cover_asset_id as asset_id[\s\S]*0 as priority/);
  assert.match(migration, /playlist_track\.sort_order[\s\S]*order by candidate\.priority, candidate\.sort_order/);
  assert.match(storagePolicy, /and name in \([\s\S]*playlist\.owner_user_id = \(select auth\.uid\(\)\)/);
});

test('Library uses searchable folders and recent listening sections', () => {
  const library = read('src/app/music/library.tsx');
  const folder = read('src/app/music/library/[section].tsx');
  const migration = read('supabase/migrations/20260921124505_playlist_covers_recents_and_library.sql');

  for (const section of ['likes', 'playlists', 'releases', 'following', 'downloads']) {
    assert.match(library, new RegExp(`id: '${section}'`));
  }
  assert.match(folder, /<TextInput/);
  assert.match(folder, /Search liked tracks/);
  assert.match(folder, /Search playlists/);
  assert.match(folder, /Search liked releases/);
  assert.match(folder, /Search followed artists/);
  assert.match(folder, /Search downloads/);
  assert.match(library, /Recently played tracks/);
  assert.match(library, /Recently played releases/);
  assert.match(migration, /create or replace function public\.record_music_play/);
  assert.match(migration, /'recentTracks'/);
  assert.match(migration, /'recentReleases'/);
});

test('artist artwork is circular and tab headers no longer carry the logo', () => {
  const folder = read('src/app/music/library/[section].tsx');
  const nativeHeader = read('src/components/chc/ui/AppHeader.tsx');
  const webHeader = read('src/components/chc/ui/AppHeader.web.tsx');
  const booksWeb = read('src/app/books/index.web.tsx');
  const home = read('src/components/chc/screens/HomeScreen.tsx');

  assert.match(folder, /profileImageAsset[^\n]*size=\{58\} rounded/);
  assert.doesNotMatch(nativeHeader, /CHC_sm/);
  assert.doesNotMatch(webHeader, /CHC_sm_web/);
  assert.doesNotMatch(booksWeb, /CHC_sm_web/);
  assert.match(home, /assets\/images\/CHC\.png/);
  assert.match(home, /width \* 0\.31/);
});
