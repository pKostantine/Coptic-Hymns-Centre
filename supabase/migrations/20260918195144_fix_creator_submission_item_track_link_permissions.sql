create or replace function private.link_submission_item_music_track(
  p_item_id uuid,
  p_track_id uuid,
  p_creator_account_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from media.submission_items item
    join media.submissions submission on submission.id = item.submission_id
    join music.tracks track on track.id = p_track_id
    where item.id = p_item_id
      and item.role = 'track'::media.submission_item_role
      and submission.creator_account_id = p_creator_account_id
      and track.owner_creator_account_id = p_creator_account_id
  ) then
    raise exception 'Submission item and track must belong to the same editable creator account'
      using errcode = '42501';
  end if;

  update media.submission_items item
  set music_track_id = p_track_id
  where item.id = p_item_id;
end;
$function$;

revoke all on function private.link_submission_item_music_track(uuid, uuid, uuid) from public, anon;
grant execute on function private.link_submission_item_music_track(uuid, uuid, uuid) to authenticated;

do $patch$
declare
  definition text;
  patched text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_creator_submission'
    and pg_get_function_identity_arguments(p.oid) =
      'p_creator_account_id uuid, p_mode text, p_title text, p_description text, p_release_type music.release_type, p_artist_id uuid, p_cantor_id uuid, p_season_id uuid, p_hymn_id uuid, p_localized_titles jsonb, p_items jsonb, p_scheduled_release_at timestamp with time zone, p_original_release_date date';

  if definition is null then
    raise exception 'create_creator_submission target overload not found';
  end if;

  patched := replace(
    definition,
    E'      update media.submission_items\n      set music_track_id = new_track_id\n      where id = new_item_id;',
    E'      perform private.link_submission_item_music_track(\n        new_item_id,\n        new_track_id,\n        p_creator_account_id\n      );'
  );

  if patched = definition then
    raise exception 'create_creator_submission did not match expected submission-item link block';
  end if;

  execute patched;
end;
$patch$;
