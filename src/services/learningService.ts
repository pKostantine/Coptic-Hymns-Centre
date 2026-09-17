import { mediaService } from '@/services/mediaService';
import type {
  LearningAlbumDetail,
  LearningAlbumSummary,
  LearningCantorDetail,
  LearningHomePayload,
  LearningHymnDetail,
  LearningHymnSummary,
  LearningLesson,
  LearningLessonSearchResult,
  LearningLessonSetDetail,
  LearningLessonSetSummary,
  LearningMediaAsset,
  LearningPlaylistDetail,
  LearningPlaylistItemKind,
  LearningPlaylistLibraryPayload,
  LearningPlaylistSummary,
  LearningPlaylistVisibility,
  LearningProgressMutationResult,
  LearningProgressPayload,
  LearningProgressState,
  LearningSearchPayload,
  LearningSeasonDetail,
} from '@/types/learningPlatform';
import { supabase } from '@/utils/supabase';

type RpcError = { message: string } | null;

export interface LearningLessonDetailPayload {
  lessonSet: LearningLessonSetDetail;
  lesson: LearningLesson;
}

interface SearchIndex {
  expiresAt: number;
  payload: LearningSearchPayload;
}

const SEARCH_CACHE_MS = 5 * 60 * 1000;
const searchCache = new Map<string, SearchIndex>();

function assertRpcData<T>(data: T | null, error: RpcError, operation: string): T {
  if (error) {
    throw new Error(operation + ': ' + error.message);
  }
  if (data == null) {
    throw new Error(operation + ': no data returned.');
  }
  return data;
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
  const { data, error } = await supabase.rpc('get_published_learning_album', {
    p_album_id: albumId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningAlbumDetail | null, error, 'Load learning album');
}

export async function getLearningLessonSet(lessonSetId: string, locale = 'en'): Promise<LearningLessonSetDetail> {
  const { data, error } = await supabase.rpc('get_published_learning_lesson_set', {
    p_lesson_set_id: lessonSetId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningLessonSetDetail | null, error, 'Load lesson set');
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

export async function getLearningPlaylist(
  playlistId: string,
  locale = 'en',
): Promise<LearningPlaylistDetail> {
  const { data, error } = await supabase.rpc('get_learning_playlist', {
    p_playlist_id: playlistId,
    p_locale: locale,
  });
  return assertRpcData(data as LearningPlaylistDetail | null, error, 'Load learning playlist');
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

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/\u0640/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLocaleLowerCase()
    .trim();
}

function includesQuery(query: string, values: (string | null | undefined)[]): boolean {
  return normalizeSearchText(values.filter(Boolean).join(' ')).includes(query);
}

async function buildSearchIndex(locale: string): Promise<LearningSearchPayload> {
  const home = await getLearningHome(locale);
  const [cantorDetails, seasonDetails] = await Promise.all([
    Promise.all(home.cantors.map((cantor) => getLearningCantor(cantor.id, locale))),
    Promise.all(home.seasons.map((season) => getLearningSeason(season.id, locale))),
  ]);

  const albums = uniqueById<LearningAlbumSummary>([
    ...cantorDetails.flatMap((cantor) => cantor.albums),
    ...seasonDetails.flatMap((season) => season.albums),
  ]);
  const lessonSets = uniqueById<LearningLessonSetSummary>([
    ...cantorDetails.flatMap((cantor) => cantor.lessonSets),
    ...seasonDetails.flatMap((season) => season.lessonSets),
  ]);
  const [albumDetails, lessonSetDetails] = await Promise.all([
    Promise.all(albums.map((album) => getLearningAlbum(album.id, locale))),
    Promise.all(lessonSets.map((lessonSet) => getLearningLessonSet(lessonSet.id, locale))),
  ]);
  const hymns = uniqueById<LearningHymnSummary>([
    ...seasonDetails.flatMap((season) => season.hymns),
    ...lessonSetDetails.map((lessonSet) => lessonSet.hymn),
  ]);

  const cantorNames = new Map(home.cantors.map((cantor) => [cantor.id, cantor.displayName]));
  const enrichedAlbums = albums.map((album) => {
    const detail = albumDetails.find((item) => item.id === album.id);
    return {
      ...album,
      description: album.description ?? detail?.description ?? null,
      cantorId: album.cantorId ?? detail?.cantor.id,
      seasonId: album.seasonId ?? detail?.season?.id ?? null,
    };
  });
  const enrichedLessonSets = lessonSets.map((lessonSet) => {
    const detail = lessonSetDetails.find((item) => item.id === lessonSet.id);
    return {
      ...lessonSet,
      description: lessonSet.description ?? detail?.description ?? null,
      cantorId: lessonSet.cantorId ?? detail?.cantor.id,
      seasonId: lessonSet.seasonId ?? detail?.season?.id ?? null,
    };
  });
  const lessons: LearningLessonSearchResult[] = lessonSetDetails.flatMap((lessonSet) => (
    lessonSet.lessons.map((lesson) => ({
      id: lesson.id,
      mediaType: lesson.mediaType,
      title: lesson.title,
      description: lesson.description,
      durationMs: lesson.durationMs,
      mediaAsset: lesson.mediaAsset,
      lessonSetId: lessonSet.id,
      lessonSetTitle: lessonSet.title,
      cantorId: lessonSet.cantor.id,
      cantorName: cantorNames.get(lessonSet.cantor.id) ?? lessonSet.cantor.displayName,
      hymnId: lessonSet.hymn.id,
    }))
  ));

  return {
    cantors: home.cantors,
    seasons: home.seasons,
    hymns,
    albums: enrichedAlbums,
    lessonSets: enrichedLessonSets,
    lessons,
  };
}

async function getSearchIndex(locale: string): Promise<LearningSearchPayload> {
  const cached = searchCache.get(locale);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  const payload = await buildSearchIndex(locale);
  searchCache.set(locale, { payload, expiresAt: Date.now() + SEARCH_CACHE_MS });
  return payload;
}

export async function searchLearning(query: string, locale = 'en'): Promise<LearningSearchPayload> {
  const normalized = normalizeSearchText(query);
  if (!normalized) {
    return { cantors: [], seasons: [], hymns: [], albums: [], lessonSets: [], lessons: [] };
  }

  const index = await getSearchIndex(locale);
  return {
    cantors: index.cantors.filter((item) => includesQuery(normalized, [item.displayName, item.biography])),
    seasons: index.seasons.filter((item) => includesQuery(normalized, [item.title, item.description, item.slug])),
    hymns: index.hymns.filter((item) => includesQuery(normalized, [item.title, item.subtitle, item.sourceHymnKey])),
    albums: index.albums.filter((item) => includesQuery(normalized, [item.title, item.description])),
    lessonSets: index.lessonSets.filter((item) => includesQuery(normalized, [item.title, item.description])),
    lessons: index.lessons.filter((item) => includesQuery(normalized, [
      item.title,
      item.description,
      item.lessonSetTitle,
      item.cantorName,
    ])),
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
  getPlaylists: getMyLearningPlaylists,
  getPlaylist: getLearningPlaylist,
  createPlaylist: createLearningPlaylist,
  addPlaylistItem: addLearningPlaylistItem,
  removePlaylistItem: removeLearningPlaylistItem,
  search: searchLearning,
  resolveAsset: resolveLearningAsset,
} as const;
