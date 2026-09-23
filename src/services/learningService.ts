import { mediaService } from '@/services/mediaService';
import { getOfflineSnapshot } from '@/services/offlineSnapshotStore';
import type {
  LearningAlbumDetail,
  LearningCantorDetail,
  LearningHomePayload,
  LearningHymnDetail,
  LearningLesson,
  LearningLessonSetDetail,
  LearningMediaAsset,
  LearningPlaylistDetail,
  LearningPlaylistItemKind,
  LearningPlaylistLibraryPayload,
  LearningPlaylistSummary,
  LearningPlaylistVisibility,
  LearningItemLibraryPayload,
  LearningLyricsPayload,
  LearningProgressMutationResult,
  LearningProgressPayload,
  LearningProgressState,
  LearningSearchPayload,
  LearningSeasonDetail,
} from '@/types/learningPlatform';
import { unifiedSearchService } from '@/services/unifiedSearchService';
import { supabase } from '@/utils/supabase';

type RpcError = { message: string } | null;

export interface LearningLessonDetailPayload {
  lessonSet: LearningLessonSetDetail;
  lesson: LearningLesson;
}

function assertRpcData<T>(data: T | null, error: RpcError, operation: string): T {
  if (error) {
    throw new Error(operation + ': ' + error.message);
  }
  if (data == null) {
    throw new Error(operation + ': no data returned.');
  }
  return data;
}

async function offlineFallback<T>(
  operation: () => Promise<T>,
  entityType: 'learning_album' | 'learning_lesson_set' | 'learning_playlist',
  entityId: string,
  locale: string,
): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    const offline = await getOfflineSnapshot<T>(entityType, entityId, locale);
    if (offline) return offline;
    throw cause;
  }
}

async function hasAuthenticatedSession(): Promise<boolean> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('Read account session: ' + error.message);
  return Boolean(data.session);
}

export function resolveLearningAsset(asset: LearningMediaAsset | null | undefined): string | null {
  if (!asset || !mediaService.canResolve(asset)) return null;
  return mediaService.resolve(asset);
}

export async function getLearningHome(locale = 'en'): Promise<LearningHomePayload> {
  const { data, error } = await supabase.rpc('get_learning_home', { p_locale: locale });
  return assertRpcData(data as LearningHomePayload | null, error, 'Load Learn & Study');
}

