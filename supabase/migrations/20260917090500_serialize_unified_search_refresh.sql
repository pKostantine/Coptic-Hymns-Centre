create or replace function private.refresh_unified_search_index()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Catalog writes can arrive concurrently. Serialize whole-index refreshes so
  -- two publishing transactions cannot race while replacing the same rows.
  perform pg_catalog.pg_advisory_xact_lock(1128813384, 12);

  delete from media.search_documents
  where kind = 'unified_catalog';

  insert into media.search_documents (
    owner_creator_account_id,
    entity_type,
    entity_id,
    locale,
    kind,
    title,
    subtitle,
    body,
    alias_text,
    normalized_text,
    search_vector,
    publication_status,
    metadata
  )
  select
    source.owner_creator_account_id,
    source.entity_type,
    source.entity_id,
    source.locale,
    'unified_catalog',
    source.title,
    source.subtitle,
    source.body,
    null,
    media.normalize_search_text(concat_ws(' ', source.title, source.subtitle, source.body)),
    setweight(to_tsvector('simple', media.normalize_search_text(source.title)), 'A')
      || setweight(to_tsvector('simple', media.normalize_search_text(source.subtitle)), 'B')
      || setweight(to_tsvector('simple', media.normalize_search_text(source.body)), 'C'),
    'published'::media.publication_status,
    source.metadata
  from private.published_media_search_source() source;
end;
$$;

revoke all on function private.refresh_unified_search_index() from public, anon, authenticated;
