-- Learn & Study consumer/library overhaul.
-- Public catalogue RPCs must never depend on private submission rows. Personal
-- state is tracked per playable recording/lesson so the three built-in lists
-- behave like real playlists rather than hymn labels.

create table if not exists learning.item_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  state learning.progress_state not null default 'will_learn',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  )
);

create unique index if not exists learning_item_progress_recording_unique
  on learning.item_progress(user_id, album_recording_id)
  where item_kind = 'album_recording';
create unique index if not exists learning_item_progress_lesson_unique
  on learning.item_progress(user_id, lesson_id)
  where item_kind = 'lesson';
create index if not exists learning_item_progress_library_idx
  on learning.item_progress(user_id, state, updated_at desc);

create table if not exists learning.item_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  )
);

create unique index if not exists learning_item_likes_recording_unique
  on learning.item_likes(user_id, album_recording_id)
  where item_kind = 'album_recording';
create unique index if not exists learning_item_likes_lesson_unique
  on learning.item_likes(user_id, lesson_id)
  where item_kind = 'lesson';

drop trigger if exists learning_item_progress_set_updated_at on learning.item_progress;
create trigger learning_item_progress_set_updated_at
before update on learning.item_progress
for each row execute function private.set_updated_at();

alter table learning.item_progress enable row level security;
alter table learning.item_likes enable row level security;
revoke all on table learning.item_progress, learning.item_likes from public, anon;
grant select, insert, update, delete on table learning.item_progress, learning.item_likes to authenticated;
grant all on table learning.item_progress, learning.item_likes to service_role;

create policy learning_item_progress_own on learning.item_progress
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy learning_item_likes_own on learning.item_likes
for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- Public learning lyrics are intentionally separate from music tracks. Album
-- recordings support unsynced or line-synced lyrics; lessons are unsynced only.
create table if not exists learning.lyric_sets (
  id uuid primary key default gen_random_uuid(),
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  locale text not null references media.locales(code),
  sync_precision music.lyric_sync_precision not null default 'unsynced',
  description text,
  publication_status media.publication_status not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  ),
  check (item_kind <> 'lesson' or sync_precision = 'unsynced')
);

create unique index if not exists learning_lyric_sets_recording_locale_unique
  on learning.lyric_sets(album_recording_id, locale)
  where item_kind = 'album_recording';
create unique index if not exists learning_lyric_sets_lesson_locale_unique
  on learning.lyric_sets(lesson_id, locale)
  where item_kind = 'lesson';

create table if not exists learning.lyric_lines (
  id uuid primary key default gen_random_uuid(),
  lyric_set_id uuid not null references learning.lyric_sets(id) on delete cascade,
  sequence integer not null check (sequence > 0),
  start_ms bigint check (start_ms is null or start_ms >= 0),
  end_ms bigint check (end_ms is null or end_ms >= start_ms),
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lyric_set_id, sequence)
);

create table if not exists learning.lyric_edit_drafts (
  item_kind learning.playlist_item_kind not null,
  album_recording_id uuid references learning.album_recordings(id) on delete cascade,
  lesson_id uuid references learning.lessons(id) on delete cascade,
  locale text not null references media.locales(code),
  sync_precision music.lyric_sync_precision not null default 'unsynced',
  description text,
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (item_kind = 'album_recording' and album_recording_id is not null and lesson_id is null)
    or (item_kind = 'lesson' and lesson_id is not null and album_recording_id is null)
  ),
  check (item_kind <> 'lesson' or sync_precision = 'unsynced')
);

create unique index if not exists learning_lyric_drafts_recording_locale_unique
  on learning.lyric_edit_drafts(album_recording_id, locale)
  where item_kind = 'album_recording';
create unique index if not exists learning_lyric_drafts_lesson_locale_unique
  on learning.lyric_edit_drafts(lesson_id, locale)
  where item_kind = 'lesson';

drop trigger if exists learning_lyric_sets_set_updated_at on learning.lyric_sets;
create trigger learning_lyric_sets_set_updated_at before update on learning.lyric_sets
for each row execute function private.set_updated_at();
drop trigger if exists learning_lyric_lines_set_updated_at on learning.lyric_lines;
create trigger learning_lyric_lines_set_updated_at before update on learning.lyric_lines
for each row execute function private.set_updated_at();
drop trigger if exists learning_lyric_drafts_set_updated_at on learning.lyric_edit_drafts;
create trigger learning_lyric_drafts_set_updated_at before update on learning.lyric_edit_drafts
for each row execute function private.set_updated_at();

