import { mediaService } from '@/services/mediaService';
import type {
  LearningAlbumDetail,
  LearningAlbumRecording,
  LearningLesson,
  LearningLessonSetDetail,
  LearningMediaAsset,
  LearningPlaylistDetail,
} from '@/types/learningPlatform';
import type {
  MusicConsumerAsset,
  MusicConsumerRelease,
  MusicConsumerTrack,
  MusicLibraryPayload,
  MusicPlaylistPayload,
  PublishedTrackLyricsPayload,
} from '@/types/musicConsumer';
import type {
  OfflineDownloadRequest,
  OfflineDownloadResource,
  OfflineEntitySnapshot,
} from '@/types/offlineDownloads';
import type { PlaybackEntityKind } from '@/types/playback';

type DownloadableAsset = MusicConsumerAsset | LearningMediaAsset;

function entityKey(entityType: string, entityId: string, locale: string): string {
  return `${entityType}:${entityId}:${locale}`;
}

function packageKey(entityType: string, entityId: string, locale: string): string {
  return `${entityType}:${entityId}:${locale}`;
}

function resolveAsset(asset: DownloadableAsset | null | undefined): string | null {
  if (!asset || !mediaService.canResolve(asset)) return null;
  return mediaService.resolve(asset);
}

function extensionFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const match = path.match(/\.([a-zA-Z0-9]{1,8})(?:\?.*)?$/);
  return match ? `.${match[1].toLowerCase()}` : null;
}

function mediaResource(
  asset: DownloadableAsset,
  playableKind: PlaybackEntityKind,
  playableId: string,
): OfflineDownloadResource | null {
  const remoteUri = resolveAsset(asset);
  if (!remoteUri) return null;
  return {
    fileKey: `media:${playableKind}:${playableId}:${asset.id}`,
    remoteUri,
    role: 'media',
    mimeType: asset.mimeType ?? null,
    fileSizeBytes: asset.fileSizeBytes ?? null,
    checksum: asset.checksum ?? null,
    version: asset.checksum ?? (asset.fileSizeBytes != null ? String(asset.fileSizeBytes) : null),
    extension: extensionFromPath(asset.path),
    playableKind,
    playableId,
  };
}

function artworkResource(asset: DownloadableAsset | null | undefined): OfflineDownloadResource | null {
  if (!asset) return null;
  const remoteUri = resolveAsset(asset);
  if (!remoteUri) return null;
  return {
    fileKey: `artwork:${asset.id}`,
    remoteUri,
    role: 'artwork',
    mimeType: asset.mimeType ?? null,
    fileSizeBytes: asset.fileSizeBytes ?? null,
    checksum: asset.checksum ?? null,
    version: asset.checksum ?? (asset.fileSizeBytes != null ? String(asset.fileSizeBytes) : null),
    extension: extensionFromPath(asset.path),
  };
}

function compactResources(resources: Array<OfflineDownloadResource | null>): OfflineDownloadResource[] {
  const seen = new Set<string>();
  return resources.flatMap((resource) => {
    if (!resource || seen.has(resource.fileKey)) return [];
    seen.add(resource.fileKey);
    return [resource];
  });
}

function snapshot<T>(entityType: OfflineEntitySnapshot['entityType'], entityId: string, locale: string, data: T): OfflineEntitySnapshot<T> {
  return { key: entityKey(entityType, entityId, locale), entityType, entityId, locale, data };
}

function primaryArtist(track: MusicConsumerTrack): string {
  return track.artists.find((artist) => artist.role === 'primary')?.displayName
    ?? track.artists[0]?.displayName
    ?? 'Coptic Hymns Centre';
}

function musicTrackResources(
  track: MusicConsumerTrack,
  coverAsset?: MusicConsumerAsset | null,
): OfflineDownloadResource[] {
  return compactResources([
    mediaResource(track.mediaAsset, 'music_track', track.id),
    artworkResource(coverAsset),
  ]);
}

