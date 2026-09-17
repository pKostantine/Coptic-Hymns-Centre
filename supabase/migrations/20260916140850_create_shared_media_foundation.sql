create schema if not exists private;
create schema if not exists creator;
create schema if not exists media;

do $$
begin
  create type creator.app_role as enum ('user', 'creator', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type creator.creator_account_status as enum ('active', 'suspended', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type creator.creator_account_role as enum ('owner', 'manager', 'editor', 'uploader', 'viewer');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type media.media_provider as enum ('cloudflare_r2', 'external');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type media.media_type as enum ('audio', 'video', 'image', 'document', 'other');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type media.processing_status as enum ('pending', 'uploaded', 'queued', 'processing', 'completed', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type media.publication_status as enum (
    'draft',
    'uploading',
    'ready_to_submit',
    'pending_review',
    'changes_requested',
    'approved',
    'processing',
    'published',
    'rejected',
    'archived'
  );
exception when duplicate_object then null;
end $$;

create table if not exists creator.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_locale text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_preferred_locale_not_blank check (length(trim(preferred_locale)) > 0)
);

create table if not exists creator.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role creator.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text,
  primary key (user_id, role),
  constraint user_roles_revoked_after_granted check (revoked_at is null or revoked_at >= granted_at)
);

create table if not exists creator.creator_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  status creator.creator_account_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_accounts_display_name_not_blank check (length(trim(display_name)) > 0)
);

create table if not exists creator.creator_account_members (
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role creator.creator_account_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creator_account_id, user_id)
);

create table if not exists media.locales (
  code text primary key,
  english_name text not null,
  native_name text not null,
  text_direction text not null default 'ltr',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint locales_code_not_blank check (length(trim(code)) > 0),
  constraint locales_text_direction_valid check (text_direction in ('ltr', 'rtl'))
);

insert into media.locales (code, english_name, native_name, text_direction, sort_order)
values
  ('en', 'English', 'English', 'ltr', 10),
  ('ar', 'Arabic', 'العربية', 'rtl', 20),
  ('cop', 'Coptic', 'Ⲙⲉⲧⲣⲉⲙⲛⲭⲏⲙⲓ', 'ltr', 30),
  ('fr', 'French', 'Français', 'ltr', 40)
on conflict (code) do update
set english_name = excluded.english_name,
    native_name = excluded.native_name,
    text_direction = excluded.text_direction,
    sort_order = excluded.sort_order,
    updated_at = now();

create table if not exists media.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  provider media.media_provider not null default 'cloudflare_r2',
  bucket text not null,
  path text not null,
  media_type media.media_type not null,
  mime_type text,
  codec text,
  duration_ms bigint,
  file_size_bytes bigint,
  bitrate integer,
  sample_rate integer,
  width integer,
  height integer,
  version integer not null default 1,
  checksum text,
  processing_status media.processing_status not null default 'pending',
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_assets_bucket_not_blank check (length(trim(bucket)) > 0),
  constraint media_assets_path_not_blank check (length(trim(path)) > 0),
  constraint media_assets_version_positive check (version > 0),
  constraint media_assets_duration_nonnegative check (duration_ms is null or duration_ms >= 0),
  constraint media_assets_file_size_nonnegative check (file_size_bytes is null or file_size_bytes >= 0),
  constraint media_assets_bitrate_nonnegative check (bitrate is null or bitrate >= 0),
  constraint media_assets_sample_rate_nonnegative check (sample_rate is null or sample_rate >= 0),
  constraint media_assets_width_nonnegative check (width is null or width >= 0),
  constraint media_assets_height_nonnegative check (height is null or height >= 0),
  unique (provider, bucket, path)
);

