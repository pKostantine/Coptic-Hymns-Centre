-- Sermon Planner is a read-only Lectionary document, like the existing
-- Vespers, Matins, and Liturgy lectionary order tables. Its table already has
-- RLS enabled and SELECT grants; add the missing RLS policy for app readers.
create policy "Allow public read access"
on liturgy.sermon_planner
for select
to anon, authenticated
using (true);