alter table learning.lyric_sets enable row level security;
alter table learning.lyric_lines enable row level security;
alter table learning.lyric_edit_drafts enable row level security;

revoke all on table learning.lyric_sets, learning.lyric_lines, learning.lyric_edit_drafts from public, anon, authenticated;
grant select on table learning.lyric_sets, learning.lyric_lines to anon, authenticated;
grant select, insert, update, delete on table learning.lyric_sets, learning.lyric_lines, learning.lyric_edit_drafts to authenticated;
grant all on table learning.lyric_sets, learning.lyric_lines, learning.lyric_edit_drafts to service_role;

create or replace function private.learning_lyric_item_is_editable(
  p_item_kind learning.playlist_item_kind,
  p_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_item_kind
    when 'album_recording' then exists (
      select 1 from learning.album_recordings r
      where r.id = p_item_id and private.learning_album_is_editable(r.album_id)
    )
    else exists (
      select 1 from learning.lessons l
      where l.id = p_item_id and private.learning_lesson_set_is_editable(l.lesson_set_id)
    )
  end;
$$;

revoke all on function private.learning_lyric_item_is_editable(learning.playlist_item_kind, uuid) from public;
grant execute on function private.learning_lyric_item_is_editable(learning.playlist_item_kind, uuid) to authenticated;

create policy learning_lyric_sets_select on learning.lyric_sets for select using (
  publication_status = 'published'
  or private.learning_lyric_item_is_editable(item_kind, coalesce(album_recording_id, lesson_id))
);
create policy learning_lyric_sets_write on learning.lyric_sets for all to authenticated using (
  private.learning_lyric_item_is_editable(item_kind, coalesce(album_recording_id, lesson_id))
) with check (
  private.learning_lyric_item_is_editable(item_kind, coalesce(album_recording_id, lesson_id))
);
create policy learning_lyric_lines_select on learning.lyric_lines for select using (
  exists (select 1 from learning.lyric_sets s where s.id = lyric_set_id)
);
create policy learning_lyric_lines_write on learning.lyric_lines for all to authenticated using (
  exists (
    select 1 from learning.lyric_sets s
    where s.id = lyric_set_id
      and private.learning_lyric_item_is_editable(s.item_kind, coalesce(s.album_recording_id, s.lesson_id))
  )
) with check (
  exists (
    select 1 from learning.lyric_sets s
    where s.id = lyric_set_id
      and private.learning_lyric_item_is_editable(s.item_kind, coalesce(s.album_recording_id, s.lesson_id))
  )
);
create policy learning_lyric_drafts_write on learning.lyric_edit_drafts for all to authenticated using (
  private.learning_lyric_item_is_editable(item_kind, coalesce(album_recording_id, lesson_id))
) with check (
  private.learning_lyric_item_is_editable(item_kind, coalesce(album_recording_id, lesson_id))
);

-- Existing music lyric sets can now be intentionally published unsynced.
alter table music.lyric_sets drop constraint if exists lyric_sets_published_requires_sync;

create or replace function public.get_published_learning_album(p_album_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', a.id,
    'title', coalesce(al.title, a.title),
    'description', coalesce(al.description, a.description),
    'releaseTimingMode', a.release_timing_mode,
    'scheduledReleaseAt', a.scheduled_release_at,
    'originalReleaseDate', a.original_release_date,
    'displayDate', coalesce(a.original_release_date::timestamptz, a.scheduled_release_at, a.created_at),
    'cantor', jsonb_build_object('id', c.id, 'displayName', coalesce(cl.display_name, c.display_name)),
    'season', case when s.id is null then null else jsonb_build_object('id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title)) end,
    'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end,
    'recordings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'title', coalesce(rl.title, r.title), 'subtitle', coalesce(rl.subtitle, r.subtitle),
        'durationMs', coalesce(r.duration_ms, asset.duration_ms), 'sortOrder', r.sort_order, 'hymnId', r.hymn_id,
        'mediaAsset', jsonb_build_object('id', asset.id, 'provider', asset.provider, 'bucket', asset.bucket, 'path', asset.path, 'mimeType', asset.mime_type, 'durationMs', asset.duration_ms, 'fileSizeBytes', asset.file_size_bytes, 'checksum', asset.checksum)
      ) order by r.sort_order, r.id)
      from learning.album_recordings r
      join media.media_assets asset on asset.id = r.media_asset_id and asset.publication_status = 'published'
      left join learning.recording_localizations rl on rl.recording_id = r.id and rl.locale = p_locale
      where r.album_id = a.id and r.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.albums a
  join learning.cantors c on c.id = a.cantor_id and c.publication_status = 'published'
  left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
  left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
  left join learning.seasons s on s.id = a.season_id and s.publication_status = 'published'
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  left join media.media_assets cover on cover.id = a.cover_asset_id and cover.publication_status = 'published'
  where a.id = p_album_id and a.publication_status = 'published';
$$;

create or replace function public.get_published_learning_lesson_set(p_lesson_set_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', ls.id, 'title', coalesce(lsl.title, ls.title), 'description', coalesce(lsl.description, ls.description),
    'releaseTimingMode', ls.release_timing_mode, 'scheduledReleaseAt', ls.scheduled_release_at,
    'originalReleaseDate', ls.original_release_date,
    'displayDate', coalesce(ls.original_release_date::timestamptz, ls.scheduled_release_at, ls.created_at),
    'cantor', jsonb_build_object('id', c.id, 'displayName', coalesce(cl.display_name, c.display_name)),
    'season', case when s.id is null then null else jsonb_build_object('id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title)) end,
    'hymn', jsonb_build_object('id', h.id, 'sourceHymnKey', h.source_hymn_key, 'title', coalesce(hl.title, h.title), 'subtitle', coalesce(hl.subtitle, h.subtitle)),
    'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end,
    'lessons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'mediaType', l.media_type,
        -- Lesson sets represent one hymn; listeners see numbered lessons rather than artist-entered filenames.
        'title', case when p_locale = 'ar' then 'الدرس ' || (l.sort_order + 1)::text else 'Lesson ' || (l.sort_order + 1)::text end,
        'description', coalesce(ll.description, l.description), 'durationMs', coalesce(l.duration_ms, asset.duration_ms),
        'sortOrder', l.sort_order,
        'mediaAsset', jsonb_build_object('id', asset.id, 'provider', asset.provider, 'bucket', asset.bucket, 'path', asset.path, 'mimeType', asset.mime_type, 'durationMs', asset.duration_ms, 'fileSizeBytes', asset.file_size_bytes, 'checksum', asset.checksum)
      ) order by l.sort_order, l.id)
      from learning.lessons l
      join media.media_assets asset on asset.id = l.media_asset_id and asset.publication_status = 'published'
      left join learning.lesson_localizations ll on ll.lesson_id = l.id and ll.locale = p_locale
      where l.lesson_set_id = ls.id and l.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.lesson_sets ls
  join learning.cantors c on c.id = ls.cantor_id and c.publication_status = 'published'
  join learning.hymns h on h.id = ls.hymn_id and h.publication_status = 'published'
  left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
  left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
  left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
  left join learning.seasons s on s.id = ls.season_id and s.publication_status = 'published'
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  left join media.media_assets cover on cover.id = ls.cover_asset_id and cover.publication_status = 'published'
  where ls.id = p_lesson_set_id and ls.publication_status = 'published';
$$;

create or replace function public.get_published_learning_season(p_season_id uuid, p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'title', coalesce(sl.title, s.title), 'description', coalesce(sl.description, s.description),
    'hymns', coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'sourceHymnKey', h.source_hymn_key, 'title', coalesce(hl.title, h.title), 'subtitle', coalesce(hl.subtitle, h.subtitle), 'sortOrder', hs.sort_order) order by hs.sort_order, coalesce(hl.title, h.title))
      from learning.hymn_seasons hs
      join learning.hymns h on h.id = hs.hymn_id and h.publication_status = 'published'
      left join learning.hymn_localizations hl on hl.hymn_id = h.id and hl.locale = p_locale
      where hs.season_id = s.id
    ), '[]'::jsonb),
    'albums', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'title', coalesce(al.title, a.title), 'description', coalesce(al.description, a.description),
        'cantorId', c.id, 'cantorName', coalesce(cl.display_name, c.display_name),
        'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end
      ) order by a.created_at desc)
      from learning.albums a
      join learning.cantors c on c.id = a.cantor_id and c.publication_status = 'published'
      left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
      left join learning.album_localizations al on al.album_id = a.id and al.locale = p_locale
      left join media.media_assets cover on cover.id = a.cover_asset_id and cover.publication_status = 'published'
      where a.season_id = s.id and a.publication_status = 'published'
    ), '[]'::jsonb),
    'lessonSets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ls.id, 'title', coalesce(lsl.title, ls.title), 'description', coalesce(lsl.description, ls.description),
        'cantorId', c.id, 'cantorName', coalesce(cl.display_name, c.display_name), 'hymnId', ls.hymn_id,
        'coverAsset', case when cover.id is null then null else jsonb_build_object('id', cover.id, 'provider', cover.provider, 'bucket', cover.bucket, 'path', cover.path, 'mimeType', cover.mime_type, 'fileSizeBytes', cover.file_size_bytes, 'checksum', cover.checksum) end
      ) order by ls.created_at desc)
      from learning.lesson_sets ls
      join learning.cantors c on c.id = ls.cantor_id and c.publication_status = 'published'
      left join learning.cantor_localizations cl on cl.cantor_id = c.id and cl.locale = p_locale
      left join learning.lesson_set_localizations lsl on lsl.lesson_set_id = ls.id and lsl.locale = p_locale
      left join media.media_assets cover on cover.id = ls.cover_asset_id and cover.publication_status = 'published'
      where ls.season_id = s.id and ls.publication_status = 'published'
    ), '[]'::jsonb)
  )
  from learning.seasons s
  left join learning.season_localizations sl on sl.season_id = s.id and sl.locale = p_locale
  where s.id = p_season_id and s.publication_status = 'published';
