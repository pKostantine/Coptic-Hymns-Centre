create or replace function public.get_synaxarium_year(p_reference_date date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with reference_day as (
    select coptic_year
    from calendar.coptic_date_conversions
    where gregorian_date = p_reference_date
    limit 1
  ),
  days as (
    select
      d.gregorian_date,
      d.coptic_year,
      d.coptic_month,
      d.coptic_month_name,
      d.coptic_day,
      d.weekday_number
    from calendar.coptic_date_conversions d
    join reference_day r on r.coptic_year = d.coptic_year
  ),
  entries as (
    select
      days.gregorian_date,
      days.coptic_year,
      days.coptic_month,
      days.coptic_month_name,
      days.coptic_day,
      days.weekday_number,
      e.entry_key,
      e.entry_order,
      e.title_english,
      e.title_arabic
    from days
    left join synaxarium.entries e
      on e.coptic_month = days.coptic_month
     and e.coptic_day = days.coptic_day
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'gregorianDate', gregorian_date,
        'copticYear', coptic_year,
        'copticMonth', coptic_month,
        'copticMonthName', coptic_month_name,
        'copticDay', coptic_day,
        'weekdayNumber', weekday_number,
        'entryKey', entry_key,
        'entryOrder', entry_order,
        'titleEnglish', title_english,
        'titleArabic', title_arabic
      )
      order by gregorian_date, entry_order nulls last
    ),
    '[]'::jsonb
  )
  from entries;
$$;

revoke all on function public.get_synaxarium_year(date) from public;
grant execute on function public.get_synaxarium_year(date) to anon, authenticated;

comment on function public.get_synaxarium_year(date) is
  'Returns the full Coptic year containing p_reference_date, with each Gregorian date joined to its Synaxarium entry titles.';
