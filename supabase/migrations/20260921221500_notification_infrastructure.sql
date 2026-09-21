-- Cross-app notification infrastructure for CHC, CHC Artists, and CHC Admin.
-- Live schema was applied and verified on 2026-09-21; this migration records it
-- in source control for reproducible environments.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (app_key in ('chc','chc_artists','chc_admin')),
  platform text not null check (platform in ('ios','android','web','windows')),
  provider text not null check (provider in ('expo','web_push','wns')),
  push_token text not null check (length(btrim(push_token)) > 0),
  provider_data jsonb not null default '{}'::jsonb check (jsonb_typeof(provider_data) = 'object'),
  device_name text,
  app_version text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists notification_devices_app_provider_token_uidx
  on public.notification_devices(app_key, provider, push_token);
create index if not exists notification_devices_user_enabled_idx
  on public.notification_devices(user_id, app_key, enabled);

alter table public.notification_devices enable row level security;
revoke all on public.notification_devices from anon, authenticated;
grant select, insert, update, delete on public.notification_devices to authenticated;
grant all on public.notification_devices to service_role;

drop policy if exists notification_devices_select_own on public.notification_devices;
create policy notification_devices_select_own
  on public.notification_devices for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notification_devices_insert_own on public.notification_devices;
create policy notification_devices_insert_own
  on public.notification_devices for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_devices_update_own on public.notification_devices;
create policy notification_devices_update_own
  on public.notification_devices for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_devices_delete_own on public.notification_devices;
create policy notification_devices_delete_own
  on public.notification_devices for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (app_key in ('chc','chc_artists','chc_admin')),
  category text not null check (length(btrim(category)) > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_key, category)
);

alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon, authenticated;
grant select, insert, update, delete on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own
  on public.notification_preferences for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (app_key in ('chc','chc_artists','chc_admin')),
  category text not null check (length(btrim(category)) > 0),
  event_type text not null check (length(btrim(event_type)) > 0),
  title text not null check (length(btrim(title)) > 0),
  body text not null check (length(btrim(body)) > 0),
  image_url text,
  deep_link text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications(user_id, app_key, created_at desc);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists notifications_update_read_own on public.notifications;