export async function getLearningCantor(cantorId: string, locale = 'en'): Promise<LearningCantorDetail> {
  const { data, error } = await supabase.rpc('get_published_learning_cantor', {
    p_cantor_id: cantorId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningCantorDetail | null, error, 'Load cantor');
}

export async function getLearningSeason(seasonId: string, locale = 'en'): Promise<LearningSeasonDetail> {
  const { data, error } = await supabase.rpc('get_published_learning_season', {
    p_season_id: seasonId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningSeasonDetail | null, error, 'Load season');
}

export async function getLearningHymn(hymnId: string, locale = 'en'): Promise<LearningHymnDetail> {
  const { data, error } = await supabase.rpc('get_published_learning_hymn', {
    p_hymn_id: hymnId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningHymnDetail | null, error, 'Load hymn');
}

export async function getLearningAlbum(albumId: string, locale = 'en'): Promise<LearningAlbumDetail> {
  return offlineFallback(async () => {
    const { data, error } = await supabase.rpc('get_published_learning_album', {
      p_album_id: albumId,
      p_locale: locale,
    });
    return assertRpcData(data as LearningAlbumDetail | null, error, 'Load learning album');
  }, 'learning_album', albumId, locale);
}

export async function getLearningLessonSet(lessonSetId: string, locale = 'en'): Promise<LearningLessonSetDetail> {
  return offlineFallback(async () => {
    const { data, error } = await supabase.rpc('get_published_learning_lesson_set', {
      p_lesson_set_id: lessonSetId,
      p_locale: locale,
    });
    return assertRpcData(data as LearningLessonSetDetail | null, error, 'Load lesson set');
  }, 'learning_lesson_set', lessonSetId, locale);
}

export async function getLearningLesson(
  lessonSetId: string,
  lessonId: string,
  locale = 'en',
): Promise<LearningLessonDetailPayload> {
  const lessonSet = await getLearningLessonSet(lessonSetId, locale);
  const lesson = lessonSet.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new Error('Load lesson: lesson not found in its published set.');
  return { lessonSet, lesson };
}

export async function getMyLearningProgress(locale = 'en'): Promise<LearningProgressPayload> {
  if (!await hasAuthenticatedSession()) return { authenticated: false, items: [] };
  const { data, error } = await supabase.rpc('get_my_learning_progress', { p_locale: locale });
  return assertRpcData(data as LearningProgressPayload | null, error, 'Load learning progress');
}

export async function setLearningProgress(
  hymnId: string,
  state: LearningProgressState,
): Promise<LearningProgressMutationResult> {
  const { data, error } = await supabase.rpc('set_learning_progress', {
    p_hymn_id: hymnId,
    p_state: state,
  });
  return assertRpcData(data as LearningProgressMutationResult | null, error, 'Update learning progress');
}

export async function getMyLearningPlaylists(locale = 'en'): Promise<LearningPlaylistLibraryPayload> {
  if (!await hasAuthenticatedSession()) return { authenticated: false, playlists: [] };
  const { data, error } = await supabase.rpc('get_my_learning_playlists', { p_locale: locale });
  return assertRpcData(data as LearningPlaylistLibraryPayload | null, error, 'Load learning playlists');
}

export async function getMyLearningItems(locale = 'en'): Promise<LearningItemLibraryPayload> {
  if (!await hasAuthenticatedSession()) return { authenticated: false, likedItemIds: [], items: [] };
  const { data, error } = await supabase.rpc('get_my_learning_items', { p_locale: locale });
  return assertRpcData(data as LearningItemLibraryPayload | null, error, 'Load My Learning');
}

export async function setLearningItemProgress(
  itemKind: LearningPlaylistItemKind,
  itemId: string,
  state: LearningProgressState,
): Promise<void> {
  const { error } = await supabase.rpc('set_learning_item_progress', {
    p_item_kind: itemKind,
    p_item_id: itemId,
    p_state: state,
  });
  if (error) throw new Error('Update learning list: ' + error.message);
}

export async function setLearningItemLiked(
  itemKind: LearningPlaylistItemKind,
  itemId: string,
  liked: boolean,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_learning_item_liked', {
    p_item_kind: itemKind,
    p_item_id: itemId,
    p_liked: liked,
  });
  return assertRpcData(data as boolean | null, error, 'Update liked learning item');
}

export async function getLearningLyrics(
  itemKind: LearningPlaylistItemKind,
  itemId: string,
): Promise<LearningLyricsPayload> {
  const { data, error } = await supabase.rpc('get_published_learning_item_lyrics', {
    p_item_kind: itemKind,
    p_item_id: itemId,
    p_locale: null,
  });
  return assertRpcData(data as LearningLyricsPayload | null, error, 'Load learning lyrics');
}

export async function getLearningPlaylist(
  playlistId: string,
  locale = 'en',
): Promise<LearningPlaylistDetail> {
  return offlineFallback(async () => {
    const { data, error } = await supabase.rpc('get_learning_playlist', {
      p_playlist_id: playlistId,
      p_locale: locale,
    });
    return assertRpcData(data as LearningPlaylistDetail | null, error, 'Load learning playlist');
  }, 'learning_playlist', playlistId, locale);
}

export async function createLearningPlaylist(
  name: string,
  description?: string | null,
  visibility: LearningPlaylistVisibility = 'private',
): Promise<LearningPlaylistSummary> {
  const { data, error } = await supabase.rpc('create_learning_playlist', {
    p_name: name,
    p_description: description ?? null,
    p_visibility: visibility,
  });
  const created = assertRpcData(
    data as Omit<LearningPlaylistSummary, 'itemCount'> | null,
    error,
    'Create learning playlist',
  );
  return { ...created, itemCount: 0 };
}

export async function updateLearningPlaylist(
  playlistId: string,
  name: string,
  description: string | null,
  visibility: LearningPlaylistVisibility,
): Promise<LearningPlaylistDetail> {
  const { data, error } = await supabase.rpc('update_learning_playlist', {
    p_playlist_id: playlistId,
    p_name: name,
    p_description: description,
    p_visibility: visibility,
  });
  return assertRpcData(data as LearningPlaylistDetail | null, error, 'Update learning playlist');
}

export async function deleteLearningPlaylist(playlistId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('delete_learning_playlist', { p_playlist_id: playlistId });
  return assertRpcData(data as boolean | null, error, 'Delete learning playlist');
}

export async function addLearningPlaylistItem(
  playlistId: string,
  itemKind: LearningPlaylistItemKind,
  itemId: string,
): Promise<LearningPlaylistDetail> {
  const { data, error } = await supabase.rpc('add_learning_playlist_item', {
    p_playlist_id: playlistId,
    p_item_kind: itemKind,
    p_album_recording_id: itemKind === 'album_recording' ? itemId : null,
    p_lesson_id: itemKind === 'lesson' ? itemId : null,
  });
  return assertRpcData(data as LearningPlaylistDetail | null, error, 'Add to learning playlist');
}

export async function removeLearningPlaylistItem(
  playlistId: string,
  itemId: string,
): Promise<LearningPlaylistDetail> {
  const { data, error } = await supabase.rpc('remove_learning_playlist_item', {
    p_playlist_id: playlistId,
    p_item_id: itemId,
  });
  return assertRpcData(data as LearningPlaylistDetail | null, error, 'Remove from learning playlist');
}

export async function searchLearning(query: string, locale = 'en'): Promise<LearningSearchPayload> {
  const normalized = query.trim();
  if (!normalized) {
    return { cantors: [], seasons: [], hymns: [], albums: [], lessonSets: [], lessons: [] };
  }

  const { results } = await unifiedSearchService.search(normalized, locale, 'learning');
  return {
    cantors: results.flatMap((result) => result.kind === 'learning_cantor' ? [{
      id: result.entityId,
      displayName: result.title,
      biography: result.body,
      profileImageAsset: result.metadata.profileImageAsset,
    }] : []),
    seasons: results.flatMap((result) => result.kind === 'learning_season' ? [{
      id: result.entityId,
      slug: result.metadata.slug,
      title: result.title,
      description: result.body,
      sortOrder: result.metadata.sortOrder,
    }] : []),
    hymns: results.flatMap((result) => result.kind === 'learning_hymn' ? [{
      id: result.entityId,
      sourceHymnKey: result.metadata.sourceHymnKey,
      title: result.title,
      subtitle: result.subtitle,
    }] : []),
    albums: results.flatMap((result) => result.kind === 'learning_album' ? [{
      id: result.entityId,
      title: result.title,
      description: result.body,
      cantorId: result.metadata.cantorId,
      seasonId: result.metadata.seasonId,
    }] : []),
    lessonSets: [],
    lessons: results.flatMap((result) => result.kind === 'learning_lesson' ? [{
      id: result.entityId,
      mediaType: result.metadata.mediaType,
      title: result.title,
      description: result.body,
      durationMs: result.metadata.durationMs,
      mediaAsset: result.metadata.mediaAsset,
      lessonSetId: result.metadata.lessonSetId,
      lessonSetTitle: result.metadata.lessonSetTitle,
      cantorId: result.metadata.cantorId,
      cantorName: result.metadata.cantorName,
      hymnId: result.metadata.hymnId,
    }] : []),
  };
}

export const learningService = {
  getHome: getLearningHome,
  getCantor: getLearningCantor,
  getSeason: getLearningSeason,
  getHymn: getLearningHymn,
  getAlbum: getLearningAlbum,
  getLessonSet: getLearningLessonSet,
  getLesson: getLearningLesson,
  getProgress: getMyLearningProgress,
  setProgress: setLearningProgress,
  getItemLibrary: getMyLearningItems,
  setItemProgress: setLearningItemProgress,
  setItemLiked: setLearningItemLiked,
  getLyrics: getLearningLyrics,
  getPlaylists: getMyLearningPlaylists,
  getPlaylist: getLearningPlaylist,
  createPlaylist: createLearningPlaylist,
  updatePlaylist: updateLearningPlaylist,
  deletePlaylist: deleteLearningPlaylist,
  addPlaylistItem: addLearningPlaylistItem,
  removePlaylistItem: removeLearningPlaylistItem,
  search: searchLearning,
  resolveAsset: resolveLearningAsset,
} as const;
