-- Joyful 29 is a festive observance and must satisfy hymn/document rows whose
-- condition is the aggregate `Feasts` flag. Keep the raw day-29 markers alone:
-- months in which the 29th is not celebrated joyfully must not become feasts.

do $migration$
declare
  v_definition text;
  v_old text := 'RETURN QUERY VALUES (''Joyful29'',''season_feast'',''Joyful 29th''),(''Joyful29thOfTheMonth'',''season_feast'',''Joyful 29th of the Month'');';
  v_new text := 'RETURN QUERY VALUES (''Joyful29'',''season_feast'',''Joyful 29th''),(''Joyful29thOfTheMonth'',''season_feast'',''Joyful 29th of the Month''),(''Feasts'',''season_feast'',''Feasts'');';
begin
  select pg_catalog.pg_get_functiondef('calendar.get_active_flags_for_date(date)'::regprocedure)
    into v_definition;

  if strpos(v_definition, v_new) > 0 then
    return;
  end if;
  if strpos(v_definition, v_old) = 0 then
    raise exception 'Unable to locate the Joyful 29 return clause in calendar.get_active_flags_for_date(date)';
  end if;

  execute replace(v_definition, v_old, v_new);
end
$migration$;

-- Function DDL does not fire the table-change triggers used by the native
-- package publisher, so explicitly invalidate Calendar's materialized RPCs.
update offline_content.resources
   set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key = 'calendar';

insert into offline_content.publication_requests(status)
values ('queued')
on conflict do nothing;
