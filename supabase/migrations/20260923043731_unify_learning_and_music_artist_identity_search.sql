-- Music, learning albums, and lesson sets share music.artists as the one
-- canonical identity catalogue. learning.cantors remains an internal legacy
-- compatibility projection while old learning FKs remain in use.
alter table learning.cantors
  add column if not exists artist_id uuid references music.artists(id) on delete set null;

-- Link existing legacy contributors to existing artist identities by EXACT
-- normalized name only. Fuzzy similarities are suggestions, never auto-links.
with ranked_matches as (
  select c.id cantor_id,a.id artist_id,
    row_number() over(partition by c.id order by
      (a.publication_status='published'::media.publication_status) desc,
      (a.owner_creator_account_id is not null) desc,
      (a.profile_image_asset_id is not null) desc,a.created_at) rn
  from learning.cantors c
  join music.artists a
    on private.normalize_creator_name(c.display_name)
      = private.normalize_creator_name(a.display_name)
  where c.artist_id is null
)
update learning.cantors c set artist_id=m.artist_id, updated_at=now()
from ranked_matches m where m.rn=1 and m.cantor_id=c.id;

-- Preserve any historic learning-only profile under a canonical artist ID.
do $backfill$
declare rec record; new_artist_id uuid;
begin
  for rec in
    select c.* from learning.cantors c where c.artist_id is null order by c.created_at
  loop
    select a.id into new_artist_id from music.artists a
      where private.normalize_creator_name(a.display_name)=private.normalize_creator_name(rec.display_name)
      order by (a.publication_status='published'::media.publication_status) desc,
        (a.owner_creator_account_id is not null) desc,a.created_at limit 1;
    if new_artist_id is null then
      insert into music.artists
        (display_name,profile_image_asset_id,publication_status,created_by,updated_by,metadata)
      values
        (rec.display_name,rec.profile_image_asset_id,rec.publication_status,
         rec.created_by,rec.updated_by,
         jsonb_build_object('migratedFromLearningCantor',rec.id))
      returning id into new_artist_id;
    end if;
    update learning.cantors set artist_id=new_artist_id, updated_at=now()
      where id=rec.id;
  end loop;
end;
$backfill$;

create unique index if not exists learning_cantors_artist_id_unique
  on learning.cantors(artist_id) where artist_id is not null;

-- A published music artist (or an unclaimed reusable credit) can be credited
-- in learning without a second creator-specific cantor approval/identity.
update learning.cantors c
  set publication_status='published'::media.publication_status,
      profile_image_asset_id=coalesce(a.profile_image_asset_id,c.profile_image_asset_id),
      updated_at=now()
  from music.artists a
  where c.artist_id=a.id and
    (a.publication_status='published'::media.publication_status or a.is_credit_only)
    and (c.publication_status<>'published'::media.publication_status
         or (c.profile_image_asset_id is null and a.profile_image_asset_id is not null));

-- Authenticated submission entry point: resolve an actual shared artist profile,
-- then return its single legacy projection ID for existing learning FK columns.
create or replace function private.resolve_learning_submission_artist(
  p_creator_account_id uuid,p_artist_id uuid,p_display_name text
) returns uuid language plpgsql security definer set search_path=''
as $resolve$
declare
  requested_user uuid := auth.uid();
  actual_artist_id uuid;
  legacy_cantor_id uuid;
  chosen_artist music.artists%rowtype;
  clean_name text := nullif(btrim(coalesce(p_display_name,'')),'');
