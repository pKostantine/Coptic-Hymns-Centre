-- Surface release timing to CHC Admin and make the newest replacement
-- artwork the review hero rather than the oldest artwork ever submitted.
do $patch_admin_detail$
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

  patched := definition;

  if position('''releaseTimingMode'', release.release_timing_mode' in patched) = 0 then
    patched := replace(
      patched,
      E'''releaseType'', release.release_type,\n      ''releaseDate'', release.release_date,',
      E'''releaseType'', release.release_type,\n      ''releaseTimingMode'', release.release_timing_mode,\n      ''releaseDate'', release.release_date,'
    );
  end if;

  -- The standalone artwork payload previously selected the oldest item because
  -- created_at was ascending. The replacement cover must be the reviewer hero.
  patched := replace(
    patched,
    E'  order by item.sort_order, item.created_at\n  limit 1;',
    E'  order by item.created_at desc, item.id desc\n  limit 1;'
  );

  if patched = definition then
    raise exception 'Admin detail timing/artwork patch made no changes';
  end if;

  execute patched;
end;
$patch_admin_detail$;
