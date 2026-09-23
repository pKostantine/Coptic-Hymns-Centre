-- CHC Learn & Study seasonal taxonomy. Formal names and Arabic are aligned
-- with the main CHC calendar's seasonNames.ts. Both albums and lesson sets
-- refer to learning.seasons through their existing season_id columns.
with entries(slug, english, arabic, sort_order) as (
  values
    ('annual-psalmody', 'Annual Psalmody', 'التسبحة السنوية', 1),
    ('raising-of-incense', 'Raising of Incense', 'رفع بخور', 2),
    ('liturgy', 'Liturgy', 'القداس الإلهي', 3),
    ('joyful-29', 'Joyful 29th of the Coptic Month', 'التاسع والعشرين من الشهر القبطي', 4),
    ('nayrouz', 'Feast of Nayrouz', 'عيد النيروز', 5),
    ('feast-of-the-cross', 'Feast of the Cross', 'عيد الصليب', 6),
    ('nativity-fast-kiahk', 'Nativity Fast / Kiahk', 'صوم الميلاد / كيهك', 7),
    ('nativity-paramoun', 'Nativity Paramoun', 'برامون الميلاد', 8),
    ('nativity', 'Glorious Feast of the Nativity', 'عيد الميلاد المجيد', 9),
    ('circumcision', 'Feast of the Circumcision', 'عيد الختان', 10),
    ('theophany-paramoun', 'Theophany Paramoun', 'برامون الغطاس', 11),
    ('theophany', 'Glorious Feast of the Theophany', 'عيد الغطاس المجيد', 12),
    ('wedding-at-cana', 'Feast of the Wedding at Cana of Galilee', 'عيد عرس قانا الجليل', 13),
    ('entry-into-temple', 'Feast of the Entry of Christ into the Temple', 'عيد دخول المسيح الهيكل', 14),
    ('annunciation', 'Feast of the Annunciation', 'عيد البشارة', 15),
    ('jonahs-fast', 'Jonah''s Fast', 'صوم يونان', 16),
    ('lent', 'Great Lent', 'الصوم الكبير', 17),
    ('lazarus-saturday', 'Lazarus Saturday', 'سبت لعازر', 18),
    ('palm-sunday', 'Feast of Palm Sunday', 'عيد أحد الشعانين', 19),
    ('resurrection', 'Glorious Feast of the Resurrection', 'عيد القيامة المجيد', 20),
    ('thomas-sunday', 'Thomas Sunday', 'أحد توما', 21),
    ('ascension', 'Feast of the Ascension', 'عيد الصعود', 22),
    ('pentecost', 'Feast of Pentecost', 'عيد العنصرة', 23),
    ('entry-into-egypt', 'Feast of the Entry of the Holy Family into Egypt', 'عيد دخول العائلة المقدسة أرض مصر', 24),
    ('apostles-fast-and-feast', 'Fast and Feast of the Apostles', 'صوم الرسل وعيد الرسل', 25),
    ('st-mary-fast-and-feast', 'Fast and Feast of the Virgin Mary', 'صوم العذراء مريم وعيد العذراء', 26),
    ('transfiguration', 'Feast of the Transfiguration', 'عيد التجلي', 27),
    ('other', 'Other', 'أخرى', 28)
), inserted as (
  insert into learning.seasons (slug,title,sort_order,publication_status,metadata)
  select slug,english,sort_order,'published'::media.publication_status,
         jsonb_build_object('source','CHC canonical season names')
  from entries
  on conflict (slug) do update set title=excluded.title,
    sort_order=excluded.sort_order, publication_status='published'::media.publication_status,
    updated_at=now()
  returning id,slug
)
insert into learning.season_localizations(season_id,locale,title)
select i.id,'ar',e.arabic from inserted i join entries e on e.slug=i.slug
on conflict (season_id,locale) do update set title=excluded.title,updated_at=now();
