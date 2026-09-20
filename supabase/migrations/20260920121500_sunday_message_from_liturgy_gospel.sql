create or replace function public.get_sunday_message(p_sunday date)
returns text
language sql
stable
as $$
  select nullif(btrim(elem->>'sunday_message'), '')
  from jsonb_array_elements(public.get_calendar_readings(p_sunday)) elem
  where elem->>'service' = 'Liturgy'
    and elem->>'reading_type' = 'Gospel'
  limit 1;
$$;

grant execute on function public.get_sunday_message(date) to anon, authenticated;
