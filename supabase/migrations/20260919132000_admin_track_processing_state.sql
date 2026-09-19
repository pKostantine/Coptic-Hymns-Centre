-- Expose the linked music track on admin submission items so CHC Admin can
-- show the real processing state beside each catalog track instead of the vague
-- "Awaiting media" label.

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
    and p.proname = 'get_admin_submission_detail'
    and pg_get_function_identity_arguments(p.oid) = 'p_submission_id uuid';

  if definition is null then
    raise exception 'get_admin_submission_detail not found';
  end if;

  if position(E'''musicTrackId'', item.music_track_id' in definition) > 0 then
    return;
  end if;

  patched := replace(
    definition,
    E'''id'', item.id,\n      ''title'', item.title,',
    E'''id'', item.id,\n      ''musicTrackId'', item.music_track_id,\n      ''title'', item.title,'
  );

  if patched = definition then
    raise exception 'Could not patch admin submission item payload';
  end if;

  execute patched;
end;
$patch$;