$$;

create or replace function public.set_learning_item_progress(
  p_item_kind learning.playlist_item_kind,
  p_item_id uuid,
  p_state learning.progress_state
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_row learning.item_progress%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_item_kind = 'album_recording' then
    if not exists (select 1 from learning.album_recordings r join learning.albums a on a.id = r.album_id where r.id = p_item_id and r.publication_status = 'published' and a.publication_status = 'published') then raise exception 'Published recording not found'; end if;
    select * into v_row from learning.item_progress where user_id = auth.uid() and album_recording_id = p_item_id for update;
  else
    if not exists (select 1 from learning.lessons l join learning.lesson_sets s on s.id = l.lesson_set_id where l.id = p_item_id and l.publication_status = 'published' and s.publication_status = 'published') then raise exception 'Published lesson not found'; end if;
    select * into v_row from learning.item_progress where user_id = auth.uid() and lesson_id = p_item_id for update;
  end if;

  if v_row.id is null then
    insert into learning.item_progress(user_id, item_kind, album_recording_id, lesson_id, state, started_at, finished_at)
    values (auth.uid(), p_item_kind, case when p_item_kind='album_recording' then p_item_id end, case when p_item_kind='lesson' then p_item_id end, p_state,
      case when p_state in ('learning','finished') then now() end, case when p_state='finished' then now() end)
    returning * into v_row;
  else
    update learning.item_progress set state = p_state,
      started_at = case when p_state='will_learn' then null else coalesce(started_at, now()) end,
      finished_at = case when p_state='finished' then now() else null end
    where id = v_row.id returning * into v_row;
  end if;
  return jsonb_build_object('id', v_row.id, 'itemKind', v_row.item_kind, 'itemId', coalesce(v_row.album_recording_id, v_row.lesson_id), 'state', v_row.state, 'updatedAt', v_row.updated_at);
end;
$$;

create or replace function public.set_learning_item_liked(
  p_item_kind learning.playlist_item_kind,
  p_item_id uuid,
  p_liked boolean
)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_liked then
    if p_item_kind='album_recording' then
      insert into learning.item_likes(user_id,item_kind,album_recording_id) values(auth.uid(),p_item_kind,p_item_id) on conflict do nothing;
    else
      insert into learning.item_likes(user_id,item_kind,lesson_id) values(auth.uid(),p_item_kind,p_item_id) on conflict do nothing;
    end if;
  else
    delete from learning.item_likes where user_id=auth.uid() and item_kind=p_item_kind and coalesce(album_recording_id,lesson_id)=p_item_id;
  end if;
  return p_liked;
end;
$$;

create or replace function public.get_my_learning_items(p_locale text default 'en')
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'authenticated', auth.uid() is not null,
    'likedItemIds', coalesce((select jsonb_agg(coalesce(l.album_recording_id,l.lesson_id)) from learning.item_likes l where l.user_id=auth.uid()), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(payload order by updated_at desc)
      from (
        select ip.updated_at, jsonb_build_object(
          'progressId', ip.id, 'itemKind', ip.item_kind, 'itemId', r.id, 'state', ip.state,
          'title', coalesce(rl.title,r.title), 'subtitle', coalesce(rl.subtitle,r.subtitle), 'mediaType', 'audio',
          'durationMs', coalesce(r.duration_ms,ma.duration_ms), 'containerId', a.id, 'containerTitle', coalesce(al.title,a.title),
          'cantorId', c.id, 'cantorName', coalesce(cl.display_name,c.display_name), 'hymnId', r.hymn_id,
          'mediaAsset', jsonb_build_object('id',ma.id,'provider',ma.provider,'bucket',ma.bucket,'path',ma.path,'mimeType',ma.mime_type,'durationMs',ma.duration_ms,'fileSizeBytes',ma.file_size_bytes,'checksum',ma.checksum),
          'coverAsset', case when cover.id is null then null else jsonb_build_object('id',cover.id,'provider',cover.provider,'bucket',cover.bucket,'path',cover.path,'mimeType',cover.mime_type,'fileSizeBytes',cover.file_size_bytes,'checksum',cover.checksum) end
        ) payload
        from learning.item_progress ip
        join learning.album_recordings r on r.id=ip.album_recording_id and r.publication_status='published'
        join learning.albums a on a.id=r.album_id and a.publication_status='published'
        join learning.cantors c on c.id=a.cantor_id and c.publication_status='published'
        join media.media_assets ma on ma.id=r.media_asset_id and ma.publication_status='published'
        left join learning.recording_localizations rl on rl.recording_id=r.id and rl.locale=p_locale
        left join learning.album_localizations al on al.album_id=a.id and al.locale=p_locale
        left join learning.cantor_localizations cl on cl.cantor_id=c.id and cl.locale=p_locale
        left join media.media_assets cover on cover.id=a.cover_asset_id and cover.publication_status='published'
        where ip.user_id=auth.uid() and ip.item_kind='album_recording'
        union all
        select ip.updated_at, jsonb_build_object(
          'progressId', ip.id, 'itemKind', ip.item_kind, 'itemId', l.id, 'state', ip.state,
          'title', case when p_locale='ar' then 'الدرس '||(l.sort_order+1)::text else 'Lesson '||(l.sort_order+1)::text end,
          'subtitle', coalesce(ll.description,l.description), 'mediaType', l.media_type,
          'durationMs', coalesce(l.duration_ms,ma.duration_ms), 'containerId', s.id, 'containerTitle', coalesce(sl.title,s.title),
          'cantorId', c.id, 'cantorName', coalesce(cl.display_name,c.display_name), 'hymnId', s.hymn_id,
          'mediaAsset', jsonb_build_object('id',ma.id,'provider',ma.provider,'bucket',ma.bucket,'path',ma.path,'mimeType',ma.mime_type,'durationMs',ma.duration_ms,'fileSizeBytes',ma.file_size_bytes,'checksum',ma.checksum),
          'coverAsset', case when cover.id is null then null else jsonb_build_object('id',cover.id,'provider',cover.provider,'bucket',cover.bucket,'path',cover.path,'mimeType',cover.mime_type,'fileSizeBytes',cover.file_size_bytes,'checksum',cover.checksum) end
        ) payload
        from learning.item_progress ip
        join learning.lessons l on l.id=ip.lesson_id and l.publication_status='published'
        join learning.lesson_sets s on s.id=l.lesson_set_id and s.publication_status='published'
        join learning.cantors c on c.id=s.cantor_id and c.publication_status='published'
        join media.media_assets ma on ma.id=l.media_asset_id and ma.publication_status='published'
        left join learning.lesson_localizations ll on ll.lesson_id=l.id and ll.locale=p_locale
        left join learning.lesson_set_localizations sl on sl.lesson_set_id=s.id and sl.locale=p_locale
        left join learning.cantor_localizations cl on cl.cantor_id=c.id and cl.locale=p_locale
        left join media.media_assets cover on cover.id=s.cover_asset_id and cover.publication_status='published'
        where ip.user_id=auth.uid() and ip.item_kind='lesson'
      ) library_items
    ), '[]'::jsonb)
  );
