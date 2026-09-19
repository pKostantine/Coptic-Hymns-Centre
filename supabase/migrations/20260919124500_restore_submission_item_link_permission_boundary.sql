-- Restore the creator submission item-track link permission boundary.
--
-- 20260918195144 moved the submission_items update behind the SECURITY DEFINER
-- helper private.link_submission_item_music_track(). A later migration recreated
-- public.create_creator_submission from an older body and accidentally restored
-- the direct UPDATE. Authenticated clients intentionally only have SELECT on
-- media.submission_items, so that regression surfaced as:
--   permission denied for table submission_items
--
-- Patch the current function back to the safe helper. Do not grant creators
-- direct UPDATE access to media.submission_items.

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

  -- Idempotent: if the helper is already present, there is nothing to do.
  if position('private.link_submission_item_music_track' in definition) > 0
     and position('update media.submission_items' in definition) = 0 then
    return;
  end if;

  patched := replace(
    definition,
    E'      update media.submission_items\n      set music_track_id = new_track_id\n      where id = new_item_id;',
    E'      perform private.link_submission_item_music_track(\n        new_item_id,\n        new_track_id,\n        p_creator_account_id\n      );'
  );

  if patched = definition then
    raise exception 'create_creator_submission did not match expected direct submission_items update';
  end if;

  execute patched;
end;
$patch$;

-- Keep the table locked down. Creator writes must go through reviewed RPCs.
revoke insert, update, delete on table media.submission_items from authenticated;

-- Assert the regression is actually gone.
do $verify$
declare
  definition text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_creator_submission'
    and pg_get_function_identity_arguments(p.oid) =
      'p_creator_account_id uuid, p_mode text, p_title text, p_description text, p_release_type music.release_type, p_artist_id uuid, p_cantor_id uuid, p_season_id uuid, p_hymn_id uuid, p_localized_titles jsonb, p_items jsonb, p_scheduled_release_at timestamp with time zone, p_original_release_date date';

  if definition is null
     or position('private.link_submission_item_music_track' in definition) = 0
     or position('update media.submission_items' in definition) > 0 then
    raise exception 'submission_items permission regression was not fully removed';
  end if;
end;
$verify$;
