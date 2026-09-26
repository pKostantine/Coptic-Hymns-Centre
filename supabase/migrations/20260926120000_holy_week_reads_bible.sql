-- Holy Week's hours read their prophecies, epistles and gospels from bible
-- (holy_week.reading_rules -> bible.verses), so an offline Holy Week install
-- must include the Bible. Mirrors CONTENT_RESOURCE_DEPENDENCIES.holy_week in
-- src/constants/bookDependencyRegistry.ts.

insert into offline_content.resource_dependencies(resource_key, dependency_key) values
  ('holy_week','bible')
on conflict do nothing;

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key = 'holy_week';
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