create table if not exists media.media_asset_versions (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media.media_assets(id) on delete cascade,
  version integer not null,
  provider media.media_provider not null default 'cloudflare_r2',
  bucket text not null,
  path text not null,
  mime_type text,
  codec text,
  duration_ms bigint,
  file_size_bytes bigint,
  bitrate integer,
  sample_rate integer,
  width integer,
  height integer,
  checksum text,
  processing_status media.processing_status not null default 'pending',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint media_asset_versions_version_positive check (version > 0),
  constraint media_asset_versions_bucket_not_blank check (length(trim(bucket)) > 0),
  constraint media_asset_versions_path_not_blank check (length(trim(path)) > 0),
  unique (media_asset_id, version),
  unique (provider, bucket, path)
);

create table if not exists media.localized_texts (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  locale text not null references media.locales(code),
  text_value text not null,
  is_primary boolean not null default false,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint localized_texts_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint localized_texts_field_name_not_blank check (length(trim(field_name)) > 0),
  unique (entity_type, entity_id, field_name, locale)
);

create table if not exists media.search_documents (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  locale text references media.locales(code),
  kind text not null,
  title text,
  subtitle text,
  body text,
  alias_text text,
  normalized_text text,
  search_vector tsvector,
  publication_status media.publication_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_documents_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint search_documents_kind_not_blank check (length(trim(kind)) > 0),
  unique (entity_type, entity_id, locale, kind)
);

create table if not exists media.search_aliases (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  locale text references media.locales(code),
  alias text not null,
  normalized_alias text,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint search_aliases_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint search_aliases_alias_not_blank check (length(trim(alias)) > 0),
  unique (entity_type, entity_id, locale, alias)
);

create index if not exists user_roles_role_active_idx
  on creator.user_roles(role, user_id)
  where revoked_at is null;

create index if not exists creator_account_members_user_idx
  on creator.creator_account_members(user_id, creator_account_id);

create index if not exists creator_account_members_role_idx
  on creator.creator_account_members(creator_account_id, role);

create index if not exists media_assets_owner_idx
  on media.media_assets(owner_creator_account_id);

create index if not exists media_assets_publication_status_idx
  on media.media_assets(publication_status);

create index if not exists media_assets_type_status_idx
  on media.media_assets(media_type, publication_status);

create index if not exists media_asset_versions_asset_idx
  on media.media_asset_versions(media_asset_id);

create index if not exists localized_texts_entity_idx
  on media.localized_texts(entity_type, entity_id);

create index if not exists localized_texts_owner_idx
  on media.localized_texts(owner_creator_account_id);

create index if not exists search_documents_entity_idx
  on media.search_documents(entity_type, entity_id);

create index if not exists search_documents_owner_idx
  on media.search_documents(owner_creator_account_id);

create index if not exists search_documents_vector_idx
  on media.search_documents using gin(search_vector);

create index if not exists search_aliases_entity_idx
  on media.search_aliases(entity_type, entity_id);

create index if not exists search_aliases_normalized_idx
  on media.search_aliases(normalized_alias);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from creator.user_roles user_role
    where user_role.user_id = (select auth.uid())
      and user_role.role = 'admin'::creator.app_role
      and user_role.revoked_at is null
  );
$$;

create or replace function private.has_app_role(required_role creator.app_role)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from creator.user_roles user_role
    where user_role.user_id = (select auth.uid())
      and user_role.role = required_role
      and user_role.revoked_at is null
  );
$$;

