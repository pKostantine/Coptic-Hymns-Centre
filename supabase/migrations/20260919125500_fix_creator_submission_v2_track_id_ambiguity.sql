-- Fix PL/pgSQL name collision in create_creator_submission_v2.
--
-- The function declared a local variable named track_id and later used
-- ON CONFLICT (track_id, locale). PostgreSQL could not determine whether that
-- identifier meant the PL/pgSQL variable or the track_localizations column,
-- producing "column reference track_id is ambiguous".
--
-- Rename the local variable to v_track_id. The conflict target remains the
-- actual table column name.

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
    and p.proname = 'create_creator_submission_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'p_creator_account_id uuid, p_mode text, p_title text, p_description text, p_release_type music.release_type, p_music_type text, p_recording_type text, p_artist_id uuid, p_cantor_id uuid, p_season_id uuid, p_hymn_id uuid, p_localized_titles jsonb, p_items jsonb, p_scheduled_release_at timestamp with time zone, p_original_release_date date';

  if definition is null then
    raise exception 'create_creator_submission_v2 target overload not found';
  end if;

  if position(E'  v_track_id uuid;' in definition) > 0 then
    return;
  end if;

  patched := definition;
  patched := replace(patched, E'  track_id uuid;', E'  v_track_id uuid;');
  patched := replace(patched, E'    into track_id\n', E'    into v_track_id\n');
  patched := replace(patched, E'    if track_id is null then', E'    if v_track_id is null then');
  patched := replace(
    patched,
    E'    perform private.set_track_credit_names(\n      track_id,',
    E'    perform private.set_track_credit_names(\n      v_track_id,'
  );
  patched := replace(
    patched,
    E'      values (\n        track_id,\n        locale_entry.locale,',
    E'      values (\n        v_track_id,\n        locale_entry.locale,'
  );

  if patched = definition
     or position(E'  v_track_id uuid;' in patched) = 0
     or position(E'  track_id uuid;' in patched) > 0
     or position(E'    into track_id\n' in patched) > 0
     or position(E'    if track_id is null then' in patched) > 0
     or position(E'    perform private.set_track_credit_names(\n      track_id,' in patched) > 0
     or position(E'      values (\n        track_id,\n        locale_entry.locale,' in patched) > 0 then
    raise exception 'create_creator_submission_v2 track_id rename was incomplete';
  end if;

  execute patched;
end;
$patch$;

do $verify$
declare
  definition text;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_creator_submission_v2'
    and pg_get_function_identity_arguments(p.oid) =
      'p_creator_account_id uuid, p_mode text, p_title text, p_description text, p_release_type music.release_type, p_music_type text, p_recording_type text, p_artist_id uuid, p_cantor_id uuid, p_season_id uuid, p_hymn_id uuid, p_localized_titles jsonb, p_items jsonb, p_scheduled_release_at timestamp with time zone, p_original_release_date date';

  if definition is null
     or position(E'  v_track_id uuid;' in definition) = 0
     or position(E'  track_id uuid;' in definition) > 0 then
    raise exception 'track_id ambiguity fix was not applied';
  end if;
end;
$verify$;
