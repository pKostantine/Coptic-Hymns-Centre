-- Manual CHC notification broadcasts from CHC Admin.
-- Adds an audited admin-only broadcast surface that fans out through the
-- existing notification delivery queue while respecting user preferences.

create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  app_key text not null default 'chc'
    check (app_key in ('chc','chc_artists','chc_admin')),
  category text not null
    check (category in ('feast_celebrations','announcements')),
  title text not null
    check (length(btrim(title)) between 1 and 120),
  body text not null
    check (length(btrim(body)) between 1 and 600),
  deep_link text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  delivery_count integer not null default 0 check (delivery_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists notification_broadcasts_created_at_idx
  on public.notification_broadcasts(created_at desc);

alter table public.notification_broadcasts enable row level security;
revoke all on public.notification_broadcasts from public, anon, authenticated;
grant select on public.notification_broadcasts to authenticated;
grant all on public.notification_broadcasts to service_role;

drop policy if exists notification_broadcasts_admin_select on public.notification_broadcasts;
create policy notification_broadcasts_admin_select
  on public.notification_broadcasts
  for select
  to authenticated
  using ((select private.is_admin()));

create or replace function public.get_admin_notification_broadcast_overview(
  p_category text default 'feast_celebrations',
  p_history_limit integer default 20
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_category text := btrim(coalesce(p_category, ''));
  v_limit integer := greatest(1, least(coalesce(p_history_limit, 20), 50));
  v_user_id uuid := auth.uid();
  v_users integer := 0;
  v_devices integer := 0;
  v_history jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;
  if v_category not in ('feast_celebrations','announcements') then
    raise exception 'Unsupported notification category' using errcode = '22023';
  end if;

  select
    count(distinct d.user_id)::integer,
    count(*)::integer
  into v_users, v_devices
  from public.notification_devices d
  where d.app_key = 'chc'
    and d.enabled = true
    and d.provider in ('expo','web_push')
    and not exists (
      select 1
      from public.notification_preferences p
      where p.user_id = d.user_id
        and p.app_key = 'chc'
        and p.category = v_category
        and p.enabled = false
    );

  select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc), '[]'::jsonb)
  into v_history
  from (
    select
      b.id,
      b.category,
      b.title,
      b.body,
      b.deep_link,
      b.recipient_count,
      b.delivery_count,
      b.created_at
    from public.notification_broadcasts b
    where b.app_key = 'chc'
    order by b.created_at desc
    limit v_limit
  ) h;

  return jsonb_build_object(
    'eligibleUserCount', coalesce(v_users, 0),
    'eligibleDeviceCount', coalesce(v_devices, 0),
    'recentBroadcasts', v_history
  );
end;
$$;

revoke all on function public.get_admin_notification_broadcast_overview(text,integer)
  from public, anon;
grant execute on function public.get_admin_notification_broadcast_overview(text,integer)
  to authenticated, service_role;

create or replace function public.admin_send_notification_broadcast(
  p_category text,
  p_title text,
  p_body text,
  p_deep_link text default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_category text := btrim(coalesce(p_category, ''));
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_deep_link text := nullif(btrim(coalesce(p_deep_link, '')), '');
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_broadcast_id uuid;
  v_recipient_count integer := 0;
  v_delivery_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if v_category not in ('feast_celebrations','announcements') then
    raise exception 'Unsupported notification category' using errcode = '22023';
  end if;
  if length(v_title) < 1 or length(v_title) > 120 then
    raise exception 'Title must be between 1 and 120 characters' using errcode = '22023';
  end if;
  if length(v_body) < 1 or length(v_body) > 600 then
    raise exception 'Message must be between 1 and 600 characters' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Notification payload must be a JSON object' using errcode = '22023';
  end if;
  if v_deep_link is not null
     and (left(v_deep_link, 1) <> '/' or left(v_deep_link, 2) = '//') then
    raise exception 'Deep link must be an internal CHC path beginning with /' using errcode = '22023';
  end if;

  insert into public.notification_broadcasts (
    app_key,
    category,
    title,
    body,
    deep_link,
    payload,
    created_by
  ) values (
    'chc',
    v_category,
    v_title,
    v_body,
    v_deep_link,
    v_payload,
    v_user_id
  )
  returning id into v_broadcast_id;

  with eligible_users as (
    select distinct d.user_id
    from public.notification_devices d
    where d.app_key = 'chc'
      and d.enabled = true
      and d.provider in ('expo','web_push')
      and not exists (
        select 1
        from public.notification_preferences p
        where p.user_id = d.user_id
          and p.app_key = 'chc'
          and p.category = v_category
          and p.enabled = false
      )
  ),
  inserted_notifications as (
    insert into public.notifications (
      user_id,
      app_key,
      category,
      event_type,
      title,
      body,
      deep_link,
      payload
    )
    select
      e.user_id,
      'chc',
      v_category,
      'admin_broadcast',
      v_title,
      v_body,
      v_deep_link,
      v_payload || jsonb_build_object(
        'broadcast_id', v_broadcast_id::text,
        'source', 'chc_admin'
      )
    from eligible_users e
    returning id, user_id
  ),
  inserted_deliveries as (
    insert into private.notification_deliveries (
      notification_id,
      device_id,
      provider
    )
    select
      n.id,
      d.id,
      d.provider
    from inserted_notifications n
    join public.notification_devices d
      on d.user_id = n.user_id
     and d.app_key = 'chc'
     and d.enabled = true
     and d.provider in ('expo','web_push')
    on conflict (notification_id, device_id) do nothing
    returning id
  )
  select
    (select count(*)::integer from inserted_notifications),
    (select count(*)::integer from inserted_deliveries)
  into v_recipient_count, v_delivery_count;

  update public.notification_broadcasts
  set recipient_count = coalesce(v_recipient_count, 0),
      delivery_count = coalesce(v_delivery_count, 0)
  where id = v_broadcast_id;

  return jsonb_build_object(
    'broadcastId', v_broadcast_id,
    'recipientCount', coalesce(v_recipient_count, 0),
    'deliveryCount', coalesce(v_delivery_count, 0),
    'queuedAt', now()
  );
end;
$$;

revoke all on function public.admin_send_notification_broadcast(text,text,text,text,jsonb)
  from public, anon;
grant execute on function public.admin_send_notification_broadcast(text,text,text,text,jsonb)
  to authenticated, service_role;
