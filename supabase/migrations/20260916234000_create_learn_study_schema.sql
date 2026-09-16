create schema if not exists learning;

grant usage on schema learning to anon, authenticated;

create type learning.lesson_media_type as enum ('audio', 'video');
create type learning.progress_state as enum ('will_learn', 'learning', 'finished');
create type learning.playlist_visibility as enum ('private', 'unlisted', 'public');
create type learning.playlist_item_kind as enum ('album_recording', 'lesson');

create table learning.cantors (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  profile_image_asset_id uuid references media.media_assets(id) on delete set null,
  display_name text not null check (length(trim(display_name)) > 0),
  sort_name text,
  biography text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.cantor_localizations (
  cantor_id uuid not null references learning.cantors(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  biography text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (cantor_id, locale)
);

create table learning.cantor_permissions (
  id uuid primary key default gen_random_uuid(),
  cantor_id uuid not null references learning.cantors(id) on delete cascade,
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'uploader')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cantor_id, creator_account_id)
);

create table learning.seasons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9_-]*$'),
  title text not null check (length(trim(title)) > 0),
  description text,
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.season_localizations (
  season_id uuid not null references learning.seasons(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_id, locale)
);

create table learning.hymns (
  id uuid primary key default gen_random_uuid(),
  source_hymn_key text references public.hymn_titles(hymn_key) on update cascade on delete set null,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_hymn_key)
);

create table learning.hymn_localizations (
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hymn_id, locale)
);

create table learning.hymn_seasons (
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  season_id uuid not null references learning.seasons(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (hymn_id, season_id)
);

create table learning.hymn_relationships (
  id uuid primary key default gen_random_uuid(),
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  related_hymn_id uuid not null references learning.hymns(id) on delete cascade,
  relationship_type text not null check (length(trim(relationship_type)) > 0),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (hymn_id <> related_hymn_id),
  unique (hymn_id, related_hymn_id, relationship_type)
);

create table learning.albums (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  cantor_id uuid not null references learning.cantors(id) on delete restrict,
  season_id uuid references learning.seasons(id) on delete set null,
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  submission_id uuid references media.submissions(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.album_localizations (
  album_id uuid not null references learning.albums(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (album_id, locale)
);

create table learning.album_recordings (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references learning.albums(id) on delete cascade,
  hymn_id uuid references learning.hymns(id) on delete set null,
  media_asset_id uuid not null references media.media_assets(id) on delete restrict,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (album_id, sort_order)
);

create table learning.recording_localizations (
  recording_id uuid not null references learning.album_recordings(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  subtitle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recording_id, locale)
);

create table learning.lesson_sets (
  id uuid primary key default gen_random_uuid(),
  owner_creator_account_id uuid references creator.creator_accounts(id) on delete set null,
  cantor_id uuid not null references learning.cantors(id) on delete restrict,
  season_id uuid references learning.seasons(id) on delete set null,
  hymn_id uuid not null references learning.hymns(id) on delete restrict,
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  submission_id uuid references media.submissions(id) on delete set null,
  title text not null check (length(trim(title)) > 0),
  description text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.lesson_set_localizations (
  lesson_set_id uuid not null references learning.lesson_sets(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_set_id, locale)
);

create table learning.lessons (
  id uuid primary key default gen_random_uuid(),
  lesson_set_id uuid not null references learning.lesson_sets(id) on delete cascade,
  media_asset_id uuid not null references media.media_assets(id) on delete restrict,
  media_type learning.lesson_media_type not null,
  title text not null check (length(trim(title)) > 0),
  description text,
  duration_ms bigint check (duration_ms is null or duration_ms >= 0),
  sort_order integer not null default 0,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_set_id, sort_order)
);

create table learning.lesson_localizations (
  lesson_id uuid not null references learning.lessons(id) on delete cascade,
  locale text not null references media.locales(code) on update cascade,
  title text not null check (length(trim(title)) > 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lesson_id, locale)
);

create table learning.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  visibility learning.playlist_visibility not null default 'private',
  cover_asset_id uuid references media.media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references learning.playlists(id) on delete cascade,
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  ),
  unique (playlist_id, sort_order)
);

create table learning.hymn_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  hymn_id uuid not null references learning.hymns(id) on delete cascade,
  state learning.progress_state not null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, hymn_id)
);

