-- Section-specific search and individual Music track detail.
-- Music and Learn remain separate consumer experiences; this RPC never returns
-- cross-section results and deliberately favors title/alias matches over
-- incidental context matches such as an artist name appearing on every track.

create or replace function public.search_section_catalog(
  p_query text,
  p_locale text default 'en',
  p_section text default 'music',
  p_limit integer default 48
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
      case lower(coalesce(p_section, 'music'))
        when 'learning' then 'learning'
        else 'music'
      end as section,
      greatest(1, least(coalesce(p_limit, 48), 80)) as result_limit
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
        when alias.normalized_alias = prepared.normalized_query then 210.0
        when alias.normalized_alias like prepared.normalized_query || '%' then 178.0
        when alias.normalized_alias like '%' || prepared.normalized_query || '%' then 145.0
        else 62.0 + (extensions.similarity(alias.normalized_alias, prepared.normalized_query) * 58.0)
      end) as alias_score,
      bool_or(alias.normalized_alias = prepared.normalized_query) as exact_alias
    from media.search_aliases alias
    cross join prepared
    where prepared.normalized_query <> ''
      and alias.publication_status = 'published'::media.publication_status
      and (
        alias.normalized_alias like '%' || prepared.normalized_query || '%'
        or extensions.similarity(alias.normalized_alias, prepared.normalized_query) >= 0.25
      )
    group by alias.entity_type, alias.entity_id
  ),
  candidates as (
    select
      document.*,
      prepared.normalized_query,
      prepared.section,
      greatest(
        case
          when media.normalize_search_text(document.title) = prepared.normalized_query then 220.0
          when media.normalize_search_text(document.title) like prepared.normalized_query || '%' then 188.0
          when media.normalize_search_text(document.title) like '%' || prepared.normalized_query || '%' then 154.0
          else 0.0
        end,
        coalesce(alias_matches.alias_score, 0.0),
        case
          when document.search_vector @@ prepared.search_query
            then 82.0 + (ts_rank_cd(document.search_vector, prepared.search_query) * 38.0)
          else 0.0
        end,
        case
          when document.normalized_text like '%' || prepared.normalized_query || '%' then 68.0
          else 34.0 + (extensions.similarity(document.normalized_text, prepared.normalized_query) * 54.0)
        end
      )
      + case when document.locale = p_locale then 5.0 when document.locale = 'en' then 2.0 else 0.0 end
      as rank_score,
      case
        when media.normalize_search_text(document.title) = prepared.normalized_query then 'title_exact'
        when alias_matches.exact_alias then 'alias_exact'
        when media.normalize_search_text(document.title) like prepared.normalized_query || '%' then 'title_prefix'
        when media.normalize_search_text(document.title) like '%' || prepared.normalized_query || '%' then 'substring'
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
        (prepared.section = 'music' and document.entity_type like 'music_%')
        or (prepared.section = 'learning' and document.entity_type like 'learning_%')
      )
      and (
        media.normalize_search_text(document.title) like '%' || prepared.normalized_query || '%'
        or document.normalized_text like '%' || prepared.normalized_query || '%'
        or document.search_vector @@ prepared.search_query
        or extensions.similarity(document.normalized_text, prepared.normalized_query) >= 0.25
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
          order by candidates.rank_score desc,
            (candidates.locale = p_locale) desc,
            (candidates.locale = 'en') desc,
            candidates.locale
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
      select
        candidate_display.locale,
        candidate_display.title,
        candidate_display.subtitle,
        candidate_display.body,
        candidate_display.metadata
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
  diverse as (
    select ranked.*
    from (
      select
        displayed.*,
        row_number() over (
          partition by displayed.entity_type
          order by displayed.rank_score desc, displayed.display_title
        ) as kind_rank
      from displayed
    ) ranked
    where ranked.kind_rank <= case ranked.entity_type
      when 'music_artist' then 8
      when 'music_release' then 12
      when 'music_track' then 28
      when 'learning_cantor' then 8
      when 'learning_season' then 8
      when 'learning_hymn' then 16
      when 'learning_album' then 12
      when 'learning_lesson' then 24
      else 12
    end
  ),
  limited as (
    select diverse.*
    from diverse
    order by diverse.rank_score desc, diverse.display_title
    limit (select result_limit from prepared)
  )
  select jsonb_build_object(
    'query', coalesce(p_query, ''),
    'normalizedQuery', prepared.normalized_query,
    'scope', prepared.section,
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

revoke all on function public.search_section_catalog(text, text, text, integer) from public;
grant execute on function public.search_section_catalog(text, text, text, integer) to anon, authenticated;

comment on function public.search_section_catalog(text, text, text, integer) is
  'Section-specific ranked search for either Music or Learn & Study; title and alias matches outrank contextual matches.';

create or replace function public.get_published_music_track_for_locale(
  p_track_id uuid,
  p_locale text default 'en'
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', track.id,
    'title', coalesce(track_localization.title, track.title),
    'subtitle', coalesce(track_localization.subtitle, track.subtitle),
    'durationMs', track.duration_ms,
    'discNumber', release_context.disc_number,
    'trackNumber', release_context.track_number,
    'mediaAsset', jsonb_build_object(
      'id', media_asset.id,
      'provider', media_asset.provider,
      'bucket', media_asset.bucket,
      'path', media_asset.path,
      'mimeType', media_asset.mime_type,
      'fileSizeBytes', media_asset.file_size_bytes,
      'checksum', media_asset.checksum
    ),
    'artists', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', artist.id,
          'displayName', coalesce(artist_localization.display_name, artist.display_name),
          'role', track_artist.role,
          'sortOrder', track_artist.sort_order
        )
        order by track_artist.sort_order, artist.display_name
      )
      from music.track_artists track_artist
      join music.artists artist
        on artist.id = track_artist.artist_id
       and artist.publication_status = 'published'::media.publication_status
      left join music.artist_localizations artist_localization
        on artist_localization.artist_id = artist.id
       and artist_localization.locale = p_locale
       and artist_localization.publication_status = 'published'::media.publication_status
      where track_artist.track_id = track.id
    ), '[]'::jsonb),
    'release', case when release_context.id is null then null else jsonb_build_object(
      'id', release_context.id,
      'title', release_context.title,
      'subtitle', release_context.subtitle,
      'releaseType', release_context.release_type,
      'releaseDate', release_context.release_date,
      'musicType', release_context.music_type,
      'recordingType', release_context.recording_type,
      'coverAsset', release_context.cover_asset,
      'primaryArtist', release_context.primary_artist
    ) end
  )
  from music.tracks track
  join media.media_assets media_asset
    on media_asset.id = track.media_asset_id
   and media_asset.publication_status = 'published'::media.publication_status
  left join music.track_localizations track_localization
    on track_localization.track_id = track.id
   and track_localization.locale = p_locale
   and track_localization.publication_status = 'published'::media.publication_status
  left join lateral (
    select
      release.id,
      coalesce(release_localization.title, release.title) as title,
      coalesce(release_localization.subtitle, release.subtitle) as subtitle,
      release.release_type,
      music.release_display_date(
        release.original_release_date,
        release.scheduled_release_at,
        release.release_date
      ) as release_date,
      release.metadata ->> 'musicType' as music_type,
      release.metadata ->> 'recordingType' as recording_type,
      release_track.disc_number,
      release_track.track_number,
      case when cover.id is null then null else jsonb_build_object(
        'id', cover.id,
        'provider', cover.provider,
        'bucket', cover.bucket,
        'path', cover.path,
        'mimeType', cover.mime_type,
        'fileSizeBytes', cover.file_size_bytes,
        'checksum', cover.checksum
      ) end as cover_asset,
      case when primary_artist.id is null then null else jsonb_build_object(
        'id', primary_artist.id,
        'displayName', coalesce(primary_artist_localization.display_name, primary_artist.display_name)
      ) end as primary_artist
    from music.release_tracks release_track
    join music.releases release
      on release.id = release_track.release_id
     and release.publication_status = 'published'::media.publication_status
    left join music.release_localizations release_localization
      on release_localization.release_id = release.id
     and release_localization.locale = p_locale
     and release_localization.publication_status = 'published'::media.publication_status
    left join media.media_assets cover
      on cover.id = release.cover_asset_id
     and cover.publication_status = 'published'::media.publication_status
    left join music.artists primary_artist
      on primary_artist.id = release.primary_artist_id
     and primary_artist.publication_status = 'published'::media.publication_status
    left join music.artist_localizations primary_artist_localization
      on primary_artist_localization.artist_id = primary_artist.id
     and primary_artist_localization.locale = p_locale
     and primary_artist_localization.publication_status = 'published'::media.publication_status
    where release_track.track_id = track.id
    order by release.scheduled_release_at desc nulls last,
      release.release_date desc nulls last,
      release_track.disc_number,
      release_track.track_number
    limit 1
  ) release_context on true
  where track.id = p_track_id
    and track.publication_status = 'published'::media.publication_status;
$$;

revoke all on function public.get_published_music_track_for_locale(uuid, text) from public;
grant execute on function public.get_published_music_track_for_locale(uuid, text) to anon, authenticated;