$$;

create or replace function public.update_learning_playlist(
  p_playlist_id uuid,
  p_name text,
  p_description text default null,
  p_visibility learning.playlist_visibility default 'private'
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if length(trim(coalesce(p_name,'')))=0 then raise exception 'Playlist name is required'; end if;
  update learning.playlists set name=trim(p_name), description=nullif(trim(coalesce(p_description,'')),''), visibility=p_visibility
  where id=p_playlist_id and owner_user_id=auth.uid();
  if not found then raise exception 'Playlist not found' using errcode='42501'; end if;
  return public.get_learning_playlist(p_playlist_id,'en');
end; $$;

create or replace function public.delete_learning_playlist(p_playlist_id uuid)
returns boolean language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  delete from learning.playlists where id=p_playlist_id and owner_user_id=auth.uid();
  return found;
end; $$;

create or replace function public.get_published_learning_item_lyrics(
  p_item_kind learning.playlist_item_kind,
  p_item_id uuid,
  p_locale text default null
)
returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
  select jsonb_build_object(
    'itemKind',p_item_kind,'itemId',p_item_id,
    'lyricSets',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'itemKind',s.item_kind,'itemId',coalesce(s.album_recording_id,s.lesson_id),
        'locale',s.locale,'kind','original','syncPrecision',s.sync_precision,'description',s.description,
        'publicationStatus',s.publication_status,
        'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'sequence',l.sequence,'startMs',l.start_ms,'endMs',l.end_ms,'text',l.text,'words','[]'::jsonb) order by l.sequence) from learning.lyric_lines l where l.lyric_set_id=s.id),'[]'::jsonb)
      ) order by s.locale)
      from learning.lyric_sets s
      where s.item_kind=p_item_kind and coalesce(s.album_recording_id,s.lesson_id)=p_item_id
        and s.publication_status='published' and (p_locale is null or s.locale=p_locale)
    ),'[]'::jsonb)
  )
  where (p_item_kind='album_recording' and exists(select 1 from learning.album_recordings r join learning.albums a on a.id=r.album_id where r.id=p_item_id and r.publication_status='published' and a.publication_status='published'))
     or (p_item_kind='lesson' and exists(select 1 from learning.lessons l join learning.lesson_sets s on s.id=l.lesson_set_id where l.id=p_item_id and l.publication_status='published' and s.publication_status='published'));