create index learning_cantors_publication_idx on learning.cantors (publication_status, display_name);
create index learning_seasons_publication_sort_idx on learning.seasons (publication_status, sort_order, title);
create index learning_hymns_publication_title_idx on learning.hymns (publication_status, title);
create index learning_hymn_seasons_season_idx on learning.hymn_seasons (season_id, sort_order, hymn_id);
create index learning_albums_discovery_idx on learning.albums (publication_status, cantor_id, season_id, created_at desc);
create index learning_recordings_album_idx on learning.album_recordings (album_id, sort_order);
create index learning_lesson_sets_discovery_idx on learning.lesson_sets (publication_status, cantor_id, season_id, hymn_id, created_at desc);
create index learning_lessons_set_idx on learning.lessons (lesson_set_id, sort_order);
create index learning_playlists_owner_idx on learning.playlists (owner_user_id, updated_at desc);
create index learning_progress_user_state_idx on learning.hymn_progress (user_id, state, updated_at desc);

create trigger learning_cantors_set_updated_at before update on learning.cantors for each row execute function private.set_updated_at();
create trigger learning_cantor_localizations_set_updated_at before update on learning.cantor_localizations for each row execute function private.set_updated_at();
create trigger learning_cantor_permissions_set_updated_at before update on learning.cantor_permissions for each row execute function private.set_updated_at();
create trigger learning_seasons_set_updated_at before update on learning.seasons for each row execute function private.set_updated_at();
create trigger learning_season_localizations_set_updated_at before update on learning.season_localizations for each row execute function private.set_updated_at();
create trigger learning_hymns_set_updated_at before update on learning.hymns for each row execute function private.set_updated_at();
create trigger learning_hymn_localizations_set_updated_at before update on learning.hymn_localizations for each row execute function private.set_updated_at();
create trigger learning_hymn_relationships_set_updated_at before update on learning.hymn_relationships for each row execute function private.set_updated_at();
create trigger learning_albums_set_updated_at before update on learning.albums for each row execute function private.set_updated_at();
create trigger learning_album_localizations_set_updated_at before update on learning.album_localizations for each row execute function private.set_updated_at();
create trigger learning_recordings_set_updated_at before update on learning.album_recordings for each row execute function private.set_updated_at();
create trigger learning_recording_localizations_set_updated_at before update on learning.recording_localizations for each row execute function private.set_updated_at();
create trigger learning_lesson_sets_set_updated_at before update on learning.lesson_sets for each row execute function private.set_updated_at();
create trigger learning_lesson_set_localizations_set_updated_at before update on learning.lesson_set_localizations for each row execute function private.set_updated_at();
create trigger learning_lessons_set_updated_at before update on learning.lessons for each row execute function private.set_updated_at();
create trigger learning_lesson_localizations_set_updated_at before update on learning.lesson_localizations for each row execute function private.set_updated_at();
create trigger learning_playlists_set_updated_at before update on learning.playlists for each row execute function private.set_updated_at();
create trigger learning_hymn_progress_set_updated_at before update on learning.hymn_progress for each row execute function private.set_updated_at();

create or replace function private.learning_publication_is_creator_mutable(status media.publication_status)
returns boolean
language sql
immutable
as $$
  select status in ('draft', 'uploading', 'ready_to_submit', 'changes_requested', 'rejected');
$$;