function musicTrackSnapshots(
  track: MusicConsumerTrack,
  locale: string,
  lyrics?: PublishedTrackLyricsPayload | null,
): OfflineEntitySnapshot[] {
  const snapshots: OfflineEntitySnapshot[] = [snapshot('music_track', track.id, locale, track)];
  if (lyrics) snapshots.push(snapshot('music_lyrics', track.id, locale, lyrics));
  return snapshots;
}

export function musicTrackDownloadRequest(args: {
  track: MusicConsumerTrack;
  locale: string;
  releaseTitle?: string | null;
  coverAsset?: MusicConsumerAsset | null;
  lyrics?: PublishedTrackLyricsPayload | null;
}): OfflineDownloadRequest {
  return {
    packageKey: packageKey('music_track', args.track.id, args.locale),
    domain: 'music',
    entityType: 'music_track',
    entityId: args.track.id,
    locale: args.locale,
    title: args.track.title,
    subtitle: args.releaseTitle ?? primaryArtist(args.track),
    resources: musicTrackResources(args.track, args.coverAsset),
    snapshots: musicTrackSnapshots(args.track, args.locale, args.lyrics),
  };
}

export function musicReleaseDownloadRequest(
  release: MusicConsumerRelease,
  locale: string,
  lyricsByTrackId: Record<string, PublishedTrackLyricsPayload | null | undefined> = {},
): OfflineDownloadRequest {
  return {
    packageKey: packageKey('music_release', release.id, locale),
    domain: 'music',
    entityType: 'music_release',
    entityId: release.id,
    locale,
    title: release.title,
    subtitle: release.primaryArtist?.displayName ?? null,
    resources: compactResources([
      artworkResource(release.coverAsset),
      ...release.tracks.flatMap((track) => musicTrackResources(track, release.coverAsset)),
    ]),
    snapshots: [
      snapshot('music_release', release.id, locale, release),
      ...release.tracks.flatMap((track) => musicTrackSnapshots(track, locale, lyricsByTrackId[track.id])),
    ],
  };
}

export function musicPlaylistDownloadRequest(
  playlist: MusicPlaylistPayload,
  locale: string,
  lyricsByTrackId: Record<string, PublishedTrackLyricsPayload | null | undefined> = {},
): OfflineDownloadRequest {
  return {
    packageKey: packageKey('music_playlist', playlist.id, locale),
    domain: 'music',
    entityType: 'music_playlist',
    entityId: playlist.id,
    locale,
    title: playlist.name,
    subtitle: 'Playlist',
    resources: compactResources([
      artworkResource(playlist.coverAsset),
      ...playlist.tracks.flatMap((track) => musicTrackResources(track, playlist.coverAsset)),
    ]),
    snapshots: [
      snapshot('music_playlist', playlist.id, locale, playlist),
      ...playlist.tracks.flatMap((track) => musicTrackSnapshots(track, locale, lyricsByTrackId[track.id])),
    ],
  };
}

export function musicLikedSongsDownloadRequest(
  library: MusicLibraryPayload,
  locale: string,
  lyricsByTrackId: Record<string, PublishedTrackLyricsPayload | null | undefined> = {},
): OfflineDownloadRequest {
  const entityId = 'liked-songs';
  return {
    packageKey: packageKey('music_liked_songs', entityId, locale),
    domain: 'music',
    entityType: 'music_liked_songs',
    entityId,
    locale,
    title: 'Liked Songs',
    resources: compactResources(library.likedTracks.flatMap((track) => musicTrackResources(track))),
    snapshots: [
      snapshot('music_library', 'library', locale, library),
      ...library.likedTracks.flatMap((track) => musicTrackSnapshots(track, locale, lyricsByTrackId[track.id])),
    ],
  };
}

function learningMediaKind(lesson: Pick<LearningLesson, 'mediaType'>): PlaybackEntityKind {
  return lesson.mediaType === 'video' ? 'learning_video_audio' : 'learning_audio';
}

function learningRecordingResource(recording: LearningAlbumRecording): OfflineDownloadResource | null {
  return mediaResource(recording.mediaAsset, 'learning_audio', recording.id);
}

function learningLessonResource(lesson: LearningLesson): OfflineDownloadResource | null {
  return mediaResource(lesson.mediaAsset, learningMediaKind(lesson), lesson.id);
}

