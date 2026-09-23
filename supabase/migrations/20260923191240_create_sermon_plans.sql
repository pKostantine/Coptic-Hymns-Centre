create table if not exists public.sermon_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_key text not null check (char_length(document_key) between 1 and 160),
  service_date date not null,
  general_notes text not null default '' check (char_length(general_notes) <= 100000),
  highlights jsonb not null default '[]'::jsonb check (
    jsonb_typeof(highlights) = 'array'
    and jsonb_array_length(highlights) <= 1000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, document_key, service_date)
);

create index if not exists sermon_plans_user_date_idx
  on public.sermon_plans (user_id, service_date desc);

alter table public.sermon_plans enable row level security;

revoke all on table public.sermon_plans from anon, authenticated;
grant select, insert, update, delete on table public.sermon_plans to authenticated;

drop policy if exists sermon_plans_select_own on public.sermon_plans;
create policy sermon_plans_select_own
on public.sermon_plans for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists sermon_plans_insert_own on public.sermon_plans;
create policy sermon_plans_insert_own
on public.sermon_plans for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists sermon_plans_update_own on public.sermon_plans;
create policy sermon_plans_update_own
on public.sermon_plans for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists sermon_plans_delete_own on public.sermon_plans;
create policy sermon_plans_delete_own
on public.sermon_plans for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists sermon_plans_set_updated_at on public.sermon_plans;
create trigger sermon_plans_set_updated_at
before update on public.sermon_plans
for each row execute function private.set_updated_at();