$$;

revoke all on function public.set_learning_item_progress(learning.playlist_item_kind,uuid,learning.progress_state) from public,anon;
revoke all on function public.set_learning_item_liked(learning.playlist_item_kind,uuid,boolean) from public,anon;
revoke all on function public.get_my_learning_items(text) from public,anon;
revoke all on function public.update_learning_playlist(uuid,text,text,learning.playlist_visibility) from public,anon;
revoke all on function public.delete_learning_playlist(uuid) from public,anon;
revoke all on function public.get_published_learning_item_lyrics(learning.playlist_item_kind,uuid,text) from public;
grant execute on function public.set_learning_item_progress(learning.playlist_item_kind,uuid,learning.progress_state) to authenticated;
grant execute on function public.set_learning_item_liked(learning.playlist_item_kind,uuid,boolean) to authenticated;
grant execute on function public.get_my_learning_items(text) to authenticated;
grant execute on function public.update_learning_playlist(uuid,text,text,learning.playlist_visibility) to authenticated;
grant execute on function public.delete_learning_playlist(uuid) to authenticated;
grant execute on function public.get_published_learning_item_lyrics(learning.playlist_item_kind,uuid,text) to anon,authenticated;

grant execute on function public.get_published_learning_album(uuid,text) to anon,authenticated;
grant execute on function public.get_published_learning_lesson_set(uuid,text) to anon,authenticated;
grant execute on function public.get_published_learning_season(uuid,text) to anon,authenticated;
