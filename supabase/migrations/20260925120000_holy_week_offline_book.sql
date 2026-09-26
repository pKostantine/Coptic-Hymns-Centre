-- Registers Holy Week as a downloadable offline book.
--
-- Every hymn key in holy_week resolves inside the schema itself; its only
-- all-caps rows are plain section headers (no Subdocument/Inline item_type),
-- so it opens no other order tables. Condition flags come from Calendar.
-- Mirrors CONTENT_RESOURCE_DEPENDENCIES/DOWNLOADABLE_BOOKS in
-- src/constants/bookDependencyRegistry.ts.

insert into offline_content.resources(resource_key, schema_name, include_tables) values
  ('holy_week', 'holy_week', null)
on conflict (resource_key) do update set
  schema_name = excluded.schema_name,
  include_tables = excluded.include_tables;

insert into offline_content.resource_dependencies(resource_key, dependency_key) values
  ('holy_week','public'), ('holy_week','calendar')
on conflict do nothing;

insert into offline_content.books(book_key, title_english, title_arabic, root_resources) values
  ('holy_week','Holy Week','أسبوع الآلام',array['holy_week'])
on conflict (book_key) do update set title_english=excluded.title_english,
  title_arabic=excluded.title_arabic, root_resources=excluded.root_resources;

select offline_content.refresh_change_triggers();
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
