alter table calendar.reading_rules
  add column if not exists sunday_message text;

create or replace function public.get_calendar_readings(p_date date)
returns jsonb
language plpgsql
stable
as $$
declare
  v_coptic_month int;
  v_coptic_day int;
  v_weekday int;
  v_sunday_ord int;
  v_lent_week int := null;
  v_pent_week int := null;
  v_lent_start date;
  v_pent_start date;
  v_result jsonb;
begin
  select coptic_month, coptic_day, weekday_number, sunday_ordinal_in_coptic_month
    into v_coptic_month, v_coptic_day, v_weekday, v_sunday_ord
    from calendar.coptic_date_conversions
   where gregorian_date = p_date;

  if not found then return '[]'::jsonb; end if;

  select start_date into v_lent_start
    from calendar.season_ranges
   where active_season = 'Great Fast'
     and p_date >= start_date
     and p_date <= start_date + 48
   order by start_date desc
   limit 1;

  if v_lent_start is not null then
    v_lent_week := ceil((p_date - v_lent_start + 1)::numeric / 7);
  end if;

  select start_date into v_pent_start
    from calendar.season_ranges
   where active_season = 'Holy 50 Days'
     and p_date between start_date and coalesce(end_date, p_date)
   limit 1;

  if v_pent_start is not null then
    v_pent_week := case
      when p_date = v_pent_start then 0
      else ceil((p_date - v_pent_start)::numeric / 7)
    end;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'service', r.service,
      'reading_type', r.reading_type,
      'reading_code', r.reading_code,
      'reading_reference', r.reading_reference,
      'cycle_type', r.cycle_type,
      'priority', r.priority,
      'sunday_message', r.sunday_message
    ) order by r.service, r.reading_type
  ), '[]'::jsonb)
  into v_result
  from (
    select distinct on (rr.service, rr.reading_type) rr.*
      from calendar.reading_rules rr
     where (
       (rr.cycle_type = 'AnnualDaily'
          and rr.coptic_month = v_coptic_month
          and rr.coptic_day = v_coptic_day)
       or
       (rr.cycle_type = 'AnnualSunday'
          and v_weekday = 0
          and rr.coptic_month = v_coptic_month
          and rr.sunday_ordinal = v_sunday_ord
          and (rr.day_of_week is null or rr.day_of_week = v_weekday))
       or
       (rr.cycle_type = 'GreatLent'
          and v_lent_week is not null
          and rr.lent_week = v_lent_week
          and (rr.day_of_week is null or rr.day_of_week = v_weekday))
       or
       (rr.cycle_type = 'Pentecost'
          and v_pent_week is not null
          and rr.pentecost_week = v_pent_week
          and (rr.day_of_week is null or rr.day_of_week = v_weekday))
     )
     order by rr.service, rr.reading_type, rr.priority desc
  ) r;

  return v_result;
end;
$$;

create or replace function public.get_sunday_message(p_sunday date)
returns text
language sql
stable
as $$
  select elem->>'sunday_message'
  from jsonb_array_elements(public.get_calendar_readings(p_sunday)) elem
  where nullif(btrim(elem->>'sunday_message'), '') is not null
  limit 1;
$$;

create or replace function public.get_home_synaxarium_events(p_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'entryKey', e.entry_key,
      'titleEnglish', e.title_english,
      'titleArabic', e.title_arabic,
      'entryOrder', e.entry_order
    )
    order by e.entry_order
  ), '[]'::jsonb)
  from calendar.coptic_date_conversions d
  join synaxarium.entries e
    on e.coptic_month = d.coptic_month
   and e.coptic_day = d.coptic_day
  where d.gregorian_date = p_date;
$$;

grant execute on function public.get_sunday_message(date) to anon, authenticated;
grant execute on function public.get_home_synaxarium_events(date) to anon, authenticated;
