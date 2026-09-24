const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

function loadTypeScriptModule(path, dependencies = {}) {
  const source = fs.readFileSync(path, 'utf8');
  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const moduleObject = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.hasOwn(dependencies, specifier)) return dependencies[specifier];
    return require(specifier);
  };

  new Function('exports', 'require', 'module', '__filename', '__dirname', javascript)(
    moduleObject.exports,
    localRequire,
    moduleObject,
    path,
    process.cwd(),
  );
  return moduleObject.exports;
}

function loadOfflineDownloadRequests() {
  const musicCredits = loadTypeScriptModule('src/utils/musicCredits.ts');
  return loadTypeScriptModule('src/services/offlineDownloadRequests.ts', {
    '@/services/mediaService': {
      mediaService: {
        canResolve: () => false,
        resolve: () => null,
      },
    },
    '@/utils/musicCredits': musicCredits,
  });
}

test('playlist track download requests render with performer credits', () => {
  const { musicTrackDownloadRequest } = loadOfflineDownloadRequests();
  const track = {
    id: 'track-1',
    title: 'Track One',
    subtitle: null,
    durationMs: 120000,
    mediaAsset: {
      id: 'asset-1',
      provider: 'cloudflare_r2',
      bucket: 'music',
      path: 'tracks/track-1.m4a',
    },
    artists: [
      { id: 'artist-1', displayName: 'Cantor One', role: 'primary', sortOrder: 0 },
      { id: 'artist-2', displayName: 'Cantor Two', role: 'featured', sortOrder: 1 },
    ],
  };

  const request = musicTrackDownloadRequest({ track, locale: 'en' });

  assert.equal(request.packageKey, 'music_track:track-1:en');
  assert.equal(request.subtitle, 'Cantor One, Cantor Two');
  assert.deepEqual(request.resources, []);
});

test('track downloads live in the native-only overflow menu', () => {
  const playlistSource = fs.readFileSync('src/app/music/playlist/[id].tsx', 'utf8');
  const menuSource = fs.readFileSync('src/components/music/MusicTrackActionsMenu.tsx', 'utf8');
  const downloadSource = fs.readFileSync('src/components/offline/OfflineDownloadButton.tsx', 'utf8');

  assert.match(playlistSource, /Platform\.OS !== 'web'/);
  assert.match(playlistSource, /packageKey={`music_playlist:\$\{playlist\.id\}:\$\{locale\}`}/);
  assert.doesNotMatch(playlistSource, /packageKey={`music_track:/);
  assert.match(menuSource, /Platform\.OS !== 'web'/);
  assert.match(menuSource, /musicTrackDownloadRequest/);
  assert.match(menuSource, /menuRow/);
  assert.match(downloadSource, /Remove download/);
  assert.match(downloadSource, /downloadManager\.remove\(packageKey\)/);
});

test('download routes are absent from the website', () => {
  const downloadsScreen = fs.readFileSync('src/app/downloads.web.tsx', 'utf8');
  const libraryScreen = fs.readFileSync('src/app/music/library.tsx', 'utf8');
  const librarySectionScreen = fs.readFileSync('src/app/music/library/[section].tsx', 'utf8');

  assert.match(downloadsScreen, /<Redirect href=.*\/account/);
  assert.match(libraryScreen, /Platform\.OS !== 'web' \|\| folder\.id !== 'downloads'/);
  assert.match(librarySectionScreen, /isWebDownloadsRoute.*<Redirect href="\/music\/library"/s);
});