export function learningRecordingDownloadRequest(
  album: LearningAlbumDetail,
  recording: LearningAlbumRecording,
  locale: string,
): OfflineDownloadRequest {
  return {
    packageKey: packageKey('learning_recording', recording.id, locale),
    domain: 'learning',
    entityType: 'learning_recording',
    entityId: recording.id,
    locale,
    title: recording.title,
    subtitle: album.cantor.displayName,
    resources: compactResources([learningRecordingResource(recording), artworkResource(album.coverAsset)]),
    snapshots: [
      snapshot('learning_recording', recording.id, locale, recording),
      snapshot('learning_album', album.id, locale, { ...album, recordings: [recording] }),
    ],
  };
}

export function learningAlbumDownloadRequest(album: LearningAlbumDetail, locale: string): OfflineDownloadRequest {
  return {
    packageKey: packageKey('learning_album', album.id, locale),
    domain: 'learning',
    entityType: 'learning_album',
    entityId: album.id,
    locale,
    title: album.title,
    subtitle: album.cantor.displayName,
    resources: compactResources([
      artworkResource(album.coverAsset),
      ...album.recordings.map(learningRecordingResource),
    ]),
    snapshots: [
      snapshot('learning_album', album.id, locale, album),
      ...album.recordings.map((recording) => snapshot('learning_recording', recording.id, locale, recording)),
    ],
  };
}

export function learningLessonDownloadRequest(
  lessonSet: LearningLessonSetDetail,
  lesson: LearningLesson,
  locale: string,
): OfflineDownloadRequest {
  return {
    packageKey: packageKey('learning_lesson', lesson.id, locale),
    domain: 'learning',
    entityType: 'learning_lesson',
    entityId: lesson.id,
    locale,
    title: lesson.title,
    subtitle: lessonSet.cantor.displayName,
    resources: compactResources([learningLessonResource(lesson), artworkResource(lessonSet.coverAsset)]),
    snapshots: [
      snapshot('learning_lesson', lesson.id, locale, lesson),
      snapshot('learning_lesson_set', lessonSet.id, locale, { ...lessonSet, lessons: [lesson] }),
    ],
  };
}

export function learningLessonSetDownloadRequest(lessonSet: LearningLessonSetDetail, locale: string): OfflineDownloadRequest {
  return {
    packageKey: packageKey('learning_lesson_set', lessonSet.id, locale),
    domain: 'learning',
    entityType: 'learning_lesson_set',
    entityId: lessonSet.id,
    locale,
    title: lessonSet.title,
    subtitle: lessonSet.cantor.displayName,
    resources: compactResources([
      artworkResource(lessonSet.coverAsset),
      ...lessonSet.lessons.map(learningLessonResource),
    ]),
    snapshots: [
      snapshot('learning_lesson_set', lessonSet.id, locale, lessonSet),
      ...lessonSet.lessons.map((lesson) => snapshot('learning_lesson', lesson.id, locale, lesson)),
    ],
  };
}

export function learningPlaylistDownloadRequest(playlist: LearningPlaylistDetail, locale: string): OfflineDownloadRequest {
  const resources: Array<OfflineDownloadResource | null> = [];
  const snapshots: OfflineEntitySnapshot[] = [snapshot('learning_playlist', playlist.id, locale, playlist)];

  for (const item of playlist.items) {
    if (item.kind === 'album_recording') {
      resources.push(learningRecordingResource(item.recording));
      snapshots.push(snapshot('learning_recording', item.recording.id, locale, item.recording));
    } else {
      resources.push(learningLessonResource(item.lesson));
      snapshots.push(snapshot('learning_lesson', item.lesson.id, locale, item.lesson));
    }
  }

  return {
    packageKey: packageKey('learning_playlist', playlist.id, locale),
    domain: 'learning',
    entityType: 'learning_playlist',
    entityId: playlist.id,
    locale,
    title: playlist.name,
    subtitle: 'Learning Playlist',
    resources: compactResources(resources),
    snapshots,
  };
}