create or replace function private.learning_cantor_is_editable(p_cantor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_admin()
    or exists (
      select 1 from learning.cantors c
      where c.id = p_cantor_id
        and c.owner_creator_account_id is not null
        and private.can_edit_creator_account(c.owner_creator_account_id)
    )
    or exists (
      select 1 from learning.cantor_permissions cp
      where cp.cantor_id = p_cantor_id
        and private.can_edit_creator_account(cp.creator_account_id)
    );
$$;

create or replace function private.learning_cantor_is_visible(p_cantor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from learning.cantors c
    where c.id = p_cantor_id
      and (c.publication_status = 'published' or private.learning_cantor_is_editable(c.id))
  );
$$;

create or replace function private.learning_album_is_editable(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_admin()
    or exists (
      select 1 from learning.albums a
      where a.id = p_album_id
        and (
          (a.owner_creator_account_id is not null and private.can_edit_creator_account(a.owner_creator_account_id))
          or private.learning_cantor_is_editable(a.cantor_id)
        )
    );
$$;

create or replace function private.learning_album_is_visible(p_album_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from learning.albums a
    where a.id = p_album_id
      and (a.publication_status = 'published' or private.learning_album_is_editable(a.id))
  );
$$;

create or replace function private.learning_lesson_set_is_editable(p_lesson_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select private.is_admin()
    or exists (
      select 1 from learning.lesson_sets ls
      where ls.id = p_lesson_set_id
        and (
          (ls.owner_creator_account_id is not null and private.can_edit_creator_account(ls.owner_creator_account_id))
          or private.learning_cantor_is_editable(ls.cantor_id)
        )
    );
$$;

create or replace function private.learning_lesson_set_is_visible(p_lesson_set_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from learning.lesson_sets ls
    where ls.id = p_lesson_set_id
      and (ls.publication_status = 'published' or private.learning_lesson_set_is_editable(ls.id))
  );
$$;

revoke all on function private.learning_cantor_is_editable(uuid) from public;
revoke all on function private.learning_cantor_is_visible(uuid) from public;
revoke all on function private.learning_album_is_editable(uuid) from public;
revoke all on function private.learning_album_is_visible(uuid) from public;
revoke all on function private.learning_lesson_set_is_editable(uuid) from public;
revoke all on function private.learning_lesson_set_is_visible(uuid) from public;
grant execute on function private.learning_cantor_is_visible(uuid) to anon, authenticated;
grant execute on function private.learning_cantor_is_editable(uuid) to authenticated;
grant execute on function private.learning_album_is_visible(uuid) to anon, authenticated;
grant execute on function private.learning_album_is_editable(uuid) to authenticated;
grant execute on function private.learning_lesson_set_is_visible(uuid) to anon, authenticated;
grant execute on function private.learning_lesson_set_is_editable(uuid) to authenticated;

grant select on all tables in schema learning to anon, authenticated;
grant insert, update, delete on all tables in schema learning to authenticated;

alter table learning.cantors enable row level security;
alter table learning.cantor_localizations enable row level security;
alter table learning.cantor_permissions enable row level security;
alter table learning.seasons enable row level security;
alter table learning.season_localizations enable row level security;
alter table learning.hymns enable row level security;
alter table learning.hymn_localizations enable row level security;
alter table learning.hymn_seasons enable row level security;
alter table learning.hymn_relationships enable row level security;
alter table learning.albums enable row level security;
alter table learning.album_localizations enable row level security;
alter table learning.album_recordings enable row level security;
alter table learning.recording_localizations enable row level security;
alter table learning.lesson_sets enable row level security;
alter table learning.lesson_set_localizations enable row level security;
alter table learning.lessons enable row level security;
alter table learning.lesson_localizations enable row level security;
alter table learning.playlists enable row level security;
alter table learning.playlist_items enable row level security;
alter table learning.hymn_progress enable row level security;

create policy learning_cantors_select on learning.cantors for select using (private.learning_cantor_is_visible(id));
create policy learning_cantors_insert on learning.cantors for insert to authenticated with check (private.is_admin() or (owner_creator_account_id is not null and private.can_edit_creator_account(owner_creator_account_id)));
create policy learning_cantors_update on learning.cantors for update to authenticated using (private.learning_cantor_is_editable(id)) with check (private.is_admin() or private.learning_publication_is_creator_mutable(publication_status));
create policy learning_cantors_delete on learning.cantors for delete to authenticated using (private.is_admin() or (private.learning_cantor_is_editable(id) and publication_status = 'draft'));

create policy learning_cantor_localizations_select on learning.cantor_localizations for select using (private.learning_cantor_is_visible(cantor_id));
create policy learning_cantor_localizations_write on learning.cantor_localizations for all to authenticated using (private.learning_cantor_is_editable(cantor_id)) with check (private.learning_cantor_is_editable(cantor_id));
create policy learning_cantor_permissions_select on learning.cantor_permissions for select to authenticated using (private.learning_cantor_is_editable(cantor_id));
create policy learning_cantor_permissions_write on learning.cantor_permissions for all to authenticated using (private.learning_cantor_is_editable(cantor_id)) with check (private.learning_cantor_is_editable(cantor_id));

create policy learning_seasons_select on learning.seasons for select using (publication_status = 'published' or private.is_admin());
create policy learning_seasons_admin_write on learning.seasons for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_season_localizations_select on learning.season_localizations for select using (exists (select 1 from learning.seasons s where s.id = season_id and (s.publication_status = 'published' or private.is_admin())));
create policy learning_season_localizations_admin_write on learning.season_localizations for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy learning_hymns_select on learning.hymns for select using (publication_status = 'published' or private.is_admin());
create policy learning_hymns_admin_write on learning.hymns for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_localizations_select on learning.hymn_localizations for select using (exists (select 1 from learning.hymns h where h.id = hymn_id and (h.publication_status = 'published' or private.is_admin())));
create policy learning_hymn_localizations_admin_write on learning.hymn_localizations for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_seasons_select on learning.hymn_seasons for select using (exists (select 1 from learning.hymns h join learning.seasons s on s.id = season_id where h.id = hymn_id and h.publication_status = 'published' and s.publication_status = 'published') or private.is_admin());
create policy learning_hymn_seasons_admin_write on learning.hymn_seasons for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_relationships_select on learning.hymn_relationships for select using (exists (select 1 from learning.hymns h1 join learning.hymns h2 on h2.id = related_hymn_id where h1.id = hymn_id and h1.publication_status = 'published' and h2.publication_status = 'published') or private.is_admin());
create policy learning_hymn_relationships_admin_write on learning.hymn_relationships for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy learning_albums_select on learning.albums for select using (private.learning_album_is_visible(id));
create policy learning_albums_insert on learning.albums for insert to authenticated with check (private.is_admin() or (owner_creator_account_id is not null and private.can_edit_creator_account(owner_creator_account_id)) or private.learning_cantor_is_editable(cantor_id));
create policy learning_albums_update on learning.albums for update to authenticated using (private.learning_album_is_editable(id)) with check (private.is_admin() or private.learning_publication_is_creator_mutable(publication_status));
create policy learning_albums_delete on learning.albums for delete to authenticated using (private.is_admin() or (private.learning_album_is_editable(id) and publication_status = 'draft'));
create policy learning_album_localizations_select on learning.album_localizations for select using (private.learning_album_is_visible(album_id));
create policy learning_album_localizations_write on learning.album_localizations for all to authenticated using (private.learning_album_is_editable(album_id)) with check (private.learning_album_is_editable(album_id));
create policy learning_recordings_select on learning.album_recordings for select using (private.learning_album_is_visible(album_id) and (publication_status = 'published' or private.learning_album_is_editable(album_id)));
create policy learning_recordings_write on learning.album_recordings for all to authenticated using (private.learning_album_is_editable(album_id)) with check (private.learning_album_is_editable(album_id));
create policy learning_recording_localizations_select on learning.recording_localizations for select using (exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_visible(r.album_id)));
create policy learning_recording_localizations_write on learning.recording_localizations for all to authenticated using (exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_editable(r.album_id))) with check (exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_editable(r.album_id)));

