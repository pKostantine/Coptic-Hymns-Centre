create or replace function private.learning_published_or_admin(status media.publication_status)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select status = 'published' or private.is_admin();
$$;

revoke all on function private.learning_published_or_admin(media.publication_status) from public;
grant execute on function private.learning_published_or_admin(media.publication_status) to anon, authenticated;

drop policy if exists learning_seasons_select on learning.seasons;
create policy learning_seasons_select on learning.seasons
for select using (private.learning_published_or_admin(publication_status));

drop policy if exists learning_season_localizations_select on learning.season_localizations;
create policy learning_season_localizations_select on learning.season_localizations
for select using (
  exists (
    select 1 from learning.seasons s
    where s.id = season_id and private.learning_published_or_admin(s.publication_status)
  )
);

drop policy if exists learning_hymns_select on learning.hymns;
create policy learning_hymns_select on learning.hymns
for select using (private.learning_published_or_admin(publication_status));

drop policy if exists learning_hymn_localizations_select on learning.hymn_localizations;
create policy learning_hymn_localizations_select on learning.hymn_localizations
for select using (
  exists (
    select 1 from learning.hymns h
    where h.id = hymn_id and private.learning_published_or_admin(h.publication_status)
  )
);

drop policy if exists learning_hymn_seasons_select on learning.hymn_seasons;
create policy learning_hymn_seasons_select on learning.hymn_seasons
for select using (
  exists (
    select 1 from learning.hymns h
    where h.id = hymn_id and h.publication_status = 'published'
  )
  and exists (
    select 1 from learning.seasons s
    where s.id = season_id and s.publication_status = 'published'
  )
  or private.learning_published_or_admin('draft'::media.publication_status)
);

drop policy if exists learning_hymn_relationships_select on learning.hymn_relationships;
create policy learning_hymn_relationships_select on learning.hymn_relationships
for select using (
  exists (
    select 1 from learning.hymns h
    where h.id = hymn_id and h.publication_status = 'published'
  )
  and exists (
    select 1 from learning.hymns h
    where h.id = related_hymn_id and h.publication_status = 'published'
  )
  or private.learning_published_or_admin('draft'::media.publication_status)
);
