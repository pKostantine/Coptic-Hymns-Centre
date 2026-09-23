alter table public.sermon_plans
  add column if not exists highlight_deletions jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sermon_plans_highlight_deletions_check'
      and conrelid = 'public.sermon_plans'::regclass
  ) then
    alter table public.sermon_plans
      add constraint sermon_plans_highlight_deletions_check
      check (
        jsonb_typeof(highlight_deletions) = 'object'
        and octet_length(highlight_deletions::text) <= 500000
      );
  end if;
end
$$;
