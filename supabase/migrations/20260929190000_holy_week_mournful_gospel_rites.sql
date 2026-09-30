-- Holy Week's Psalm and Gospel are read in the user-built mournful Gospel
-- rites: gospel_rite.mournful_gospel_rite (one Gospel) through the week, and
-- gospel_rite.mournful_4_gospels_rite (four) on Friday Eve and Good Friday.
-- MOURNFUL_GOSPEL_RITE stops being a reading_rules sentinel and becomes a
-- whole-table splice like GOSPEL_RITE (src/utils/hymnLibrary.js
-- SUBDOCUMENT_MAP), with the Coptic Gospel Rite toggle. The rites' readings
-- (PSALM_/GOSPEL_/FIRST_…FOURTH_GOSPEL_WITH/WITHOUT_COPTIC) come from the
-- hour's own holy_week.reading_rules (PASCHA_RITE_READINGS).

-- 1. Both rites open with the mournful Coptic Psalm ("A Psalm of David.",
--    then the hour's Psalm). copticPsalm reads only a Vespers, Matins or
--    Liturgy Psalm, none of which a Holy Week hour has.
update gospel_rite.mournful_gospel_rite
   set hymn_key = 'mournfulCopticPsalm'
 where item_order = 1 and hymn_key = 'copticPsalm';
update gospel_rite.mournful_4_gospels_rite
   set hymn_key = 'mournfulCopticPsalm'
 where item_order = 1 and hymn_key = 'copticPsalm';

-- Its row is Minimized, so it needs copticPsalm's title to collapse under.
update gospel_rite.hymn_titles m
   set title_english = c.title_english, title_arabic = c.title_arabic, title_french = c.title_french
  from gospel_rite.hymn_titles c
 where c.hymn_key = 'copticPsalm' and m.hymn_key = 'mournfulCopticPsalm' and m.title_english is null;

-- The four Coptic Gospels open as their own subdocument; its button needs a name.
update gospel_rite.hymn_titles
   set title_english = 'Coptic Gospels', title_arabic = 'الأناجيل القبطية', title_french = 'Évangiles coptes'
 where hymn_key = 'mournful4CopticGospels' and title_english is null;

-- 2. The rites' headings in the hours, named like GOSPEL_RITE's.
update holy_week.hymn_titles
   set title_english = 'Psalm and Gospel', title_arabic = 'المزمور والإنجيل', title_french = 'Psaume et Évangile'
 where hymn_key = 'MOURNFUL_GOSPEL_RITE';
insert into holy_week.hymn_titles(hymn_key, title_english, title_arabic, title_french, toggled)
select 'MOURNFUL_4_GOSPELS_RITE', 'Psalm and Gospels', 'المزمور والأناجيل', 'Psaume et Évangiles', toggled
  from holy_week.hymn_titles where hymn_key = 'MOURNFUL_GOSPEL_RITE'
on conflict (hymn_key) do nothing;

-- 3. The shared hour: one Gospel, except on Friday Eve and Good Friday (both
--    carry the GoodFriday day token). Interpretations of the Gospel, which
--    the old sentinel read after it, keep their place through
--    PASCHA_GOSPEL_INTERPRETATIONS.
update holy_week.pascha_hour
   set condition = '!GoodFriday'
 where item_order = 7 and hymn_key = 'MOURNFUL_GOSPEL_RITE';
insert into holy_week.pascha_hour(item_order, hymn_key, condition, item_type) values
  (7.3, 'MOURNFUL_4_GOSPELS_RITE', 'GoodFriday', 'Inline'),
  (7.6, 'PASCHA_GOSPEL_INTERPRETATIONS', null, 'Inline')
on conflict (item_order) do nothing;

-- Holy Thursday's 1st hour reads one Gospel.
insert into holy_week.thursday_first_hour(item_order, hymn_key, condition, item_type)
values (36.5, 'PASCHA_GOSPEL_INTERPRETATIONS', null, 'Inline')
on conflict (item_order) do nothing;

-- Good Friday's own hours read four. The 6th and 9th already follow theirs
-- with the Gospels' interpretation.
update holy_week.good_friday_sixth_hour set hymn_key = 'MOURNFUL_4_GOSPELS_RITE' where hymn_key = 'MOURNFUL_GOSPEL_RITE';
update holy_week.good_friday_ninth_hour set hymn_key = 'MOURNFUL_4_GOSPELS_RITE' where hymn_key = 'MOURNFUL_GOSPEL_RITE';
update holy_week.good_friday_twelfth_hour set hymn_key = 'MOURNFUL_4_GOSPELS_RITE' where hymn_key = 'MOURNFUL_GOSPEL_RITE';
insert into holy_week.good_friday_twelfth_hour(item_order, hymn_key, condition, item_type)
values (4.5, 'PASCHA_GOSPEL_INTERPRETATIONS', null, 'Inline')
on conflict (item_order) do nothing;

-- 4. FridayEve1stHour: its four Gospels are all John's. Raised only by the
--    Holy Week book's Friday Eve 1st hour (src/constants/manifest.ts).
insert into calendar.condition_flags(flag_key, flag_type, title_english, title_arabic, notes)
values ('FridayEve1stHour', 'service', 'Friday Eve 1st Hour', 'الساعة الأولى من ليلة الجمعة',
        'Raised only by the Holy Week book''s Friday Eve 1st hour (pascha_hour); picks the mournful four-Gospel rite''s John-only lines')
on conflict (flag_key) do nothing;

-- 5. The new rite tables had row security on and no policy, so the app read
--    them as empty. Same public read as gospel_rite.gospel_rite (the Palm
--    Sunday Liturgy rite too, which had the same gap).
create policy "Allow public read access" on gospel_rite.mournful_gospel_rite
  for select to anon, authenticated using (true);
create policy "Allow public read access" on gospel_rite.mournful_4_gospels_rite
  for select to anon, authenticated using (true);
create policy "Allow public read access" on gospel_rite.palm_sunday_liturgy_gospel_rite
  for select to anon, authenticated using (true);

-- 6. Offline: the Holy Week book reads the rites (src/constants/
--    bookDependencyRegistry.ts), and the new tables get change triggers.
insert into offline_content.resource_dependencies(resource_key, dependency_key) values
  ('holy_week', 'gospel_rite')
on conflict do nothing;
select offline_content.refresh_change_triggers();

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key in ('holy_week', 'gospel_rite', 'calendar');
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
