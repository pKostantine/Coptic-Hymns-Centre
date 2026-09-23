alter table learning.lyric_edit_drafts
  add column if not exists id uuid default gen_random_uuid();

update learning.lyric_edit_drafts
set id = gen_random_uuid()
where id is null;

alter table learning.lyric_edit_drafts
  alter column id set default gen_random_uuid(),
  alter column id set not null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'learning.lyric_edit_drafts'::regclass
      and contype = 'p'
  ) then
    alter table learning.lyric_edit_drafts
      add constraint lyric_edit_drafts_pkey primary key (id);
  end if;
end;
$block$;

create index if not exists learning_lyric_drafts_locale_idx
  on learning.lyric_edit_drafts(locale);
create index if not exists learning_lyric_drafts_created_by_idx
  on learning.lyric_edit_drafts(created_by)
  where created_by is not null;
create index if not exists learning_lyric_drafts_updated_by_idx
  on learning.lyric_edit_drafts(updated_by)
  where updated_by is not null;

create index if not exists learning_lyric_sets_locale_idx
  on learning.lyric_sets(locale);
create index if not exists learning_lyric_sets_created_by_idx
  on learning.lyric_sets(created_by)
  where created_by is not null;
create index if not exists learning_lyric_sets_updated_by_idx
  on learning.lyric_sets(updated_by)
  where updated_by is not null;

create index if not exists music_lyric_drafts_locale_idx
  on music.lyric_edit_drafts(locale);
create index if not exists music_lyric_drafts_created_by_idx
  on music.lyric_edit_drafts(created_by)
  where created_by is not null;
create index if not exists music_lyric_drafts_updated_by_idx
  on music.lyric_edit_drafts(updated_by)
  where updated_by is not null;

drop policy if exists learning_playlists_select on learning.playlists;
drop policy if exists learning_playlists_insert on learning.playlists;
drop policy if exists learning_playlists_update on learning.playlists;
drop policy if exists learning_playlists_delete on learning.playlists;

create policy learning_playlists_select on learning.playlists
for select using (
  owner_user_id = (select auth.uid())
  or visibility in ('unlisted', 'public')
);
create policy learning_playlists_insert on learning.playlists
for insert to authenticated
with check (owner_user_id = (select auth.uid()));
create policy learning_playlists_update on learning.playlists
for update to authenticated
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));
create policy learning_playlists_delete on learning.playlists
for delete to authenticated
using (owner_user_id = (select auth.uid()));

drop policy if exists learning_playlist_items_select on learning.playlist_items;
drop policy if exists learning_playlist_items_write on learning.playlist_items;
drop policy if exists learning_playlist_items_insert on learning.playlist_items;
drop policy if exists learning_playlist_items_update on learning.playlist_items;
drop policy if exists learning_playlist_items_delete on learning.playlist_items;

create policy learning_playlist_items_select on learning.playlist_items
for select using (
  exists (
    select 1
    from learning.playlists playlist
    where playlist.id = playlist_id
      and (
        playlist.owner_user_id = (select auth.uid())
        or playlist.visibility in ('unlisted', 'public')
      )
  )
);
create policy learning_playlist_items_insert on learning.playlist_items
for insert to authenticated
with check (
  exists (
    select 1
    from learning.playlists playlist
    where playlist.id = playlist_id
      and playlist.owner_user_id = (select auth.uid())
  )
);
create policy learning_playlist_items_update on learning.playlist_items
for update to authenticated
using (
  exists (
    select 1
    from learning.playlists playlist
    where playlist.id = playlist_id
      and playlist.owner_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from learning.playlists playlist
    where playlist.id = playlist_id
      and playlist.owner_user_id = (select auth.uid())
  )
);
create policy learning_playlist_items_delete on learning.playlist_items
for delete to authenticated
using (
  exists (
    select 1
    from learning.playlists playlist
    where playlist.id = playlist_id
      and playlist.owner_user_id = (select auth.uid())
  )
);

drop policy if exists learning_lyric_sets_write on learning.lyric_sets;
drop policy if exists learning_lyric_sets_insert on learning.lyric_sets;
drop policy if exists learning_lyric_sets_update on learning.lyric_sets;
drop policy if exists learning_lyric_sets_delete on learning.lyric_sets;

create policy learning_lyric_sets_insert on learning.lyric_sets
for insert to authenticated
with check (
  private.learning_lyric_item_is_editable(
    item_kind,
    coalesce(album_recording_id, lesson_id)
  )
);
create policy learning_lyric_sets_update on learning.lyric_sets
for update to authenticated
using (
  private.learning_lyric_item_is_editable(
    item_kind,
    coalesce(album_recording_id, lesson_id)
  )
)
with check (
  private.learning_lyric_item_is_editable(
    item_kind,
    coalesce(album_recording_id, lesson_id)
  )
);
create policy learning_lyric_sets_delete on learning.lyric_sets
for delete to authenticated
using (
  private.learning_lyric_item_is_editable(
    item_kind,
    coalesce(album_recording_id, lesson_id)
  )
);
