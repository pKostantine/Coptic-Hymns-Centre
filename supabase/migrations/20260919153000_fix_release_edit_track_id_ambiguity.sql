-- Fix PL/pgSQL ambiguity between the local track id variable and
-- music.track_localizations.track_id while artists edit an existing release.
create or replace function public.update_creator_release_v2(
  p_release_id uuid,
  p_title text default null,
  p_description text default null,
  p_scheduled_release_at timestamptz default null,
  p_original_release_date date default null,
  p_clear_original_release_date boolean default false,
  p_localized_titles jsonb default null,
  p_music_type text default null,
  p_recording_type text default null,
  p_tracks jsonb default null,
  p_cover_upload_intent_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  base_payload jsonb;
  account_id uuid;
  submission_id uuid;
  submission_status media.publication_status;
  entry jsonb;
  v_track_id uuid;
  position integer := 0;
  locale_entry record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select release.owner_creator_account_id
  into account_id
  from music.releases release
  where release.id = p_release_id;

  if account_id is null then
    raise exception 'Release not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(account_id)) then
    raise exception 'Not authorized for this release' using errcode = '42501';
  end if;

  select nullif(release.metadata ->> 'submissionId', '')::uuid
  into submission_id
  from music.releases release
  where release.id = p_release_id;

  if submission_id is not null then
    select submission.status
    into submission_status
    from media.submissions submission
    where submission.id = submission_id
    for update;

    if submission_status is not null
       and submission_status not in (
         'draft'::media.publication_status,
         'uploading'::media.publication_status,
         'ready_to_submit'::media.publication_status,
         'changes_requested'::media.publication_status
       ) then
      update media.submissions submission
      set status = 'ready_to_submit'::media.publication_status,
          updated_by = auth.uid(),
          updated_at = now()
      where submission.id = submission_id;
    end if;
  end if;

  base_payload := public.update_creator_release(
    p_release_id,
    p_title,
    p_description,
    p_scheduled_release_at,
    p_original_release_date,
    p_clear_original_release_date,
    null,
    p_tracks,
    p_cover_upload_intent_id
  );

  perform public.update_creator_release_metadata(
    p_release_id,
    p_music_type,
    p_recording_type,
    p_localized_titles
  );

  if p_tracks is not null then
    for entry in
      select item.value
      from jsonb_array_elements(p_tracks)
      with ordinality as item(value, ordinality)
      order by item.ordinality
    loop
      position := position + 1;

      select rt.track_id
      into v_track_id
      from music.release_tracks rt
      where rt.release_id = p_release_id
        and rt.disc_number = 1
        and rt.track_number = position;

      if v_track_id is null then
        raise exception 'Could not resolve track % after release update', position;
      end if;

      perform private.set_track_credit_names(
        v_track_id,
        account_id,
        entry ->> 'mainArtistName',
        coalesce(entry -> 'contributors', '[]'::jsonb)
      );

      if entry ? 'localizedTitles' then
        delete from music.track_localizations tl
        where tl.track_id = v_track_id
          and tl.locale in ('en', 'ar', 'fr');

        for locale_entry in
          select loc.key as locale, trim(loc.value) as title
          from jsonb_each_text(coalesce(entry -> 'localizedTitles', '{}'::jsonb)) as loc(key, value)
          where loc.key in ('en', 'ar', 'fr')
            and nullif(trim(loc.value), '') is not null
        loop
          insert into music.track_localizations (
            track_id,
            locale,
            title,
            is_primary,
            publication_status,
            created_by,
            updated_by
          )
          values (
            v_track_id,
            locale_entry.locale,
            locale_entry.title,
            locale_entry.locale = 'en',
            'draft'::media.publication_status,
            auth.uid(),
            auth.uid()
          )
          on conflict on constraint track_localizations_track_id_locale_key do update
          set title = excluded.title,
              is_primary = excluded.is_primary,
              updated_by = excluded.updated_by,
              updated_at = now();
        end loop;
      end if;
    end loop;
  end if;

  return public.get_creator_release(p_release_id);
end;
$function$;

revoke all on function public.update_creator_release_v2(
  uuid, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) from public, anon;

grant execute on function public.update_creator_release_v2(
  uuid, text, text, timestamptz, date, boolean, jsonb, text, text, jsonb, uuid
) to authenticated;
