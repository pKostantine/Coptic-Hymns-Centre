-- Bible book names in every language the reader shows, so a copied verse is
-- signed with its reference in the language it was copied from — and so the
-- Bible's menus can be shown in French.
--
-- title_coptic already existed but was empty. Its names come, in order of
-- preference, from:
--   * readings.hymn_texts — the Coptic prophecy and Catholic Epistle
--     introductions (Genesis, Exodus, Numbers, Deuteronomy, Job, Proverbs,
--     Wisdom, Sirach, Isaiah, Lamentations, Ezekiel, Daniel, the Minor
--     Prophets read in church, James, Peter, John, Jude) and Acts;
--   * gospel_rite.hymn_texts (the four Gospels, "Ⲕⲁⲧⲁ …") and the Psalm
--     introduction ("Ⲯⲁⲗⲙⲟⲥ");
--   * The Coptist's survey of the Bohairic Bible (coptist.com, 2024:
--     Leviticus, Joshua, Judges, Ruth, I–IV Kingdoms, Chronicles, Esther,
--     Judith, Tobit);
--   * the names as the Coptic Bible text itself spells them (Obadiah, Jonah,
--     Habakkuk, Haggai, Baruch, Jeremiah, the Pauline Epistles' recipients,
--     Revelation 1:1).
-- Books with no Coptic text and no sourced name stay null; a copy falls back
-- to the English name.

alter table bible.books add column if not exists title_greek text;
alter table bible.books add column if not exists title_french text;