create or replace function private.is_creator_account_member(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from creator.creator_account_members member
    where member.creator_account_id = account_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_manage_creator_account(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select (select private.is_admin()) or exists (
    select 1
    from creator.creator_account_members member
    where member.creator_account_id = account_id
      and member.user_id = (select auth.uid())
      and member.role in ('owner'::creator.creator_account_role, 'manager'::creator.creator_account_role)
  );
$$;

create or replace function private.can_edit_creator_account(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select (select private.is_admin()) or exists (
    select 1
    from creator.creator_account_members member
    where member.creator_account_id = account_id
      and member.user_id = (select auth.uid())
      and member.role in (
        'owner'::creator.creator_account_role,
        'manager'::creator.creator_account_role,
        'editor'::creator.creator_account_role,
        'uploader'::creator.creator_account_role
      )
  );
$$;

create or replace function private.created_creator_account(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from creator.creator_accounts account
    where account.id = account_id
      and account.created_by = (select auth.uid())
  );
$$;

create or replace function private.can_read_media_owner(account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select account_id is not null and (
    (select private.is_admin()) or (select private.is_creator_account_member(account_id))
  );
$$;

create or replace function private.media_asset_is_visible(asset_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from media.media_assets asset
    where asset.id = asset_id
      and (
        asset.publication_status = 'published'::media.publication_status
        or (select private.can_read_media_owner(asset.owner_creator_account_id))
      )
  );
$$;

create or replace function private.media_asset_is_editable(asset_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from media.media_assets asset
    where asset.id = asset_id
      and (select private.can_edit_creator_account(asset.owner_creator_account_id))
  );
$$;

do $$
declare
  trigger_table regclass;
begin
  foreach trigger_table in array array[
    'creator.profiles'::regclass,
    'creator.creator_accounts'::regclass,
    'creator.creator_account_members'::regclass,
    'media.locales'::regclass,
    'media.media_assets'::regclass,
    'media.localized_texts'::regclass,
    'media.search_documents'::regclass,
    'media.search_aliases'::regclass
  ]
  loop
    execute format('drop trigger if exists set_updated_at on %s', trigger_table);
    execute format(
      'create trigger set_updated_at before update on %s for each row execute function private.set_updated_at()',
      trigger_table
    );
  end loop;
end $$;

alter table creator.profiles enable row level security;
alter table creator.user_roles enable row level security;
alter table creator.creator_accounts enable row level security;
alter table creator.creator_account_members enable row level security;
alter table media.locales enable row level security;
alter table media.media_assets enable row level security;
alter table media.media_asset_versions enable row level security;
alter table media.localized_texts enable row level security;
alter table media.search_documents enable row level security;
alter table media.search_aliases enable row level security;

revoke all on schema creator from public;
revoke all on schema media from public;
revoke all on schema private from public;

grant usage on schema creator to authenticated, service_role;
grant usage on schema media to anon, authenticated, service_role;
grant usage on schema private to anon, authenticated;

revoke all on all tables in schema creator from anon, authenticated;
revoke all on all tables in schema media from anon, authenticated;

grant all on all tables in schema creator to service_role;
grant all on all tables in schema media to service_role;

grant select, insert, update on table creator.profiles to authenticated;
grant select, insert, update, delete on table creator.user_roles to authenticated;
grant select, insert, update on table creator.creator_accounts to authenticated;
grant select, insert, update, delete on table creator.creator_account_members to authenticated;

grant select on table media.locales to anon, authenticated;
grant select on table media.media_assets to anon, authenticated;
grant insert, update on table media.media_assets to authenticated;
grant select on table media.media_asset_versions to anon, authenticated;
grant insert, update on table media.media_asset_versions to authenticated;
grant select on table media.localized_texts to anon, authenticated;
grant insert, update on table media.localized_texts to authenticated;
grant select on table media.search_documents to anon, authenticated;
grant insert, update on table media.search_documents to authenticated;
grant select on table media.search_aliases to anon, authenticated;
grant insert, update on table media.search_aliases to authenticated;

revoke execute on all functions in schema private from public;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_app_role(creator.app_role) to authenticated;
grant execute on function private.is_creator_account_member(uuid) to authenticated;
grant execute on function private.can_manage_creator_account(uuid) to authenticated;
grant execute on function private.can_edit_creator_account(uuid) to authenticated;
grant execute on function private.created_creator_account(uuid) to authenticated;
grant execute on function private.can_read_media_owner(uuid) to anon, authenticated;
grant execute on function private.media_asset_is_visible(uuid) to anon, authenticated;
grant execute on function private.media_asset_is_editable(uuid) to authenticated;

create policy "profiles_select_own_or_admin"
on creator.profiles for select
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));

create policy "profiles_insert_self"
on creator.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "profiles_update_own_or_admin"
on creator.profiles for update
to authenticated
using (id = (select auth.uid()) or (select private.is_admin()))
with check (id = (select auth.uid()) or (select private.is_admin()));

create policy "user_roles_select_own_or_admin"
on creator.user_roles for select
to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy "user_roles_insert_admin"
on creator.user_roles for insert
to authenticated
with check ((select private.is_admin()));

create policy "user_roles_update_admin"
on creator.user_roles for update
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "user_roles_delete_admin"
on creator.user_roles for delete
to authenticated
using ((select private.is_admin()));

create policy "creator_accounts_select_member_or_admin"
on creator.creator_accounts for select
to authenticated
using ((select private.is_admin()) or (select private.is_creator_account_member(id)));

create policy "creator_accounts_insert_creator_or_admin"
on creator.creator_accounts for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select private.has_app_role('creator'::creator.app_role))
    or (select private.is_admin())
  )
);

