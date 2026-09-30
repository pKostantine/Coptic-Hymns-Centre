-- The Lenten doxologies are named for Lent, not "the Great Fast" (user's
-- call). English titles only; hymn keys and the Arabic are unchanged.
--   Doxology for Saturdays and Sundays of the Great Fast -> ... of Lent
--   Doxology for the Weekdays of the Great Fast          -> ... of Lent
--   Second/Third/Fourth Doxology for the Great Fast      -> ... for Lent
--   Melody for Vespers of the Great Fast                 -> ... of Lent
update doxologies.hymn_titles
   set title_english = replace(replace(title_english, 'the Great Fast', 'Lent'), 'Great Fast', 'Lent')
 where title_english like '%Great Fast%';

update offline_content.resources set revision = revision + 1, dirty = true, updated_at = now()
 where resource_key = 'doxologies';
insert into offline_content.publication_requests(status) values ('queued') on conflict do nothing;