begin
  if requested_user is null
      or not private.can_edit_creator_account(p_creator_account_id) then
    raise exception 'Not authorized to select an artist for this workspace'
      using errcode='42501';
  end if;

  if p_artist_id is not null then
    -- Backwards compatibility with cached older CHC Artists forms.
    select c.artist_id into actual_artist_id from learning.cantors c
    where c.id=p_artist_id;
    actual_artist_id := coalesce(actual_artist_id,p_artist_id);
    select * into chosen_artist from music.artists a
    where a.id=actual_artist_id
      and (a.publication_status='published'::media.publication_status
           or a.is_credit_only
           or a.owner_creator_account_id=p_creator_account_id);
    if not found then
      raise exception 'The selected artist is unavailable' using errcode='22023';
    end if;
  else
    if clean_name is null then
      raise exception 'Enter an artist name or choose an existing profile'
        using errcode='22023';
    end if;
    select * into chosen_artist from music.artists a
    where private.normalize_creator_name(a.display_name)
      =private.normalize_creator_name(clean_name)
    order by
      (a.publication_status='published'::media.publication_status) desc,
      (a.owner_creator_account_id is not null) desc,
      (a.profile_image_asset_id is not null) desc,a.created_at
    limit 1 for update;
    if not found then
      insert into music.artists(display_name,created_by,updated_by)
      values(clean_name,requested_user,requested_user)
      returning * into chosen_artist;
    end if;
    actual_artist_id := chosen_artist.id;
  end if;

  -- Existing learning content and older app builds retain their legacy IDs.
  select c.id into legacy_cantor_id from learning.cantors c
  where c.artist_id=actual_artist_id limit 1 for update;
  if legacy_cantor_id is null then
    insert into learning.cantors
      (artist_id,owner_creator_account_id,display_name,
       profile_image_asset_id,publication_status,metadata,created_by,updated_by)
    values
      (actual_artist_id,p_creator_account_id,chosen_artist.display_name,
       chosen_artist.profile_image_asset_id,
       case when chosen_artist.publication_status='published'::media.publication_status
                     or chosen_artist.is_credit_only
            then 'published'::media.publication_status
            else 'draft'::media.publication_status end,
       jsonb_build_object('canonicalArtistId',actual_artist_id,'artistBridge',true),
       requested_user,requested_user)
    returning id into legacy_cantor_id;
  else
    update learning.cantors c
      set publication_status=case
            when chosen_artist.publication_status='published'::media.publication_status
                  or chosen_artist.is_credit_only
            then 'published'::media.publication_status
            else c.publication_status end,
          profile_image_asset_id=coalesce(chosen_artist.profile_image_asset_id,c.profile_image_asset_id),
          updated_at=now()
    where c.id=legacy_cantor_id;
  end if;
  return legacy_cantor_id;
end;
$resolve$;
revoke all on function private.resolve_learning_submission_artist(uuid,uuid,text)
  from public,anon,authenticated;

-- Exactly one public result per canonical artist identity for all three modes.
-- p_kind='cantor' remains accepted by older installed clients, but returns
-- music.artists IDs, never learning.cantors duplicates.
create or replace function public.search_creator_contributors(
  p_creator_account_id uuid,p_query text,p_kind text default 'artist',
  p_limit integer default 12
) returns jsonb language plpgsql stable security definer set search_path=''
as $search$
declare
  normalized_query text := private.normalize_creator_name(left(coalesce(p_query,''),120));
  max_results integer := greatest(1,least(coalesce(p_limit,12),25));
  mode text := lower(btrim(coalesce(p_kind,'artist')));
  result jsonb;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_creator_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  if mode not in ('artist','cantor','all') then
    raise exception 'Invalid artist search kind' using errcode='22023';
  end if;
  if length(normalized_query)<2 then return '[]'::jsonb; end if;
  with candidates as (
    select a.id,a.display_name,a.is_credit_only,
      a.publication_status::text as status,
      a.owner_creator_account_id,
      private.normalize_creator_name(a.display_name) as normalized_name,
      case when asset.id is not null then jsonb_build_object(
        'bucket',asset.bucket,'path',asset.path,'version',asset.version
      ) else null end as photo
    from music.artists a
    left join media.media_assets asset
      on asset.id=a.profile_image_asset_id
      and asset.publication_status='published'::media.publication_status
      and asset.media_type='image'::media.media_type
    where a.publication_status='published'::media.publication_status
       or a.is_credit_only
       or a.owner_creator_account_id=p_creator_account_id
  ), scored as (
    select *,
      (case
        when normalized_name=normalized_query then 1000
        when normalized_name like normalized_query||'%' then 700
        when normalized_name like '%'||normalized_query||'%' then 470
        else 0 end)
      + round(extensions.similarity(normalized_name,normalized_query)*300)::integer
      + case when status='published' then 350 else 0 end
      + case when owner_creator_account_id is not null then 150 else 0 end
      + case when photo is not null then 130 else 0 end as score
    from candidates
    where normalized_name=normalized_query
       or normalized_name like '%'||normalized_query||'%'
       or extensions.similarity(normalized_name,normalized_query)>=0.21
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',display_name,
    'kind',case when mode='cantor' then 'cantor' else 'artist' end,
    'isCreditOnly',is_credit_only,'status',status,'profileImage',photo,
    'matchScore',score
  ) order by score desc,(photo is not null) desc,display_name),'[]'::jsonb)
  into result from (
    select * from scored
    order by score desc,(photo is not null) desc,display_name
    limit max_results
  ) ranked;
  return result;
