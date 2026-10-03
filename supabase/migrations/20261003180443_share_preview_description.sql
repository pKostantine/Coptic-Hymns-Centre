-- The share card's fallback description becomes the one the site, the share
-- Worker and the app now use. get_share_preview() returns it when a shared
-- path matches nothing. The function is re-created from its own live
-- definition with only this wording changed, so its signature, security
-- settings, owner and grants stay as they are.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_share_preview'
      and p.prosrc like '%Coptic hymns, liturgical books, music, and structured learning.%'
  loop
    definition := pg_get_functiondef(fn.oid);
    definition := replace(
      definition,
      'Coptic hymns, liturgical books, music, and structured learning.',
      'Cross-platform Coptic Orthodox worship app for multilingual liturgical books, Scripture, and hymns.'
    );
    execute definition;
  end loop;
end
$$;