create policy learning_lesson_sets_select on learning.lesson_sets for select using (private.learning_lesson_set_is_visible(id));
create policy learning_lesson_sets_insert on learning.lesson_sets for insert to authenticated with check (private.is_admin() or (owner_creator_account_id is not null and private.can_edit_creator_account(owner_creator_account_id)) or private.learning_cantor_is_editable(cantor_id));
create policy learning_lesson_sets_update on learning.lesson_sets for update to authenticated using (private.learning_lesson_set_is_editable(id)) with check (private.is_admin() or private.learning_publication_is_creator_mutable(publication_status));
create policy learning_lesson_sets_delete on learning.lesson_sets for delete to authenticated using (private.is_admin() or (private.learning_lesson_set_is_editable(id) and publication_status = 'draft'));
create policy learning_lesson_set_localizations_select on learning.lesson_set_localizations for select using (private.learning_lesson_set_is_visible(lesson_set_id));
create policy learning_lesson_set_localizations_write on learning.lesson_set_localizations for all to authenticated using (private.learning_lesson_set_is_editable(lesson_set_id)) with check (private.learning_lesson_set_is_editable(lesson_set_id));
create policy learning_lessons_select on learning.lessons for select using (private.learning_lesson_set_is_visible(lesson_set_id) and (publication_status = 'published' or private.learning_lesson_set_is_editable(lesson_set_id)));
create policy learning_lessons_write on learning.lessons for all to authenticated using (private.learning_lesson_set_is_editable(lesson_set_id)) with check (private.learning_lesson_set_is_editable(lesson_set_id));
create policy learning_lesson_localizations_select on learning.lesson_localizations for select using (exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_visible(l.lesson_set_id)));
create policy learning_lesson_localizations_write on learning.lesson_localizations for all to authenticated using (exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_editable(l.lesson_set_id))) with check (exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_editable(l.lesson_set_id)));

create policy learning_playlists_select on learning.playlists for select using (owner_user_id = auth.uid() or visibility in ('unlisted', 'public'));
create policy learning_playlists_insert on learning.playlists for insert to authenticated with check (owner_user_id = auth.uid());
create policy learning_playlists_update on learning.playlists for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy learning_playlists_delete on learning.playlists for delete to authenticated using (owner_user_id = auth.uid());
create policy learning_playlist_items_select on learning.playlist_items for select using (exists (select 1 from learning.playlists p where p.id = playlist_id and (p.owner_user_id = auth.uid() or p.visibility in ('unlisted', 'public'))));
create policy learning_playlist_items_write on learning.playlist_items for all to authenticated using (exists (select 1 from learning.playlists p where p.id = playlist_id and p.owner_user_id = auth.uid())) with check (exists (select 1 from learning.playlists p where p.id = playlist_id and p.owner_user_id = auth.uid()));

create policy learning_progress_select on learning.hymn_progress for select to authenticated using (user_id = auth.uid());
create policy learning_progress_insert on learning.hymn_progress for insert to authenticated with check (user_id = auth.uid());
create policy learning_progress_update on learning.hymn_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy learning_progress_delete on learning.hymn_progress for delete to authenticated using (user_id = auth.uid());