update bible.books b
   set title_coptic = v.coptic,
       title_greek = v.greek,
       title_french = v.french
  from (values
    ('genesis', 'Ϯⲅⲉⲛⲉⲥⲓⲥ', 'Γένεσις', 'Genèse'),
    ('exodus', 'Ⲡⲓⲇⲟⲝⲟⲇⲟⲥ', 'Ἔξοδος', 'Exode'),
    ('leviticus', 'Ⲡⲓⲗⲉⲩⲓ̀ⲧⲓⲕⲟⲛ', 'Λευιτικόν', 'Lévitique'),
    ('numbers', 'Ⲡⲓⲁ̀ⲣⲓⲑⲙⲟⲥ', 'Ἀριθμοί', 'Nombres'),
    ('deuteronomy', 'Ⲡⲓⲇⲉⲩⲧⲉⲣⲟⲛⲟⲙⲓⲟⲛ', 'Δευτερονόμιον', 'Deutéronome'),
    ('joshua', 'Ⲓⲏⲥⲟⲩ ⲛ̀Ⲛⲁⲩⲏ̀', 'Ἰησοῦς Ναυῆ', 'Josué'),
    ('judges', 'Ⲛⲓⲕⲣⲓⲧⲏⲥ', 'Κριταί', 'Juges'),
    ('ruth', 'Ⲣⲟⲩⲑ', 'Ῥούθ', 'Ruth'),
    ('first_samuel', 'Ϯϣⲟⲣⲡⲓ ⲙ̀ⲙⲉⲧⲟⲩⲣⲟ', 'Αʹ Βασιλειῶν', '1 Samuel'),
    ('second_samuel', 'Ϯⲙⲁϩⲃ̅ϯ ⲙ̀ⲙⲉⲧⲟⲩⲣⲟ', 'Βʹ Βασιλειῶν', '2 Samuel'),
    ('first_kings', 'Ϯⲙⲁϩⲅ̅ϯ ⲙ̀ⲙⲉⲧⲟⲩⲣⲟ', 'Γʹ Βασιλειῶν', '1 Rois'),
    ('second_kings', 'Ϯⲙⲁϩⲇ̅ ⲙ̀ⲙⲉⲧⲟⲩⲣⲟ', 'Δʹ Βασιλειῶν', '2 Rois'),
    ('first_chronicles', 'Ϯϣⲟⲣⲡⲓ ⲙ̀Ⲡⲁⲣⲁⲗⲟⲓⲡⲟⲙⲉⲛⲟⲛ', 'Αʹ Παραλειπομένων', '1 Chroniques'),
    ('second_chronicles', 'Ϯⲙⲁϩⲃ̅ϯ ⲙ̀Ⲡⲁⲣⲁⲗⲟⲓⲡⲟⲙⲉⲛⲟⲛ', 'Βʹ Παραλειπομένων', '2 Chroniques'),
    ('first_ezra', null, 'Αʹ Ἔσδρας', '1 Esdras'),
    ('ezra', null, 'Βʹ Ἔσδρας', 'Esdras'),
    ('nehemiah', null, 'Νεεμίας', 'Néhémie'),
    ('tobit', 'Ⲇⲱⲃⲓⲧ', 'Τωβίτ', 'Tobie'),
    ('judith', 'Ⲓⲟⲩⲇⲓⲑ', 'Ἰουδίθ', 'Judith'),
    ('esther', 'Ⲉⲥⲑⲏⲣ', 'Ἐσθήρ', 'Esther'),
    ('first_maccabees', null, 'Αʹ Μακκαβαίων', '1 Maccabées'),
    ('second_maccabees', null, 'Βʹ Μακκαβαίων', '2 Maccabées'),
    ('third_maccabees', null, 'Γʹ Μακκαβαίων', '3 Maccabées'),
    ('psalms', 'Ⲛⲓⲯⲁⲗⲙⲟⲥ', 'Ψαλμοί', 'Psaumes'),
    ('job', 'Ⲓⲱⲃ', 'Ἰώβ', 'Job'),
    ('proverbs', 'Ⲛⲓⲡⲁⲣⲟⲓⲙⲓⲁ̀ ⲛ̀ⲧⲉ Ⲥⲟⲗⲟⲙⲱⲛ', 'Παροιμίαι', 'Proverbes'),
    ('ecclesiastes', null, 'Ἐκκλησιαστής', 'Ecclésiaste'),
    ('song_of_songs', null, 'ᾎσμα ᾀσμάτων', 'Cantique des Cantiques'),
    ('wisdom', 'Ϯⲥⲟⲫⲓⲁ̀ ⲛ̀ⲧⲉ Ⲥⲟⲗⲟⲙⲱⲛ', 'Σοφία Σαλωμῶνος', 'Sagesse'),
    ('sirach', 'Ⲓⲏⲥⲟⲩ ⲛ̀ⲧⲉ Ⲥⲓⲣⲁⲭ', 'Σοφία Σειράχ', 'Siracide'),
    ('hosea', 'Ⲱⲥⲓⲉ̀', 'Ὡσηέ', 'Osée'),
    ('amos', 'Ⲁⲙⲱⲥ', 'Ἀμώς', 'Amos'),
    ('micah', 'Ⲙⲓⲭⲉⲟⲥ', 'Μιχαίας', 'Michée'),
    ('joel', 'Ⲓⲟⲩⲏⲗ', 'Ἰωήλ', 'Joël'),
    ('obadiah', 'Ⲁⲃⲇⲓⲟⲩ', 'Ἀβδιού', 'Abdias'),
    ('jonah', 'Ⲓⲱⲛⲁ', 'Ἰωνᾶς', 'Jonas'),
    ('nahum', 'Ⲛⲁⲟⲩⲙ', 'Ναούμ', 'Nahum'),
    ('habakkuk', 'Ⲁⲃⲃⲁⲕⲟⲩⲙ', 'Ἀμβακούμ', 'Habacuc'),
    ('zephaniah', 'Ⲥⲟⲫⲟⲛⲓⲁⲥ', 'Σοφονίας', 'Sophonie'),
    ('haggai', 'Ⲁⲅⲅⲉⲟⲥ', 'Ἀγγαῖος', 'Aggée'),
    ('zechariah', 'Ⲍⲁⲭⲁⲣⲓⲁⲥ', 'Ζαχαρίας', 'Zacharie'),
    ('malachi', 'Ⲙⲁⲗⲁⲭⲓⲁⲥ', 'Μαλαχίας', 'Malachie'),
    ('isaiah', 'Ⲏⲥⲁⲏ̀ⲁⲥ', 'Ἠσαΐας', 'Isaïe'),
    ('jeremiah', 'Ⲓⲉⲣⲉⲙⲓⲁⲥ', 'Ἱερεμίας', 'Jérémie'),
    ('baruch', 'Ⲃⲁⲣⲟⲩⲭ', 'Βαρούχ', 'Baruch'),
    ('lamentations', 'Ⲑⲣⲓⲛⲓⲟ Ⲓⲉⲣⲉⲙⲓⲟⲩ', 'Θρῆνοι', 'Lamentations'),
    ('epistle_of_jeremiah', 'Ϯⲉ̀ⲡⲓⲥⲧⲟⲗⲏ ⲛ̀ⲧⲉ Ⲓⲉⲣⲉⲙⲓⲁⲥ', 'Ἐπιστολὴ Ἱερεμίου', 'Lettre de Jérémie'),
    ('ezekiel', 'Ⲓⲉⲍⲉⲕⲓⲏⲗ', 'Ἰεζεκιήλ', 'Ézéchiel'),
    ('daniel', 'Ⲇⲁⲛⲓⲏⲗ', 'Δανιήλ', 'Daniel'),
    ('matthew', 'Ⲕⲁⲧⲁ Ⲙⲁⲧⲑⲉⲟⲛ', 'Κατὰ Ματθαῖον', 'Matthieu'),
    ('mark', 'Ⲕⲁⲧⲁ Ⲙⲁⲣⲕⲟⲛ', 'Κατὰ Μᾶρκον', 'Marc'),
    ('luke', 'Ⲕⲁⲧⲁ Ⲗⲟⲩⲕⲁⲛ', 'Κατὰ Λουκᾶν', 'Luc'),
    ('john', 'Ⲕⲁⲧⲁ Ⲓⲱⲁⲛⲛⲏⲛ', 'Κατὰ Ἰωάννην', 'Jean'),
    ('acts', 'Ⲡⲣⲁⲝⲓⲥ', 'Πράξεις', 'Actes'),
    ('romans', 'Ⲛⲓⲣⲱⲙⲉⲟⲥ', 'Πρὸς Ῥωμαίους', 'Romains'),
    ('first_corinthians', 'ⲁ̅ Ⲛⲓⲕⲟⲣⲓⲛⲑⲓⲟⲥ', 'Αʹ Πρὸς Κορινθίους', '1 Corinthiens'),
    ('second_corinthians', 'ⲃ̅ Ⲛⲓⲕⲟⲣⲓⲛⲑⲓⲟⲥ', 'Βʹ Πρὸς Κορινθίους', '2 Corinthiens'),
    ('galatians', 'Ⲛⲓⲅⲁⲗⲁⲧⲏⲥ', 'Πρὸς Γαλάτας', 'Galates'),
    ('ephesians', 'Ⲛⲓⲣⲉⲙⲉ̀ⲫⲉⲥⲟⲥ', 'Πρὸς Ἐφεσίους', 'Éphésiens'),
    ('philippians', 'Ⲛⲓⲣⲉⲙⲫⲓⲗⲓⲡⲡⲟⲓⲥ', 'Πρὸς Φιλιππησίους', 'Philippiens'),
    ('colossians', 'Ⲛⲓⲣⲉⲙⲕⲟⲗⲁⲥⲥⲓⲁⲥ', 'Πρὸς Κολοσσαεῖς', 'Colossiens'),
    ('first_thessalonians', 'ⲁ̅ Ⲛⲓⲣⲉⲙⲑⲉⲥⲥⲁⲗⲟⲛⲓⲕⲏ', 'Αʹ Πρὸς Θεσσαλονικεῖς', '1 Thessaloniciens'),
    ('second_thessalonians', 'ⲃ̅ Ⲛⲓⲣⲉⲙⲑⲉⲥⲥⲁⲗⲟⲛⲓⲕⲏ', 'Βʹ Πρὸς Θεσσαλονικεῖς', '2 Thessaloniciens'),
    ('first_timothy', 'ⲁ̅ Ⲧⲓⲙⲟⲑⲉⲟⲥ', 'Αʹ Πρὸς Τιμόθεον', '1 Timothée'),
    ('second_timothy', 'ⲃ̅ Ⲧⲓⲙⲟⲑⲉⲟⲥ', 'Βʹ Πρὸς Τιμόθεον', '2 Timothée'),
    ('titus', 'Ⲧⲓⲧⲟⲥ', 'Πρὸς Τίτον', 'Tite'),
    ('philemon', 'Ⲫⲩⲗⲓⲙⲱⲛ', 'Πρὸς Φιλήμονα', 'Philémon'),
    ('hebrews', 'Ⲛⲓϩⲉⲃⲣⲉⲟⲥ', 'Πρὸς Ἑβραίους', 'Hébreux'),
    ('james', 'Ⲓⲁⲕⲱⲃⲟⲥ', 'Ἰακώβου', 'Jacques'),
    ('first_peter', 'ⲁ̅ Ⲡⲉⲧⲣⲟⲥ', 'Αʹ Πέτρου', '1 Pierre'),
    ('second_peter', 'ⲃ̅ Ⲡⲉⲧⲣⲟⲥ', 'Βʹ Πέτρου', '2 Pierre'),
    ('first_john', 'ⲁ̅ Ⲓⲱⲁⲛⲛⲏⲥ', 'Αʹ Ἰωάννου', '1 Jean'),
    ('second_john', 'ⲃ̅ Ⲓⲱⲁⲛⲛⲏⲥ', 'Βʹ Ἰωάννου', '2 Jean'),
    ('third_john', 'ⲅ̅ Ⲓⲱⲁⲛⲛⲏⲥ', 'Γʹ Ἰωάννου', '3 Jean'),
    ('jude', 'Ⲓⲟⲩⲇⲁ', 'Ἰούδα', 'Jude'),
    ('revelation', 'Ϯⲁ̀ⲡⲟⲕⲁⲗⲩⲙⲯⲓⲥ', 'Ἀποκάλυψις', 'Apocalypse')
  ) as v(book_key, coptic, greek, french)
 where b.book_key = v.book_key;

-- The return type grows, so the function is recreated.
drop function if exists public.get_bible_books();
create function public.get_bible_books()
 returns table(book_key text, book_order integer, testament text, title_english text, title_arabic text, title_coptic text, title_greek text, title_french text, aliases_json jsonb)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select book_key, book_order, testament, title_english, title_arabic, title_coptic, title_greek, title_french, aliases_json
  from bible.books order by book_order;
$function$;
grant execute on function public.get_bible_books() to anon, authenticated;

-- Offline Bibles carry bible.books rows; republish them with the new names.
update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key = 'bible';
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
