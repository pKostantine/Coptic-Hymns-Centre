-- 1. Psalm 64's Coptic heading spelled Jeremiah "Ⲓⲉⲣⲙⲓⲁⲥ" — the same typo the
--    Jeremiah prophecy introduction had (user-confirmed).
update bible.verses
   set coptic = replace(coptic, 'Ⲓⲉⲣⲙⲓⲁⲥ', 'Ⲓⲉⲣⲉⲙⲓⲁⲥ')
 where book_key = 'psalms' and chapter_number = 64 and verse_number = 'i'
   and coptic like '%Ⲓⲉⲣⲙⲓⲁⲥ%';

-- 2. HolyThursdayMatins: raised only by the Holy Week book's Holy Thursday
--    1st hour (holy_week.thursday_first_hour, see HOLY_WEEK_ROW_SEEDS in
--    src/constants/manifest.ts), never by the calendar.
insert into calendar.condition_flags(flag_key, flag_type, title_english, title_arabic, notes)
values ('HolyThursdayMatins', 'service', 'Holy Thursday Matins', 'باكر خميس العهد',
        'Raised only by the Holy Week book''s Holy Thursday 1st hour service (holy_week.thursday_first_hour)')
on conflict (flag_key) do nothing;

-- 3. HolyWeek (raised by the app, src/utils/conditionEngine.js) now starts
--    with Monday Eve, prayed on Palm Sunday evening; the holy-week season in
--    calendar.season_ranges still begins on Lazarus Saturday.
update calendar.condition_flags
   set notes = 'Holy Week: from Monday Eve (Palm Sunday evening, the app''s Holy Monday) through Bright Saturday. The holy-week season itself still starts on Lazarus Saturday.'
 where flag_key = 'HolyWeek';

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key in ('bible', 'calendar');
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