end;
$search$;
revoke execute on function public.search_creator_contributors(uuid,text,text,integer)
  from public,anon;
grant execute on function public.search_creator_contributors(uuid,text,text,integer)
  to authenticated;

CREATE OR REPLACE FUNCTION public.create_creator_submission_v3(p_creator_account_id uuid, p_mode text, p_title text, p_description text DEFAULT NULL::text, p_release_type music.release_type DEFAULT NULL::music.release_type, p_music_type text DEFAULT NULL::text, p_recording_type text DEFAULT NULL::text, p_artist_id uuid DEFAULT NULL::uuid, p_cantor_id uuid DEFAULT NULL::uuid, p_season_id uuid DEFAULT NULL::uuid, p_hymn_id uuid DEFAULT NULL::uuid, p_localized_titles jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_release_timing_mode text DEFAULT 'asap'::text, p_scheduled_release_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_original_release_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result_payload jsonb;
  catalog_id uuid;
  resolved_learning_cantor uuid;
  supplied_learning_name text;
  normalized_timing text := lower(trim(coalesce(p_release_timing_mode, 'asap')));
begin
  if p_mode in ('music', 'learning_album', 'learning_lesson_set') then
    if normalized_timing not in ('asap', 'scheduled') then
      raise exception 'Release timing must be asap or scheduled' using errcode = '22023';
    end if;

    if normalized_timing = 'scheduled' and p_scheduled_release_at is null then
      raise exception 'Choose a scheduled release date and time' using errcode = '22023';
    end if;
  else
    normalized_timing := 'asap';
  end if;

  if p_mode <> 'music' and normalized_timing = 'scheduled'
     and p_scheduled_release_at < public.earliest_release_at() then
    raise exception 'Choose a release date at least 48 hours from now' using errcode = '22023';
  end if;

  -- The client always supplies a canonical music.artists ID, not a second
  -- "cantor" identity. Accept old learning.cantors IDs for older app builds.
  -- When no profile is chosen, only then create a reusable new artist credit.
  if p_mode in ('learning_album', 'learning_lesson_set') then
    select nullif(btrim(entry.value ->> 'learningArtistName'), '')
      into supplied_learning_name
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) entry(value)
    where coalesce(entry.value->>'role','media') <> 'artwork'
    order by entry.value->>'uploadIntentId'
    limit 1;

    resolved_learning_cantor := private.resolve_learning_submission_artist(
      p_creator_account_id, p_cantor_id, supplied_learning_name
    );
  end if;

  result_payload := public.create_creator_submission_v2(
    p_creator_account_id,
    p_mode,
    p_title,
    p_description,
    p_release_type,
    p_music_type,
    p_recording_type,
    p_artist_id,
    case when p_mode in ('learning_album','learning_lesson_set')
         then resolved_learning_cantor else p_cantor_id end,
    p_season_id,
    p_hymn_id,
    p_localized_titles,
    p_items,
    case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
    p_original_release_date
  );

  -- Save localized titles on individual learning submission items so that
  -- processing and scheduled publishing cannot lose the submitted languages.
  -- Match by unique upload intent rather than the display title.
  if p_mode in ('learning_album', 'learning_lesson_set') then
    update media.submission_items submission_item
       set localized_titles = case
             when jsonb_typeof(entry.value -> 'localizedTitles') = 'object'
               then entry.value -> 'localizedTitles'
             else '{}'::jsonb end,
           updated_at = now()
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) entry(value)
     where submission_item.submission_id=(result_payload ->> 'submissionId')::uuid
       and submission_item.upload_intent_id=(entry.value ->> 'uploadIntentId')::uuid
       and coalesce(entry.value ->> 'role', 'media') <> 'artwork';
  end if;

  catalog_id := nullif(result_payload ->> 'catalogId', '')::uuid;

  if p_mode = 'music' then
    update music.releases release
    set release_timing_mode = normalized_timing,
        scheduled_release_at = case
          when normalized_timing = 'asap' then null
          else release.scheduled_release_at
        end,
        updated_at = now()
    where release.id = catalog_id;
  elsif p_mode = 'learning_album' then
    update learning.albums album
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where album.id = catalog_id;
  elsif p_mode = 'learning_lesson_set' then
    update learning.lesson_sets lesson_set
       set release_timing_mode = normalized_timing,
           scheduled_release_at = case when normalized_timing = 'scheduled' then p_scheduled_release_at else null end,
           original_release_date = p_original_release_date, updated_at = now()
     where lesson_set.id = catalog_id;
  end if;

  return result_payload;
end;
$function$
;
