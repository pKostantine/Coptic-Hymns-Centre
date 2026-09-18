-- The 48-hour floor is enforced here as well as in the submission RPC, so a
-- release cannot be scheduled inside the review window by any path.
--
-- Only the moment a release is first created, and any later change to the
-- scheduled time, are checked. An untouched schedule on an existing row is left
-- alone: a release legitimately becomes "due today" as its date approaches.
create or replace function private.enforce_release_scheduling_window()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  floor_at timestamptz;
begin
  if new.scheduled_release_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.scheduled_release_at is not distinct from new.scheduled_release_at then
    return new;
  end if;

  floor_at := date_trunc('hour', now()) + interval '48 hours';

  if new.scheduled_release_at < floor_at then
    raise exception 'A release must be scheduled at least 48 hours out (earliest %)',
      to_char(floor_at, 'YYYY-MM-DD HH24:MI') || ' UTC'
      using errcode = '22023';
  end if;

  return new;
end;
$function$;

drop trigger if exists releases_enforce_scheduling_window on music.releases;

create trigger releases_enforce_scheduling_window
before insert or update of scheduled_release_at
on music.releases
for each row
execute function private.enforce_release_scheduling_window();