create policy notifications_update_read_own
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists private.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null references public.notification_devices(id) on delete cascade,
  provider text not null check (provider in ('expo','web_push','wns')),
  status text not null default 'queued'
    check (status in ('queued','processing','accepted','delivered','failed','disabled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  provider_ticket_id text,
  accepted_at timestamptz,
  receipt_checked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(notification_id, device_id)
);

create index if not exists notification_deliveries_dispatch_idx
  on private.notification_deliveries(provider, status, available_at);
create index if not exists notification_deliveries_receipt_idx
  on private.notification_deliveries(provider, status, accepted_at, receipt_checked_at);

revoke all on private.notification_deliveries from public, anon, authenticated;
grant all on private.notification_deliveries to service_role;

create or replace function public.register_notification_device(
  p_app_key text,
  p_platform text,
  p_provider text,
  p_push_token text,
  p_provider_data jsonb default '{}'::jsonb,
  p_device_name text default null,
  p_app_version text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then raise exception 'authentication_required'; end if;
  if p_app_key not in ('chc','chc_artists','chc_admin')
     or p_platform not in ('ios','android','web','windows')
     or p_provider not in ('expo','web_push','wns')
     or nullif(btrim(p_push_token), '') is null then
    raise exception 'invalid_notification_device';
  end if;

  -- A physical app installation can change accounts. Remove a stale token row
  -- first so a signed-out account can never keep receiving the new user's pushes.
  delete from public.notification_devices
  where app_key = p_app_key
    and provider = p_provider
    and push_token = p_push_token
    and user_id <> v_user_id;

  insert into public.notification_devices (
    user_id, app_key, platform, provider, push_token, provider_data,
    device_name, app_version, enabled, last_seen_at, updated_at
  ) values (
    v_user_id, p_app_key, p_platform, p_provider, p_push_token,
    coalesce(p_provider_data, '{}'::jsonb), p_device_name, p_app_version,
    true, now(), now()
  )
  on conflict (app_key, provider, push_token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    provider_data = excluded.provider_data,
    device_name = excluded.device_name,
    app_version = excluded.app_version,
    enabled = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_notification_device(text,text,text,text,jsonb,text,text) from public, anon;
grant execute on function public.register_notification_device(text,text,text,text,jsonb,text,text) to authenticated, service_role;

create or replace function public.disable_notification_device(
  p_app_key text,
  p_provider text,
  p_push_token text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notification_devices
  set enabled = false, updated_at = now()
  where user_id = (select auth.uid())
    and app_key = p_app_key
    and provider = p_provider
    and push_token = p_push_token;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke all on function public.disable_notification_device(text,text,text) from public, anon;
grant execute on function public.disable_notification_device(text,text,text) to authenticated, service_role;

create or replace function private.enqueue_notification(
  p_user_id uuid,
  p_app_key text,
  p_category text,
  p_event_type text,
  p_title text,
  p_body text,
  p_deep_link text default null,
  p_image_url text default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null then return null; end if;

  if exists (
    select 1 from public.notification_preferences pref
    where pref.user_id = p_user_id
      and pref.app_key = p_app_key
      and pref.category = p_category
      and pref.enabled = false
  ) then
    return null;
  end if;

  insert into public.notifications (
    user_id, app_key, category, event_type, title, body,
    deep_link, image_url, payload
  ) values (
    p_user_id, p_app_key, p_category, p_event_type, p_title, p_body,
    p_deep_link, p_image_url, coalesce(p_payload, '{}'::jsonb)
  )
  returning id into v_notification_id;

  -- Expo is the active native transport. web_push and WNS are already valid
  -- provider values so the same queue can gain those adapters later without a
  -- schema migration, but we do not queue undeliverable providers yet.
  insert into private.notification_deliveries (notification_id, device_id, provider)
  select v_notification_id, d.id, d.provider
  from public.notification_devices d
  where d.user_id = p_user_id
    and d.app_key = p_app_key
    and d.enabled = true
    and d.provider = 'expo'
  on conflict (notification_id, device_id) do nothing;

  return v_notification_id;
end;
$$;

revoke all on function private.enqueue_notification(uuid,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function private.enqueue_notification(uuid,text,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.enqueue_user_notification(
  p_user_id uuid,
  p_app_key text,
  p_category text,
  p_event_type text,
  p_title text,
  p_body text,
  p_deep_link text default null,
  p_image_url text default null,
  p_payload jsonb default '{}'::jsonb
) returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.enqueue_notification(
    p_user_id, p_app_key, p_category, p_event_type, p_title, p_body,
    p_deep_link, p_image_url, p_payload
  );
$$;

revoke all on function public.enqueue_user_notification(uuid,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.enqueue_user_notification(uuid,text,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.claim_notification_deliveries(
  p_limit integer default 100
) returns table (
  delivery_id uuid,
  notification_id uuid,
  device_id uuid,
  push_token text,
  title text,
  body text,
  image_url text,
  deep_link text,
  payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select d.id
    from private.notification_deliveries d
    where d.provider = 'expo'
      and d.attempt_count < d.max_attempts
      and (
        (d.status = 'queued' and d.available_at <= now())
        or (d.status = 'processing' and d.claimed_at < now() - interval '10 minutes')
      )
    order by d.available_at, d.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  ),
  claimed as (
    update private.notification_deliveries d
    set status = 'processing',
        claimed_at = now(),
        attempt_count = d.attempt_count + 1,
        updated_at = now()
    from picked p
    where d.id = p.id
    returning d.id, d.notification_id, d.device_id
  )
  select
    c.id,
    c.notification_id,
    c.device_id,
    dev.push_token,
    n.title,
    n.body,
    n.image_url,
    n.deep_link,
    n.payload || jsonb_build_object('notification_id', n.id::text, 'deep_link', n.deep_link)
  from claimed c
  join public.notification_devices dev on dev.id = c.device_id
  join public.notifications n on n.id = c.notification_id
  where dev.enabled = true;
end;
$$;

revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

create or replace function public.complete_notification_delivery(
  p_delivery_id uuid,
  p_result text,
  p_ticket_id text default null,
  p_error text default null,
  p_retry_after_seconds integer default 60
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id from private.notification_deliveries where id = p_delivery_id;
  if v_device_id is null then return; end if;

  if p_result = 'accepted' then
    update private.notification_deliveries
    set status = 'accepted', provider_ticket_id = p_ticket_id,
        accepted_at = now(), last_error = null, updated_at = now()
    where id = p_delivery_id;
  elsif p_result = 'retry' then
    update private.notification_deliveries
    set status = case when attempt_count >= max_attempts then 'failed' else 'queued' end,
        available_at = now() + make_interval(secs => greatest(10, least(coalesce(p_retry_after_seconds, 60), 3600))),
        claimed_at = null, last_error = p_error, updated_at = now()
    where id = p_delivery_id;
  elsif p_result = 'disabled' then
    update private.notification_deliveries
    set status = 'disabled', last_error = p_error, updated_at = now()
    where id = p_delivery_id;
    update public.notification_devices set enabled = false, updated_at = now() where id = v_device_id;
  else
    update private.notification_deliveries
    set status = 'failed', last_error = p_error, updated_at = now()
    where id = p_delivery_id;
  end if;
end;
$$;

revoke all on function public.complete_notification_delivery(uuid,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.complete_notification_delivery(uuid,text,text,text,integer) to service_role;

create or replace function public.complete_notification_deliveries(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'results_must_be_array';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    perform public.complete_notification_delivery(
      (v_item->>'delivery_id')::uuid,
      v_item->>'result',
      nullif(v_item->>'ticket_id', ''),
      nullif(v_item->>'error', ''),
      coalesce((v_item->>'retry_after_seconds')::integer, 60)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.complete_notification_deliveries(jsonb) from public, anon, authenticated;
grant execute on function public.complete_notification_deliveries(jsonb) to service_role;

create or replace function public.claim_notification_receipts(
  p_limit integer default 1000
) returns table (delivery_id uuid, provider_ticket_id text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select d.id
    from private.notification_deliveries d
    where d.provider = 'expo'
      and d.status = 'accepted'
      and d.provider_ticket_id is not null
      and d.accepted_at <= now() - interval '15 minutes'
      and (d.receipt_checked_at is null or d.receipt_checked_at <= now() - interval '5 minutes')
    order by d.accepted_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 1000), 1000))
  )
  update private.notification_deliveries d
  set receipt_checked_at = now(), updated_at = now()
  from picked p
  where d.id = p.id
  returning d.id, d.provider_ticket_id;
end;
$$;

revoke all on function public.claim_notification_receipts(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_receipts(integer) to service_role;

create or replace function public.complete_notification_receipt(
  p_delivery_id uuid,
  p_result text,
  p_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id uuid;
begin
  select device_id into v_device_id from private.notification_deliveries where id = p_delivery_id;
  if v_device_id is null then return; end if;

  if p_result = 'delivered' then
    update private.notification_deliveries
    set status = 'delivered', delivered_at = now(), last_error = null, updated_at = now()
    where id = p_delivery_id;
  elsif p_result = 'disabled' then
    update private.notification_deliveries
    set status = 'disabled', last_error = p_error, updated_at = now()
    where id = p_delivery_id;
    update public.notification_devices set enabled = false, updated_at = now() where id = v_device_id;
  else
    update private.notification_deliveries
    set status = 'failed', last_error = p_error, updated_at = now()
    where id = p_delivery_id;
  end if;
end;
$$;

revoke all on function public.complete_notification_receipt(uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_notification_receipt(uuid,text,text) to service_role;

create or replace function public.complete_notification_receipts(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_results, '[]'::jsonb)) <> 'array' then
    raise exception 'results_must_be_array';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    perform public.complete_notification_receipt(
      (v_item->>'delivery_id')::uuid,
      v_item->>'result',
      nullif(v_item->>'error', '')
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.complete_notification_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.complete_notification_receipts(jsonb) to service_role;

create or replace function private.notify_release_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artist_name text;
  v_user_id uuid;
begin
  if new.publication_status::text <> 'published'
     or (tg_op = 'UPDATE' and old.publication_status::text = 'published') then
    return new;
  end if;

  select a.display_name into v_artist_name from music.artists a where a.id = new.primary_artist_id;
  v_artist_name := coalesce(v_artist_name, 'CHC');

  for v_user_id in
    select f.user_id from music.artist_follows f where f.artist_id = new.primary_artist_id
  loop
    perform private.enqueue_notification(
      v_user_id, 'chc', 'followed_artists', 'release_published',
      'New from ' || v_artist_name,
      new.title || ' is now available on CHC.',
      '/music/release/' || new.id::text, null,
      jsonb_build_object('release_id', new.id, 'artist_id', new.primary_artist_id)
    );
  end loop;

  if new.owner_creator_account_id is not null then
    for v_user_id in
      select distinct m.user_id from creator.creator_account_members m
      where m.creator_account_id = new.owner_creator_account_id
    loop
      perform private.enqueue_notification(
        v_user_id, 'chc_artists', 'release_updates', 'release_published',
        'Release is live',
        new.title || ' is now available on CHC.',
        '/release/' || new.id::text, null,
        jsonb_build_object('release_id', new.id)
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_release_published() from public, anon, authenticated;
drop trigger if exists notify_release_published on music.releases;
create trigger notify_release_published
after insert or update of publication_status on music.releases
for each row execute function private.notify_release_published();

create or replace function private.notify_submission_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_title text;
  v_body text;
begin
  if tg_op = 'UPDATE' and old.status::text = new.status::text then return new; end if;

  if new.status::text = 'pending_review' then
    for v_user_id in
      select distinct ur.user_id from creator.user_roles ur
      where ur.role::text = 'admin' and ur.revoked_at is null
    loop
      perform private.enqueue_notification(
        v_user_id, 'chc_admin', 'new_submissions', 'submission_pending_review',
        'New submission', new.title || ' is ready for review.',
        '/submission/' || new.id::text, null,
        jsonb_build_object('submission_id', new.id, 'submission_type', new.submission_type::text)
      );
    end loop;
  end if;

  if new.status::text in ('approved','changes_requested','rejected','published') then
    v_title := case new.status::text
      when 'approved' then 'Submission approved'
      when 'changes_requested' then 'Changes requested'
      when 'rejected' then 'Submission not approved'
      when 'published' then 'Release is live'
    end;
    v_body := case new.status::text
      when 'approved' then new.title || ' has been approved.'
      when 'changes_requested' then 'CHC requested changes to ' || new.title || '.'
      when 'rejected' then new.title || ' was not approved.'
      when 'published' then new.title || ' is now available on CHC.'
    end;

    for v_user_id in
      select distinct m.user_id from creator.creator_account_members m
      where m.creator_account_id = new.creator_account_id
    loop
      perform private.enqueue_notification(
        v_user_id, 'chc_artists', 'submission_updates', 'submission_' || new.status::text,
        v_title, v_body, '/submission/' || new.id::text, null,
        jsonb_build_object('submission_id', new.id, 'status', new.status::text)
      );
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.notify_submission_status() from public, anon, authenticated;
drop trigger if exists notify_submission_status on media.submissions;
create trigger notify_submission_status
after insert or update of status on media.submissions
for each row execute function private.notify_submission_status();

create or replace function private.notify_processing_failure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if new.status::text <> 'failed'
     or (tg_op = 'UPDATE' and old.status::text = 'failed') then
    return new;
  end if;

  for v_user_id in
    select distinct ur.user_id from creator.user_roles ur
    where ur.role::text = 'admin' and ur.revoked_at is null
  loop
    perform private.enqueue_notification(
      v_user_id, 'chc_admin', 'processing_failures', 'media_processing_failed',
      'Media processing failed', 'A media processing job requires attention.',
      '/processing', null, jsonb_build_object('job_id', new.id)
    );
  end loop;

  for v_user_id in
    select distinct m.user_id
    from media.submission_items si
    join media.submissions s on s.id = si.submission_id
    join creator.creator_account_members m on m.creator_account_id = s.creator_account_id
    where si.media_processing_job_id = new.id
  loop
    perform private.enqueue_notification(
      v_user_id, 'chc_artists', 'processing_errors', 'media_processing_failed',
      'Media processing needs attention',
      'CHC could not finish processing one of your uploaded files.',
      '/', null, jsonb_build_object('job_id', new.id)
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.notify_processing_failure() from public, anon, authenticated;
drop trigger if exists notify_processing_failure on media.media_processing_jobs;
create trigger notify_processing_failure
after insert or update of status on media.media_processing_jobs
for each row execute function private.notify_processing_failure();