create policy "creator_accounts_update_manager_or_admin"
on creator.creator_accounts for update
to authenticated
using ((select private.can_manage_creator_account(id)))
with check ((select private.can_manage_creator_account(id)));

create policy "creator_account_members_select_member_or_admin"
on creator.creator_account_members for select
to authenticated
using ((select private.is_admin()) or (select private.is_creator_account_member(creator_account_id)));

create policy "creator_account_members_insert_manager_or_bootstrap_owner"
on creator.creator_account_members for insert
to authenticated
with check (
  (select private.can_manage_creator_account(creator_account_id))
  or (
    role = 'owner'::creator.creator_account_role
    and user_id = (select auth.uid())
    and (select private.created_creator_account(creator_account_id))
  )
);

create policy "creator_account_members_update_manager_or_admin"
on creator.creator_account_members for update
to authenticated
using ((select private.can_manage_creator_account(creator_account_id)))
with check ((select private.can_manage_creator_account(creator_account_id)));

create policy "creator_account_members_delete_manager_or_admin"
on creator.creator_account_members for delete
to authenticated
using ((select private.can_manage_creator_account(creator_account_id)));

create policy "locales_select_enabled"
on media.locales for select
to anon, authenticated
using (enabled = true);

create policy "media_assets_select_published_or_owner"
on media.media_assets for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "media_assets_insert_owner_or_admin"
on media.media_assets for insert
to authenticated
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "media_assets_update_owner_or_admin"
on media.media_assets for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "media_asset_versions_select_visible_asset"
on media.media_asset_versions for select
to anon, authenticated
using ((select private.media_asset_is_visible(media_asset_id)));

create policy "media_asset_versions_insert_editable_asset"
on media.media_asset_versions for insert
to authenticated
with check ((select private.media_asset_is_editable(media_asset_id)));

create policy "media_asset_versions_update_editable_asset"
on media.media_asset_versions for update
to authenticated
using ((select private.media_asset_is_editable(media_asset_id)))
with check ((select private.media_asset_is_editable(media_asset_id)));

create policy "localized_texts_select_published_or_owner"
on media.localized_texts for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "localized_texts_insert_owner_or_admin"
on media.localized_texts for insert
to authenticated
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "localized_texts_update_owner_or_admin"
on media.localized_texts for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "search_documents_select_published_or_owner"
on media.search_documents for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "search_documents_insert_owner_or_admin"
on media.search_documents for insert
to authenticated
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "search_documents_update_owner_or_admin"
on media.search_documents for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "search_aliases_select_published_or_owner"
on media.search_aliases for select
to anon, authenticated
using (
  publication_status = 'published'::media.publication_status
  or (select private.can_read_media_owner(owner_creator_account_id))
);

create policy "search_aliases_insert_owner_or_admin"
on media.search_aliases for insert
to authenticated
with check ((select private.can_edit_creator_account(owner_creator_account_id)));

create policy "search_aliases_update_owner_or_admin"
on media.search_aliases for update
to authenticated
using ((select private.can_edit_creator_account(owner_creator_account_id)))
with check ((select private.can_edit_creator_account(owner_creator_account_id)));
