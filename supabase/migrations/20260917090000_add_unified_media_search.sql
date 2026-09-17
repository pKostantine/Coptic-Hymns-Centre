alter table media.search_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create or replace function media.normalize_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(
    regexp_replace(
      regexp_replace(
        translate(
          lower(extensions.unaccent(coalesce(p_value, ''))),
          U&'\0623\0625\0622\0671\0649\0624\0626\0640',
          U&'\0627\0627\0627\0627\064A\0648\064A'
        ),
        U&'[\064B-\065F\0670\06D6-\06ED]',
        '',
        'g'
      ),
      '[^[:alnum:]]+',
      ' ',
      'g'
    )
  );
$$;

comment on function media.normalize_search_text(text) is
  'Normalizes Latin accents and common Arabic orthographic variants for matching only; display text remains unchanged.';

create or replace function private.published_media_search_source()
returns table (
  owner_creator_account_id uuid,
  entity_type text,
  entity_id uuid,
  locale text,
  title text,
  subtitle text,
  body text,
  metadata jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- Music artists
  select
    artist.owner_creator_account_id,
    'music_artist'::text,
    artist.id,
    localized.locale,
    localized.title,
    null::text,
    localized.body,
    jsonb_build_object(
      'profileImageAsset', case when image.id is null then null else jsonb_build_object(
        'id', image.id,
        'provider', image.provider,
        'bucket', image.bucket,
        'path', image.path,
        'mimeType', image.mime_type
      ) end
    )
  from music.artists artist
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.body
    from (
      select 'en'::text as locale, artist.display_name as title, artist.biography as body, 0 as priority
      union all
      select localization.locale, localization.display_name, localization.biography, 1
      from music.artist_localizations localization
      where localization.artist_id = artist.id
        and localization.publication_status = 'published'::media.publication_status
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join media.media_assets image
    on image.id = artist.profile_image_asset_id
   and image.publication_status = 'published'::media.publication_status
  where artist.publication_status = 'published'::media.publication_status

  union all

  -- Music releases
  select
    release.owner_creator_account_id,
    'music_release'::text,
    release.id,
    localized.locale,
    localized.title,
    localized.subtitle,
    concat_ws(' ', localized.body, coalesce(artist_localization.display_name, artist.display_name)),
    jsonb_build_object(
      'releaseType', release.release_type,
      'releaseDate', release.release_date,
      'primaryArtist', case when artist.id is null then null else jsonb_build_object(
        'id', artist.id,
        'displayName', coalesce(artist_localization.display_name, artist.display_name)
      ) end,
      'coverAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type
      ) end
    )
  from music.releases release
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.subtitle,
      candidate.body
    from (
      select 'en'::text as locale, release.title as title, release.subtitle as subtitle,
        release.description as body, 0 as priority
      union all
      select localization.locale, localization.title, localization.subtitle, localization.description, 1
      from music.release_localizations localization
      where localization.release_id = release.id
        and localization.publication_status = 'published'::media.publication_status
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join music.artists artist
    on artist.id = release.primary_artist_id
   and artist.publication_status = 'published'::media.publication_status
  left join music.artist_localizations artist_localization
    on artist_localization.artist_id = artist.id
   and artist_localization.locale = localized.locale
   and artist_localization.publication_status = 'published'::media.publication_status
  left join media.media_assets cover
    on cover.id = release.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where release.publication_status = 'published'::media.publication_status

  union all

  -- Music tracks
  select
    track.owner_creator_account_id,
    'music_track'::text,
    track.id,
    localized.locale,
    localized.title,
    localized.subtitle,
    concat_ws(' ', artist_names.names, release_context.title),
    jsonb_build_object(
      'durationMs', track.duration_ms,
      'releaseId', release_context.id,
      'releaseTitle', release_context.title,
      'coverAsset', release_context.cover_asset,
      'mediaAsset', jsonb_build_object(
        'id', asset.id,
        'provider', asset.provider,
        'bucket', asset.bucket,
        'path', asset.path,
        'mimeType', asset.mime_type
      ),
      'artists', artist_names.artists
    )
  from music.tracks track
  join media.media_assets asset
    on asset.id = track.media_asset_id
   and asset.publication_status = 'published'::media.publication_status
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.subtitle
    from (
      select 'en'::text as locale, track.title as title, track.subtitle as subtitle, 0 as priority
      union all
      select localization.locale, localization.title, localization.subtitle, 1
      from music.track_localizations localization
      where localization.track_id = track.id
        and localization.publication_status = 'published'::media.publication_status
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join lateral (
    select
      string_agg(coalesce(artist_localization.display_name, artist.display_name), ' ' order by track_artist.sort_order) as names,
      coalesce(jsonb_agg(jsonb_build_object(
        'id', artist.id,
        'displayName', coalesce(artist_localization.display_name, artist.display_name),
        'role', track_artist.role,
        'sortOrder', track_artist.sort_order
      ) order by track_artist.sort_order, artist.display_name), '[]'::jsonb) as artists
    from music.track_artists track_artist
    join music.artists artist
      on artist.id = track_artist.artist_id
     and artist.publication_status = 'published'::media.publication_status
    left join music.artist_localizations artist_localization
      on artist_localization.artist_id = artist.id
     and artist_localization.locale = localized.locale
     and artist_localization.publication_status = 'published'::media.publication_status
    where track_artist.track_id = track.id
  ) artist_names on true
  left join lateral (
    select
      release.id,
      coalesce(release_localization.title, release.title) as title,
      case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type
      ) end as cover_asset
    from music.release_tracks release_track
    join music.releases release
      on release.id = release_track.release_id
     and release.publication_status = 'published'::media.publication_status
    left join music.release_localizations release_localization
      on release_localization.release_id = release.id
     and release_localization.locale = localized.locale
     and release_localization.publication_status = 'published'::media.publication_status
    left join media.media_assets cover
      on cover.id = release.cover_asset_id
     and cover.publication_status = 'published'::media.publication_status
    where release_track.track_id = track.id
    order by release.release_date desc nulls last, release_track.disc_number, release_track.track_number
    limit 1
  ) release_context on true
  where track.publication_status = 'published'::media.publication_status

  union all

  -- Learning cantors
  select
    cantor.owner_creator_account_id,
    'learning_cantor'::text,
    cantor.id,
    localized.locale,
    localized.title,
    null::text,
    localized.body,
    jsonb_build_object(
      'profileImageAsset', case when image.id is null then null else jsonb_build_object(
        'id', image.id,
        'provider', image.provider,
        'bucket', image.bucket,
        'path', image.path,
        'mimeType', image.mime_type
      ) end
    )
  from learning.cantors cantor
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.body
    from (
      select 'en'::text as locale, cantor.display_name as title, cantor.biography as body, 0 as priority
      union all
      select localization.locale, localization.display_name, localization.biography, 1
      from learning.cantor_localizations localization
      where localization.cantor_id = cantor.id
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join media.media_assets image
    on image.id = cantor.profile_image_asset_id
   and image.publication_status = 'published'::media.publication_status
  where cantor.publication_status = 'published'::media.publication_status

  union all

  -- Learning seasons
  select
    null::uuid,
    'learning_season'::text,
    season.id,
    localized.locale,
    localized.title,
    season.slug,
    localized.body,
    jsonb_build_object('slug', season.slug, 'sortOrder', season.sort_order)
  from learning.seasons season
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.body
    from (
      select 'en'::text as locale, season.title as title, season.description as body, 0 as priority
      union all
      select localization.locale, localization.title, localization.description, 1
      from learning.season_localizations localization
      where localization.season_id = season.id
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  where season.publication_status = 'published'::media.publication_status

  union all

  -- Learning hymns
  select
    null::uuid,
    'learning_hymn'::text,
    hymn.id,
    localized.locale,
    localized.title,
    localized.subtitle,
    concat_ws(' ', localized.body, hymn.source_hymn_key),
    jsonb_build_object('sourceHymnKey', hymn.source_hymn_key)
  from learning.hymns hymn
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.subtitle,
      candidate.body
    from (
      select 'en'::text as locale, hymn.title as title, hymn.subtitle as subtitle,
        hymn.description as body, 0 as priority
      union all
      select localization.locale, localization.title, localization.subtitle, localization.description, 1
      from learning.hymn_localizations localization
      where localization.hymn_id = hymn.id
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  where hymn.publication_status = 'published'::media.publication_status

  union all

  -- Learning albums
  select
    album.owner_creator_account_id,
    'learning_album'::text,
    album.id,
    localized.locale,
    localized.title,
    coalesce(cantor_localization.display_name, cantor.display_name),
    concat_ws(' ', localized.body, coalesce(cantor_localization.display_name, cantor.display_name),
      coalesce(season_localization.title, season.title)),
    jsonb_build_object(
      'cantorId', cantor.id,
      'cantorName', coalesce(cantor_localization.display_name, cantor.display_name),
      'seasonId', season.id,
      'coverAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type
      ) end
    )
  from learning.albums album
  join learning.cantors cantor
    on cantor.id = album.cantor_id
   and cantor.publication_status = 'published'::media.publication_status
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.body
    from (
      select 'en'::text as locale, album.title as title, album.description as body, 0 as priority
      union all
      select localization.locale, localization.title, localization.description, 1
      from learning.album_localizations localization
      where localization.album_id = album.id
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join learning.cantor_localizations cantor_localization
    on cantor_localization.cantor_id = cantor.id
   and cantor_localization.locale = localized.locale
  left join learning.seasons season
    on season.id = album.season_id
   and season.publication_status = 'published'::media.publication_status
  left join learning.season_localizations season_localization
    on season_localization.season_id = season.id
   and season_localization.locale = localized.locale
  left join media.media_assets cover
    on cover.id = album.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where album.publication_status = 'published'::media.publication_status

  union all

  -- Learning lessons (lesson sets provide the navigational/search context but are not standalone results).
  select
    lesson_set.owner_creator_account_id,
    'learning_lesson'::text,
    lesson.id,
    localized.locale,
    localized.title,
    coalesce(lesson_set_localization.title, lesson_set.title),
    concat_ws(' ', localized.body,
      coalesce(lesson_set_localization.title, lesson_set.title),
      coalesce(lesson_set_localization.description, lesson_set.description),
      coalesce(cantor_localization.display_name, cantor.display_name),
      coalesce(hymn_localization.title, hymn.title),
      coalesce(season_localization.title, season.title)),
    jsonb_build_object(
      'mediaType', lesson.media_type,
      'durationMs', lesson.duration_ms,
      'mediaAsset', jsonb_build_object(
        'id', asset.id,
        'provider', asset.provider,
        'bucket', asset.bucket,
        'path', asset.path,
        'mimeType', asset.mime_type
      ),
      'lessonSetId', lesson_set.id,
      'lessonSetTitle', coalesce(lesson_set_localization.title, lesson_set.title),
      'cantorId', cantor.id,
      'cantorName', coalesce(cantor_localization.display_name, cantor.display_name),
      'hymnId', hymn.id,
      'coverAsset', case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type
      ) end
    )
  from learning.lessons lesson
  join learning.lesson_sets lesson_set
    on lesson_set.id = lesson.lesson_set_id
   and lesson_set.publication_status = 'published'::media.publication_status
  join learning.cantors cantor
    on cantor.id = lesson_set.cantor_id
   and cantor.publication_status = 'published'::media.publication_status
  join learning.hymns hymn
    on hymn.id = lesson_set.hymn_id
   and hymn.publication_status = 'published'::media.publication_status
  join media.media_assets asset
    on asset.id = lesson.media_asset_id
   and asset.publication_status = 'published'::media.publication_status
  cross join lateral (
    select distinct on (candidate.locale)
      candidate.locale,
      candidate.title,
      candidate.body
    from (
      select 'en'::text as locale, lesson.title as title, lesson.description as body, 0 as priority
      union all
      select localization.locale, localization.title, localization.description, 1
      from learning.lesson_localizations localization
      where localization.lesson_id = lesson.id
    ) candidate
    join media.locales enabled_locale
      on enabled_locale.code = candidate.locale
     and enabled_locale.enabled
    order by candidate.locale, candidate.priority desc
  ) localized
  left join learning.lesson_set_localizations lesson_set_localization
    on lesson_set_localization.lesson_set_id = lesson_set.id
   and lesson_set_localization.locale = localized.locale
  left join learning.cantor_localizations cantor_localization
    on cantor_localization.cantor_id = cantor.id
   and cantor_localization.locale = localized.locale
  left join learning.hymn_localizations hymn_localization
    on hymn_localization.hymn_id = hymn.id
   and hymn_localization.locale = localized.locale
  left join learning.seasons season
    on season.id = lesson_set.season_id
   and season.publication_status = 'published'::media.publication_status
  left join learning.season_localizations season_localization
    on season_localization.season_id = season.id
   and season_localization.locale = localized.locale
  left join media.media_assets cover
    on cover.id = lesson_set.cover_asset_id
   and cover.publication_status = 'published'::media.publication_status
  where lesson.publication_status = 'published'::media.publication_status;
$$;

create or replace function private.refresh_unified_search_index()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from media.search_documents
  where kind = 'unified_catalog';

  insert into media.search_documents (
    owner_creator_account_id,
    entity_type,
    entity_id,
    locale,
    kind,
    title,
    subtitle,
    body,
    alias_text,
    normalized_text,
    search_vector,
    publication_status,
    metadata
  )
  select
    source.owner_creator_account_id,
    source.entity_type,
    source.entity_id,
    source.locale,
    'unified_catalog',
    source.title,
    source.subtitle,
    source.body,
    null,
    media.normalize_search_text(concat_ws(' ', source.title, source.subtitle, source.body)),
    setweight(to_tsvector('simple', media.normalize_search_text(source.title)), 'A')
      || setweight(to_tsvector('simple', media.normalize_search_text(source.subtitle)), 'B')
      || setweight(to_tsvector('simple', media.normalize_search_text(source.body)), 'C'),
    'published'::media.publication_status,
    source.metadata
  from private.published_media_search_source() source;
end;
$$;

create or replace function private.refresh_unified_search_index_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_unified_search_index();
  return null;
end;
$$;

create or replace function private.normalize_search_alias_trigger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_alias := media.normalize_search_text(new.alias);
  return new;
end;
$$;

drop trigger if exists search_aliases_normalize on media.search_aliases;
create trigger search_aliases_normalize
before insert or update of alias on media.search_aliases
for each row execute function private.normalize_search_alias_trigger();

update media.search_aliases
set normalized_alias = media.normalize_search_text(alias)
where normalized_alias is distinct from media.normalize_search_text(alias);

create index if not exists search_documents_normalized_trgm_idx
  on media.search_documents using gin (normalized_text extensions.gin_trgm_ops)
  where publication_status = 'published'::media.publication_status
    and kind = 'unified_catalog';

create index if not exists search_aliases_normalized_trgm_idx
  on media.search_aliases using gin (normalized_alias extensions.gin_trgm_ops)
  where publication_status = 'published'::media.publication_status;

create or replace function public.search_media_catalog(
  p_query text,
  p_locale text default 'en',
  p_scope text default 'all',
  p_limit integer default 60
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      media.normalize_search_text(p_query) as normalized_query,
      case lower(coalesce(p_scope, 'all'))
        when 'music' then 'music'
        when 'learning' then 'learning'
        else 'all'
      end as scope,
      greatest(1, least(coalesce(p_limit, 60), 100)) as result_limit
  ),
  prepared as (
    select
      input.*,
      websearch_to_tsquery('simple', input.normalized_query) as search_query
    from input
  ),
  alias_matches as (
    select
      alias.entity_type,
      alias.entity_id,
      max(case
        when alias.normalized_alias = prepared.normalized_query then 116.0
        when alias.normalized_alias like prepared.normalized_query || '%' then 92.0
        when alias.normalized_alias like '%' || prepared.normalized_query || '%' then 72.0
        else 35.0 + (extensions.similarity(alias.normalized_alias, prepared.normalized_query) * 30.0)
      end) as alias_score,
      bool_or(alias.normalized_alias = prepared.normalized_query) as exact_alias
    from media.search_aliases alias
    cross join prepared
    where prepared.normalized_query <> ''
      and alias.publication_status = 'published'::media.publication_status
      and (
        alias.normalized_alias like '%' || prepared.normalized_query || '%'
        or extensions.similarity(alias.normalized_alias, prepared.normalized_query) >= 0.2
      )
    group by alias.entity_type, alias.entity_id
  ),
  candidates as (
    select
      document.*,
      prepared.normalized_query,
      prepared.scope,
      greatest(
        case
          when media.normalize_search_text(document.title) = prepared.normalized_query then 120.0
          when media.normalize_search_text(document.title) like prepared.normalized_query || '%' then 96.0
          when media.normalize_search_text(document.title) like '%' || prepared.normalized_query || '%' then 78.0
          else 0.0
        end,
        case
          when document.search_vector @@ prepared.search_query
            then 62.0 + (ts_rank_cd(document.search_vector, prepared.search_query) * 28.0)
          else 0.0
        end,
        case
          when document.normalized_text like '%' || prepared.normalized_query || '%' then 58.0
          else 20.0 + (extensions.similarity(document.normalized_text, prepared.normalized_query) * 35.0)
        end,
        coalesce(alias_matches.alias_score, 0.0)
      )
      + case when document.locale = p_locale then 4.0 when document.locale = 'en' then 1.0 else 0.0 end
      as rank_score,
      case
        when media.normalize_search_text(document.title) = prepared.normalized_query then 'title_exact'
        when alias_matches.exact_alias then 'alias_exact'
        when media.normalize_search_text(document.title) like prepared.normalized_query || '%' then 'title_prefix'
        when alias_matches.alias_score is not null then 'alias'
        when document.search_vector @@ prepared.search_query then 'full_text'
        when document.normalized_text like '%' || prepared.normalized_query || '%' then 'substring'
        else 'similarity'
      end as matched_by
    from media.search_documents document
    cross join prepared
    left join alias_matches
      on alias_matches.entity_type = document.entity_type
     and alias_matches.entity_id = document.entity_id
    where prepared.normalized_query <> ''
      and document.kind = 'unified_catalog'
      and document.publication_status = 'published'::media.publication_status
      and (
        prepared.scope = 'all'
        or (prepared.scope = 'music' and document.entity_type like 'music_%')
        or (prepared.scope = 'learning' and document.entity_type like 'learning_%')
      )
      and (
        document.normalized_text like '%' || prepared.normalized_query || '%'
        or document.search_vector @@ prepared.search_query
        or extensions.similarity(document.normalized_text, prepared.normalized_query) >= 0.2
        or alias_matches.alias_score is not null
      )
  ),
  best_match as (
    select ranked.*
    from (
      select
        candidates.*,
        row_number() over (
          partition by candidates.entity_type, candidates.entity_id
          order by candidates.rank_score desc, (candidates.locale = p_locale) desc,
            (candidates.locale = 'en') desc, candidates.locale
        ) as entity_rank
      from candidates
    ) ranked
    where ranked.entity_rank = 1
  ),
  displayed as (
    select
      best_match.*,
      display.locale as display_locale,
      display.title as display_title,
      display.subtitle as display_subtitle,
      display.body as display_body,
      display.metadata as display_metadata
    from best_match
    cross join lateral (
      select candidate_display.locale, candidate_display.title, candidate_display.subtitle,
        candidate_display.body, candidate_display.metadata
      from media.search_documents candidate_display
      where candidate_display.kind = 'unified_catalog'
        and candidate_display.publication_status = 'published'::media.publication_status
        and candidate_display.entity_type = best_match.entity_type
        and candidate_display.entity_id = best_match.entity_id
      order by
        (candidate_display.locale = p_locale) desc,
        (candidate_display.locale = 'en') desc,
        (candidate_display.locale = best_match.locale) desc,
        candidate_display.locale
      limit 1
    ) display
  ),
  limited as (
    select displayed.*
    from displayed
    order by displayed.rank_score desc, displayed.display_title
    limit (select result_limit from prepared)
  )
  select jsonb_build_object(
    'query', coalesce(p_query, ''),
    'normalizedQuery', prepared.normalized_query,
    'scope', prepared.scope,
    'results', coalesce((
      select jsonb_agg(jsonb_build_object(
        'domain', case when limited.entity_type like 'music_%' then 'music' else 'learning' end,
        'kind', limited.entity_type,
        'entityId', limited.entity_id,
        'title', limited.display_title,
        'subtitle', limited.display_subtitle,
        'body', limited.display_body,
        'metadata', limited.display_metadata,
        'matchedBy', limited.matched_by,
        'matchedLocale', limited.locale,
        'displayLocale', limited.display_locale,
        'rank', round(limited.rank_score::numeric, 3)
      ) order by limited.rank_score desc, limited.display_title)
      from limited
    ), '[]'::jsonb)
  )
  from prepared;
$$;

comment on function public.search_media_catalog(text, text, text, integer) is
  'Ranked multilingual discovery across published Music and Learn & Study entities.';

revoke all on function private.published_media_search_source() from public, anon, authenticated;
revoke all on function private.refresh_unified_search_index() from public, anon, authenticated;
revoke all on function private.refresh_unified_search_index_trigger() from public, anon, authenticated;
revoke all on function private.normalize_search_alias_trigger() from public, anon, authenticated;
grant execute on function media.normalize_search_text(text) to anon, authenticated;
revoke all on function public.search_media_catalog(text, text, text, integer) from public;
grant execute on function public.search_media_catalog(text, text, text, integer) to anon, authenticated;

do $$
declare
  target regclass;
  trigger_name text;
begin
  foreach target in array array[
    'music.artists'::regclass,
    'music.artist_localizations'::regclass,
    'music.releases'::regclass,
    'music.release_localizations'::regclass,
    'music.tracks'::regclass,
    'music.track_localizations'::regclass,
    'music.release_tracks'::regclass,
    'music.track_artists'::regclass,
    'learning.cantors'::regclass,
    'learning.cantor_localizations'::regclass,
    'learning.seasons'::regclass,
    'learning.season_localizations'::regclass,
    'learning.hymns'::regclass,
    'learning.hymn_localizations'::regclass,
    'learning.albums'::regclass,
    'learning.album_localizations'::regclass,
    'learning.lesson_sets'::regclass,
    'learning.lesson_set_localizations'::regclass,
    'learning.lessons'::regclass,
    'learning.lesson_localizations'::regclass,
    'media.media_assets'::regclass
  ]
  loop
    trigger_name := replace(target::text, '.', '_') || '_refresh_unified_search';
    execute format('drop trigger if exists %I on %s', trigger_name, target);
    execute format(
      'create trigger %I after insert or update or delete on %s for each statement execute function private.refresh_unified_search_index_trigger()',
      trigger_name,
      target
    );
  end loop;
end;
$$;

select private.refresh_unified_search_index();
