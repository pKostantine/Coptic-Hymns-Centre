-- The prophecies, read the way the other readings are: an introduction naming
-- the prophet, the reading with its citation, and a conclusion, from
-- readings.prophecy / readings.coptic_prophecy.
--
-- 1. The day's readings. calendar.season_ranges calls the fast "Lent" — the
--    lookups for "Great Fast" found nothing, so no Lenten reading (prophecies
--    included) ever resolved. And a Lenten Matins reads several prophecies
--    (prophecy_1 … prophecy_n), where DISTINCT ON (service, reading_type) kept
--    only one: the winning cycle is still chosen per (service, reading_type),
--    but every reading of that cycle is now returned, in reading order.

create or replace function public.get_calendar_readings(p_date date)
 returns jsonb
 language plpgsql
 stable
as $function$
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

  -- Great Lent: weeks 1..7 span start .. start+48 (Lazarus Saturday and Palm Sunday inclusive).
  select start_date into v_lent_start
    from calendar.season_ranges
   where active_season in ('Lent', 'Great Fast')
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

  with candidates as (
    select rr.*
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
  ),
  winners as (
    select distinct on (c.service, c.reading_type) c.service, c.reading_type, c.cycle_type, c.priority
      from candidates c
     order by c.service, c.reading_type, c.priority desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'service', c.service,
      'reading_type', c.reading_type,
      'reading_code', c.reading_code,
      'reading_reference', c.reading_reference,
      'cycle_type', c.cycle_type,
      'priority', c.priority,
      'sunday_message', c.sunday_message
    ) order by c.service, c.reading_type,
               coalesce(substring(c.reading_code from '(\d+)$')::int, 0), c.reading_code
  ), '[]'::jsonb)
  into v_result
  from candidates c
  join winners w
    on w.service = c.service
   and w.reading_type = c.reading_type
   and w.cycle_type is not distinct from c.cycle_type
   and w.priority is not distinct from c.priority;

  return v_result;
end;
$function$;

create or replace function calendar.get_calendar_readings(p_date date)
 returns jsonb
 language plpgsql
 stable
as $function$
declare
  v_coptic_month int;
  v_coptic_day   int;
  v_weekday      int;
  v_sunday_ord   int;
  v_lent_week    int := null;
  v_pent_week    int := null;
  v_lent_start   date;
  v_pent_start   date;
  v_result       jsonb;
begin
  select coptic_month, coptic_day, weekday_number, sunday_ordinal_in_coptic_month
    into v_coptic_month, v_coptic_day, v_weekday, v_sunday_ord
    from calendar.coptic_date_conversions
   where gregorian_date = p_date;

  if not found then return '[]'::jsonb; end if;

  select start_date into v_lent_start
    from calendar.season_ranges
   where active_season in ('Lent', 'Great Fast')
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

  with candidates as (
    select rr.*
      from calendar.reading_rules rr
     where (
       (rr.cycle_type = 'AnnualDaily'
          and rr.coptic_month = v_coptic_month
          and rr.coptic_day   = v_coptic_day)
       or
       (rr.cycle_type = 'AnnualSunday'
          and v_weekday = 0
          and rr.coptic_month   = v_coptic_month
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
  ),
  winners as (
    select distinct on (c.service, c.reading_type) c.service, c.reading_type, c.cycle_type, c.priority
      from candidates c
     order by c.service, c.reading_type, c.priority desc
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'service',            c.service,
      'reading_type',       c.reading_type,
      'reading_code',       c.reading_code,
      'reading_reference',  c.reading_reference,
      'cycle_type',         c.cycle_type,
      'priority',           c.priority
    ) order by c.service, c.reading_type,
               coalesce(substring(c.reading_code from '(\d+)$')::int, 0), c.reading_code
  ), '[]'::jsonb)
  into v_result
  from candidates c
  join winners w
    on w.service = c.service
   and w.reading_type = c.reading_type
   and w.cycle_type is not distinct from c.cycle_type
   and w.priority is not distinct from c.priority;

  return v_result;
end;
$function$;

-- 2. Every prophet's introduction. Isaiah's two lines were typed in by hand;
--    the other twenty come from the introductions Holy Week used to carry
--    (backup.holy_week_prophecy_introduction_texts_before_readings_move_2026),
--    one line per book, each switched on by its own Prophecy<Book> flag. The
--    Coptic introduction ends "… Amen. He says:" as Isaiah's does — the same
--    transformation reproduces Isaiah's hand-typed line exactly.
update readings.hymn_texts set line_order = 9
 where hymn_key in ('introductionToTheProphecy', 'introductionToTheCopticProphecy')
   and condition = 'ProphecyIsaiah';

