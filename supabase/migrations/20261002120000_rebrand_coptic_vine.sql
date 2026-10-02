-- The app is now Coptic Vine. Rewrites the user-facing wording inside the
-- database: notification messages, error messages, share-preview titles and
-- the default name given to a new creator. Each affected function is
-- re-created from its own live definition with only the wording changed, so
-- its signature, security settings, owner and grants stay as they are.
--
-- Identifiers are left alone on purpose: is_chc_admin(), bucket names
-- ('chc-music', …), app keys ('chc') and storage keys still name real
-- resources and stored rows.
do $$
declare
  fn record;
  definition text;
begin
  for fn in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prokind = 'f'
      and (p.prosrc ilike '%coptic hymns centre%' or p.prosrc ~ '\mCHC\M')
  loop
    definition := pg_get_functiondef(fn.oid);
    definition := replace(definition, 'Coptic Hymns Centre', 'Coptic Vine');
    definition := replace(definition, 'CHC Artists', 'Coptic Vine Artists');
    definition := replace(definition, 'CHC Admin', 'Coptic Vine Admin');
    definition := replace(definition, 'CHC Creator', 'Coptic Vine Creator');
    -- "CHC" as a word on its own ("now available on CHC."); never part of an
    -- identifier such as CHC_ or is_chc_admin.
    definition := regexp_replace(definition, '\mCHC\M', 'Coptic Vine', 'g');
    execute definition;
  end loop;
end
$$;

-- Admin-only notes on granted roles.
update creator.user_roles
set notes = replace(replace(notes, 'CHC Artists', 'Coptic Vine Artists'), 'CHC Admin', 'Coptic Vine Admin')
where notes ~ '\mCHC\M';

-- The test creator account, named after the old portal.
update creator.profiles set display_name = 'Coptic Vine Artists Test Creator' where display_name = 'CHC Artists Test Creator';
update creator.creator_accounts set display_name = 'Coptic Vine Artists Test Creator' where display_name = 'CHC Artists Test Creator';
update music.artists set display_name = 'Coptic Vine Artists Test Creator' where display_name = 'CHC Artists Test Creator';
