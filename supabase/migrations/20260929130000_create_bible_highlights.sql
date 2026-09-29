-- A reader's Bible highlights, one row per book — the account's copy of what
-- src/services/bibleHighlightsService.ts keeps on the device. Same shape and
-- same own-rows-only access as public.sermon_plans.
create table if not exists public.bible_highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  book_key text not null check (char_length(book_key) between 1 and 64),
  highlights jsonb not null default '[]'::jsonb check (
    jsonb_typeof(highlights) = 'array'
    and jsonb_array_length(highlights) <= 2000
  ),
  highlight_deletions jsonb not null default '{}'::jsonb check (
    jsonb_typeof(highlight_deletions) = 'object'
    and octet_length(highlight_deletions::text) <= 500000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, book_key)
);

alter table public.bible_highlights enable row level security;

revoke all on table public.bible_highlights from anon, authenticated;
grant select, insert, update, delete on table public.bible_highlights to authenticated;

drop policy if exists bible_highlights_select_own on public.bible_highlights;
create policy bible_highlights_select_own
on public.bible_highlights for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists bible_highlights_insert_own on public.bible_highlights;
create policy bible_highlights_insert_own
on public.bible_highlights for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists bible_highlights_update_own on public.bible_highlights;
create policy bible_highlights_update_own
on public.bible_highlights for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists bible_highlights_delete_own on public.bible_highlights;
create policy bible_highlights_delete_own
on public.bible_highlights for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists bible_highlights_set_updated_at on public.bible_highlights;
create trigger bible_highlights_set_updated_at
before update on public.bible_highlights
for each row execute function private.set_updated_at();
