-- Palm Sunday's Liturgy reads its Psalms and Gospels through the user-built
-- gospel_rite.palm_sunday_liturgy_gospel_rite (two Psalms, four Gospels),
-- spliced in place of GOSPEL_RITE like the other rites
-- (src/utils/hymnLibrary.js SUBDOCUMENT_MAP, GOSPEL_RITE_KEYS). Its rows name
-- their Psalm/Gospel with implying_conditions (FirstPsalm, FourthGospel, ...),
-- and the readings resolve by ordinal (FIRST_LITURGY_PSALM_…, …).

-- 1. The Liturgy of the Word and the Lectionary Liturgy take the Palm Sunday
--    rite on Palm Sunday, the ordinary one every other day.
update liturgy.liturgy_of_the_word
   set condition = '!PalmSunday'
 where item_order = 34 and hymn_key = 'GOSPEL_RITE' and condition is null;
insert into liturgy.liturgy_of_the_word(item_order, hymn_key, condition, item_type)
values (34.5, 'PALM_SUNDAY_LITURGY_GOSPEL_RITE', 'PalmSunday', 'Inline')
on conflict (item_order) do nothing;

update liturgy.lectionary_liturgy
   set condition = '!PalmSunday'
 where item_order = 8 and hymn_key = 'GOSPEL_RITE' and condition is null;
insert into liturgy.lectionary_liturgy(item_order, hymn_key, condition, item_type)
select 8.5, 'PALM_SUNDAY_LITURGY_GOSPEL_RITE', 'PalmSunday', 'Inline'
 where not exists (select 1 from liturgy.lectionary_liturgy where hymn_key = 'PALM_SUNDAY_LITURGY_GOSPEL_RITE');

insert into liturgy.hymn_titles(hymn_key, title_english, title_arabic, title_french, toggled)
values ('PALM_SUNDAY_LITURGY_GOSPEL_RITE', 'Psalms and Gospels', 'المزامير والأناجيل', 'Psaumes et Évangiles', true)
on conflict (hymn_key) do nothing;

-- 2. introductionAndPsalm is read twice in that rite (FirstGospel, then
--    FourthGospel) and read the day's first Liturgy Psalm both times. The
--    second reading takes the second Psalm, as copticPsalm already does.
update gospel_rite.hymn_texts
   set condition = 'Liturgy && !PalmSunday'
 where hymn_key = 'introductionAndPsalm' and line_order = 6
   and inline_hymn_key = 'LITURGY_PSALM_WITHOUT_COPTIC' and condition = 'Liturgy';
insert into gospel_rite.hymn_texts(line_id, hymn_key, line_order, condition, item_type, inline_hymn_key)
select 77.51, 'introductionAndPsalm', 6.1, 'Liturgy && PalmSunday && FirstGospel', 'Inline', 'FIRST_LITURGY_PSALM_WITHOUT_COPTIC'
 where not exists (select 1 from gospel_rite.hymn_texts where hymn_key = 'introductionAndPsalm' and inline_hymn_key = 'FIRST_LITURGY_PSALM_WITHOUT_COPTIC');
insert into gospel_rite.hymn_texts(line_id, hymn_key, line_order, condition, item_type, inline_hymn_key)
select 77.52, 'introductionAndPsalm', 6.2, 'Liturgy && PalmSunday && FourthGospel', 'Inline', 'SECOND_LITURGY_PSALM_WITHOUT_COPTIC'
 where not exists (select 1 from gospel_rite.hymn_texts where hymn_key = 'introductionAndPsalm' and inline_hymn_key = 'SECOND_LITURGY_PSALM_WITHOUT_COPTIC');

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key in ('liturgy', 'gospel_rite');
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
