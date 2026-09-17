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
      select 1
      from learning.cantors c
      where c.id = p_cantor_id
        and c.owner_creator_account_id is not null
        and private.can_edit_creator_account(c.owner_creator_account_id)
    )
    or exists (
      select 1
      from learning.cantor_permissions cp
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
    select 1
    from learning.cantors c
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
      select 1
      from learning.albums a
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
    select 1
    from learning.albums a
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
      select 1
      from learning.lesson_sets ls
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
    select 1
    from learning.lesson_sets ls
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
create policy learning_season_localizations_select on learning.season_localizations for select using (
  exists (
    select 1 from learning.seasons s
    where s.id = season_id and (s.publication_status = 'published' or private.is_admin())
  )
);
create policy learning_season_localizations_admin_write on learning.season_localizations for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy learning_hymns_select on learning.hymns for select using (publication_status = 'published' or private.is_admin());
create policy learning_hymns_admin_write on learning.hymns for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_localizations_select on learning.hymn_localizations for select using (
  exists (
    select 1 from learning.hymns h
    where h.id = hymn_id and (h.publication_status = 'published' or private.is_admin())
  )
);
create policy learning_hymn_localizations_admin_write on learning.hymn_localizations for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_seasons_select on learning.hymn_seasons for select using (
  private.is_admin() or (
    exists (select 1 from learning.hymns h where h.id = hymn_id and h.publication_status = 'published')
    and exists (select 1 from learning.seasons s where s.id = season_id and s.publication_status = 'published')
  )
);
create policy learning_hymn_seasons_admin_write on learning.hymn_seasons for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy learning_hymn_relationships_select on learning.hymn_relationships for select using (
  private.is_admin() or (
    exists (select 1 from learning.hymns h where h.id = hymn_id and h.publication_status = 'published')
    and exists (select 1 from learning.hymns h where h.id = related_hymn_id and h.publication_status = 'published')
  )
);
create policy learning_hymn_relationships_admin_write on learning.hymn_relationships for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy learning_albums_select on learning.albums for select using (private.learning_album_is_visible(id));
create policy learning_albums_insert on learning.albums for insert to authenticated with check (
  private.is_admin()
  or (owner_creator_account_id is not null and private.can_edit_creator_account(owner_creator_account_id))
  or private.learning_cantor_is_editable(cantor_id)
);
create policy learning_albums_update on learning.albums for update to authenticated using (private.learning_album_is_editable(id)) with check (private.is_admin() or private.learning_publication_is_creator_mutable(publication_status));
create policy learning_albums_delete on learning.albums for delete to authenticated using (private.is_admin() or (private.learning_album_is_editable(id) and publication_status = 'draft'));
create policy learning_album_localizations_select on learning.album_localizations for select using (private.learning_album_is_visible(album_id));
create policy learning_album_localizations_write on learning.album_localizations for all to authenticated using (private.learning_album_is_editable(album_id)) with check (private.learning_album_is_editable(album_id));
create policy learning_recordings_select on learning.album_recordings for select using (private.learning_album_is_visible(album_id) and (publication_status = 'published' or private.learning_album_is_editable(album_id)));
create policy learning_recordings_write on learning.album_recordings for all to authenticated using (private.learning_album_is_editable(album_id)) with check (private.learning_album_is_editable(album_id));
create policy learning_recording_localizations_select on learning.recording_localizations for select using (
  exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_visible(r.album_id))
);
create policy learning_recording_localizations_write on learning.recording_localizations for all to authenticated using (
  exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_editable(r.album_id))
) with check (
  exists (select 1 from learning.album_recordings r where r.id = recording_id and private.learning_album_is_editable(r.album_id))
);

create policy learning_lesson_sets_select on learning.lesson_sets for select using (private.learning_lesson_set_is_visible(id));
create policy learning_lesson_sets_insert on learning.lesson_sets for insert to authenticated with check (
  private.is_admin()
  or (owner_creator_account_id is not null and private.can_edit_creator_account(owner_creator_account_id))
  or private.learning_cantor_is_editable(cantor_id)
);
create policy learning_lesson_sets_update on learning.lesson_sets for update to authenticated using (private.learning_lesson_set_is_editable(id)) with check (private.is_admin() or private.learning_publication_is_creator_mutable(publication_status));
create policy learning_lesson_sets_delete on learning.lesson_sets for delete to authenticated using (private.is_admin() or (private.learning_lesson_set_is_editable(id) and publication_status = 'draft'));
create policy learning_lesson_set_localizations_select on learning.lesson_set_localizations for select using (private.learning_lesson_set_is_visible(lesson_set_id));
create policy learning_lesson_set_localizations_write on learning.lesson_set_localizations for all to authenticated using (private.learning_lesson_set_is_editable(lesson_set_id)) with check (private.learning_lesson_set_is_editable(lesson_set_id));
create policy learning_lessons_select on learning.lessons for select using (private.learning_lesson_set_is_visible(lesson_set_id) and (publication_status = 'published' or private.learning_lesson_set_is_editable(lesson_set_id)));
create policy learning_lessons_write on learning.lessons for all to authenticated using (private.learning_lesson_set_is_editable(lesson_set_id)) with check (private.learning_lesson_set_is_editable(lesson_set_id));
create policy learning_lesson_localizations_select on learning.lesson_localizations for select using (
  exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_visible(l.lesson_set_id))
);
create policy learning_lesson_localizations_write on learning.lesson_localizations for all to authenticated using (
  exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_editable(l.lesson_set_id))
) with check (
  exists (select 1 from learning.lessons l where l.id = lesson_id and private.learning_lesson_set_is_editable(l.lesson_set_id))
);

create policy learning_playlists_select on learning.playlists for select using (owner_user_id = auth.uid() or visibility in ('unlisted', 'public'));
create policy learning_playlists_insert on learning.playlists for insert to authenticated with check (owner_user_id = auth.uid());
create policy learning_playlists_update on learning.playlists for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());
create policy learning_playlists_delete on learning.playlists for delete to authenticated using (owner_user_id = auth.uid());
create policy learning_playlist_items_select on learning.playlist_items for select using (
  exists (
    select 1 from learning.playlists p
    where p.id = playlist_id and (p.owner_user_id = auth.uid() or p.visibility in ('unlisted', 'public'))
  )
);
create policy learning_playlist_items_write on learning.playlist_items for all to authenticated using (
  exists (select 1 from learning.playlists p where p.id = playlist_id and p.owner_user_id = auth.uid())
) with check (
  exists (select 1 from learning.playlists p where p.id = playlist_id and p.owner_user_id = auth.uid())
);

create policy learning_progress_select on learning.hymn_progress for select to authenticated using (user_id = auth.uid());
create policy learning_progress_insert on learning.hymn_progress for insert to authenticated with check (user_id = auth.uid());
create policy learning_progress_update on learning.hymn_progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy learning_progress_delete on learning.hymn_progress for delete to authenticated using (user_id = auth.uid());