with books(src_order, flag) as (values
  (1, 'ProphecyGenesis'), (2, 'ProphecyExodus'), (3, 'ProphecyNumbers'), (4, 'ProphecyDeuteronomy'),
  (5, 'ProphecyJob'), (6, 'ProphecyProverbs'), (7, 'ProphecyWisdom'), (8, 'ProphecySirach'),
  (10, 'ProphecyJeremiah'), (11, 'ProphecyLamentations'), (12, 'ProphecyEzekiel'), (13, 'ProphecyDaniel'),
  (14, 'ProphecyHosea'), (15, 'ProphecyJoel'), (16, 'ProphecyAmos'), (17, 'ProphecyMicah'),
  (18, 'ProphecyNahum'), (19, 'ProphecyMalachi'), (20, 'ProphecyZephaniah'), (21, 'ProphecyZechariah')
),
source as (
  select b.line_order::int as src_order, b.english, b.coptic, b.arabic, books.flag
    from backup.holy_week_prophecy_introduction_texts_before_readings_move_2026 b
    join books on books.src_order = b.line_order::int
),
base as (select max(line_id) as max_id from readings.hymn_texts)
insert into readings.hymn_texts(line_id, hymn_key, line_order, english, coptic, arabic, person_type, condition)
select base.max_id + row_number() over (order by kind, s.src_order),
       case kind when 1 then 'introductionToTheProphecy' else 'introductionToTheCopticProphecy' end,
       s.src_order,
       case kind when 1 then s.english else regexp_replace(s.english, '^A reading from ', 'From ') || ' He says:' end,
       case kind when 1 then null else replace(s.coptic, 'ⲁ̀ⲙⲏⲛ ⲉϥϫⲱ', 'ⲁ̀ⲙⲏⲛ. ⲉϥϫⲱ') end,
       case kind when 1 then s.arabic else s.arabic || ' يقول:' end,
       'Reader',
       s.flag
  from source s
 cross join (values (1), (2)) as kinds(kind)
 cross join base;

insert into calendar.condition_flags(flag_key, flag_type, title_english, title_arabic)
select 'Prophecy' || replace(initcap(replace(b.book_key, '_', ' ')), ' ', ''), 'reading',
       'Prophecy: ' || b.title_english, 'النبوة: ' || b.title_arabic
  from bible.books b
 where b.book_key in ('genesis','exodus','numbers','deuteronomy','job','proverbs','wisdom','sirach',
                      'jeremiah','lamentations','ezekiel','daniel','hosea','joel','amos','micah',
                      'nahum','malachi','zephaniah','zechariah')
on conflict do nothing;

update calendar.condition_flags set title_arabic = 'النبوة: إشعياء'
 where flag_key = 'ProphecyIsaiah' and title_arabic is null;

-- 3. Where the prophecies are read. The Lectionary's Matins now reads them as
--    Raising of Incense does: the Coptic prophecies as one subdocument, then
--    each prophecy in English/Arabic. Holy Week's hours gain the same Coptic
--    subdocument ahead of their first prophecy.
insert into liturgy.hymn_titles(hymn_key, title_english, title_arabic, category, toggled)
values ('COPTIC_PROPHECY', 'Coptic Prophecies', 'النبوات القبطية', 'lent', true)
on conflict (hymn_key) do nothing;

insert into holy_week.hymn_titles(hymn_key, title_english, title_arabic, category, toggled)
values ('COPTIC_PROPHECY', 'Coptic Prophecies', 'النبوات القبطية', 'pascha_hour', true)
on conflict (hymn_key) do nothing;

update liturgy.lectionary_matins set hymn_key = 'PROPHECY'
 where hymn_key = 'PROPHECIES';

insert into liturgy.lectionary_matins(item_order, hymn_key, condition, item_type)
select 0.5, 'COPTIC_PROPHECY', condition, 'Subdocument'
  from liturgy.lectionary_matins
 where hymn_key = 'PROPHECY'
   and not exists (select 1 from liturgy.lectionary_matins where hymn_key = 'COPTIC_PROPHECY');

insert into holy_week.pascha_hour(item_order, hymn_key, item_type)
select 0.5, 'COPTIC_PROPHECY', 'Subdocument' where not exists (select 1 from holy_week.pascha_hour where hymn_key = 'COPTIC_PROPHECY');
insert into holy_week.thursday_first_hour(item_order, hymn_key, item_type)
select 0.5, 'COPTIC_PROPHECY', 'Subdocument' where not exists (select 1 from holy_week.thursday_first_hour where hymn_key = 'COPTIC_PROPHECY');
insert into holy_week.good_friday_sixth_hour(item_order, hymn_key, item_type)
select 0.5, 'COPTIC_PROPHECY', 'Subdocument' where not exists (select 1 from holy_week.good_friday_sixth_hour where hymn_key = 'COPTIC_PROPHECY');
insert into holy_week.good_friday_ninth_hour(item_order, hymn_key, item_type)
select 0.5, 'COPTIC_PROPHECY', 'Subdocument' where not exists (select 1 from holy_week.good_friday_ninth_hour where hymn_key = 'COPTIC_PROPHECY');
insert into holy_week.good_friday_twelfth_hour(item_order, hymn_key, item_type)
select 0.5, 'COPTIC_PROPHECY', 'Subdocument' where not exists (select 1 from holy_week.good_friday_twelfth_hour where hymn_key = 'COPTIC_PROPHECY');

-- 4. Offline books. Holy Week now reads readings.prophecy/coptic_prophecy, so
--    an offline Holy Week install must include the readings package (mirrors
--    CONTENT_RESOURCE_DEPENDENCIES.holy_week in
--    src/constants/bookDependencyRegistry.ts). calendar's packaged
--    get_readings_for_date results change with the function above.
insert into offline_content.resource_dependencies(resource_key, dependency_key) values
  ('holy_week', 'readings')
on conflict do nothing;

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key in ('calendar', 'readings', 'liturgy', 'holy_week');
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
