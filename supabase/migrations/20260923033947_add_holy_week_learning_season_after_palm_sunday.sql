-- Put Holy Week immediately after Palm Sunday in both learning selectors.
-- Names match CHC seasonNames.ts: Holy Week / أسبوع الآلام.
do $$
begin
  if not exists (select 1 from learning.seasons where slug = 'holy-week') then
    update learning.seasons
       set sort_order = sort_order + 1, updated_at = now()
     where sort_order >= (select sort_order from learning.seasons where slug = 'palm-sunday') + 1;
    insert into learning.seasons (slug, title, sort_order, publication_status, metadata)
    select 'holy-week', 'Holy Week', palm.sort_order + 1,
           'published'::media.publication_status,
           jsonb_build_object('source', 'CHC canonical season names')
      from learning.seasons palm where palm.slug = 'palm-sunday';
  else
    update learning.seasons
       set title = 'Holy Week', publication_status = 'published'::media.publication_status,
           updated_at = now()
     where slug = 'holy-week';
  end if;
end
$$;
insert into learning.season_localizations (season_id, locale, title)
select id, 'ar', 'أسبوع الآلام' from learning.seasons where slug = 'holy-week'
on conflict (season_id, locale) do update
set title = excluded.title, updated_at = now();
