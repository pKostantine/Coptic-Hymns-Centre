-- Song of Songs in Coptic, and the Coptic Jeremiah prophecy introduction's
-- misspelled name ("Ⲓⲉⲣⲙⲓⲁⲥ" for "Ⲓⲉⲣⲉⲙⲓⲁⲥ", as the Bible text and the
-- Lamentations introduction spell it). Both confirmed by the user.

update bible.books set title_coptic = 'Ⲡⲓϫⲱ ⲛ̀ⲧⲉ ⲛⲓϫⲱ' where book_key = 'song_of_songs';

update readings.hymn_texts
   set coptic = replace(coptic, 'Ⲓⲉⲣⲙⲓⲁⲥ', 'Ⲓⲉⲣⲉⲙⲓⲁⲥ')
 where hymn_key = 'introductionToTheCopticProphecy'
   and condition = 'ProphecyJeremiah'
   and coptic like '%Ⲓⲉⲣⲙⲓⲁⲥ%';

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key in ('bible', 'readings');
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
