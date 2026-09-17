do $$
begin
  create type music.lyric_kind as enum ('original', 'translation', 'transliteration');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type music.lyric_sync_precision as enum ('unsynced', 'line', 'word');
exception when duplicate_object then null;
end $$;

grant usage on type music.lyric_kind to anon, authenticated;
grant usage on type music.lyric_sync_precision to anon, authenticated;

create table if not exists music.lyric_sets (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references music.tracks(id) on delete cascade,
  locale text not null references media.locales(code),
  kind music.lyric_kind not null,
  sync_precision music.lyric_sync_precision not null default 'line',
  title text,
  source text,
  publication_status media.publication_status not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lyric_sets_title_not_blank check (title is null or length(trim(title)) > 0),
  constraint lyric_sets_source_not_blank check (source is null or length(trim(source)) > 0),
  constraint lyric_sets_published_requires_sync check (
    publication_status <> 'published'::media.publication_status
    or sync_precision <> 'unsynced'::music.lyric_sync_precision
  ),
  unique (track_id, locale, kind)
);

create table if not exists music.lyric_lines (
  id uuid primary key default gen_random_uuid(),
  lyric_set_id uuid not null references music.lyric_sets(id) on delete cascade,
  sequence integer not null,
  start_ms bigint,
  end_ms bigint,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lyric_lines_sequence_positive check (sequence > 0),
  constraint lyric_lines_text_not_blank check (length(trim(text)) > 0),
  constraint lyric_lines_start_nonnegative check (start_ms is null or start_ms >= 0),
  constraint lyric_lines_end_nonnegative check (end_ms is null or end_ms >= 0),
  constraint lyric_lines_end_requires_start check (end_ms is null or start_ms is not null),
  constraint lyric_lines_end_after_start check (end_ms is null or end_ms >= start_ms),
  unique (lyric_set_id, sequence)
);

create table if not exists music.lyric_words (
  id uuid primary key default gen_random_uuid(),
  lyric_line_id uuid not null references music.lyric_lines(id) on delete cascade,
  sequence integer not null,
  start_ms bigint,
  end_ms bigint,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lyric_words_sequence_positive check (sequence > 0),
  constraint lyric_words_text_not_blank check (length(trim(text)) > 0),
  constraint lyric_words_start_nonnegative check (start_ms is null or start_ms >= 0),
  constraint lyric_words_end_nonnegative check (end_ms is null or end_ms >= 0),
  constraint lyric_words_end_requires_start check (end_ms is null or start_ms is not null),
  constraint lyric_words_end_after_start check (end_ms is null or end_ms >= start_ms),
  unique (lyric_line_id, sequence)
);

create index if not exists lyric_sets_track_idx
  on music.lyric_sets(track_id, publication_status);

create index if not exists lyric_sets_locale_idx
  on music.lyric_sets(locale);

create index if not exists lyric_sets_created_by_idx
  on music.lyric_sets(created_by)
  where created_by is not null;

create index if not exists lyric_sets_updated_by_idx
  on music.lyric_sets(updated_by)
  where updated_by is not null;

create index if not exists lyric_lines_set_sequence_idx
  on music.lyric_lines(lyric_set_id, sequence);

create index if not exists lyric_lines_set_time_idx
  on music.lyric_lines(lyric_set_id, start_ms, end_ms)
  where start_ms is not null;

create index if not exists lyric_words_line_sequence_idx
  on music.lyric_words(lyric_line_id, sequence);

create index if not exists lyric_words_line_time_idx
  on music.lyric_words(lyric_line_id, start_ms, end_ms)
  where start_ms is not null;

drop trigger if exists lyric_sets_set_updated_at on music.lyric_sets;
create trigger lyric_sets_set_updated_at
before update on music.lyric_sets
for each row execute function private.set_updated_at();

drop trigger if exists lyric_lines_set_updated_at on music.lyric_lines;
create trigger lyric_lines_set_updated_at
before update on music.lyric_lines
for each row execute function private.set_updated_at();

drop trigger if exists lyric_words_set_updated_at on music.lyric_words;
create trigger lyric_words_set_updated_at
before update on music.lyric_words
for each row execute function private.set_updated_at();

alter table music.lyric_sets enable row level security;
alter table music.lyric_lines enable row level security;
alter table music.lyric_words enable row level security;

grant select on table
  music.lyric_sets,
  music.lyric_lines,
  music.lyric_words
to anon, authenticated;

grant insert, update, delete on table
  music.lyric_sets,
  music.lyric_lines,
  music.lyric_words
to authenticated;

grant all on table
  music.lyric_sets,
  music.lyric_lines,
  music.lyric_words
to service_role;

create or replace function private.music_lyric_set_is_visible(p_lyric_set_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.lyric_sets lyric_set
    join music.tracks track on track.id = lyric_set.track_id
    where lyric_set.id = p_lyric_set_id
      and (
        (
          lyric_set.publication_status = 'published'::media.publication_status
          and track.publication_status = 'published'::media.publication_status
        )
        or (select private.can_read_media_owner(track.owner_creator_account_id))
      )
  );
$$;

create or replace function private.music_lyric_set_is_editable(p_lyric_set_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.lyric_sets lyric_set
    join music.tracks track on track.id = lyric_set.track_id
    where lyric_set.id = p_lyric_set_id
      and (select private.can_edit_creator_account(track.owner_creator_account_id))
  );
$$;

create or replace function private.music_lyric_set_is_mutable(p_lyric_set_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.lyric_sets lyric_set
    join music.tracks track on track.id = lyric_set.track_id
    where lyric_set.id = p_lyric_set_id
      and (select private.can_edit_creator_account(track.owner_creator_account_id))
      and (select private.music_publication_is_creator_mutable(lyric_set.publication_status))
  );
$$;

create or replace function private.music_lyric_line_is_visible(p_lyric_line_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.lyric_lines lyric_line
    where lyric_line.id = p_lyric_line_id
      and (select private.music_lyric_set_is_visible(lyric_line.lyric_set_id))
  );
$$;

create or replace function private.music_lyric_line_is_mutable(p_lyric_line_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from music.lyric_lines lyric_line
    where lyric_line.id = p_lyric_line_id
      and (select private.music_lyric_set_is_mutable(lyric_line.lyric_set_id))
  );
$$;

revoke all on function private.music_lyric_set_is_visible(uuid) from public;
revoke all on function private.music_lyric_set_is_editable(uuid) from public;
revoke all on function private.music_lyric_set_is_mutable(uuid) from public;
revoke all on function private.music_lyric_line_is_visible(uuid) from public;
revoke all on function private.music_lyric_line_is_mutable(uuid) from public;

grant execute on function private.music_lyric_set_is_visible(uuid) to anon, authenticated;
grant execute on function private.music_lyric_set_is_editable(uuid) to authenticated;
grant execute on function private.music_lyric_set_is_mutable(uuid) to authenticated;
grant execute on function private.music_lyric_line_is_visible(uuid) to anon, authenticated;
grant execute on function private.music_lyric_line_is_mutable(uuid) to authenticated;

create policy "lyric_sets_select_visible"
on music.lyric_sets for select
to anon, authenticated
using ((select private.music_lyric_set_is_visible(id)));

create policy "lyric_sets_insert_editable_track"
on music.lyric_sets for insert
to authenticated
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "lyric_sets_update_editable_track"
on music.lyric_sets for update
to authenticated
using ((select private.music_lyric_set_is_editable(id)))
with check (
  (select private.music_track_is_editable(track_id))
  and (select private.music_publication_is_creator_mutable(publication_status))
);

create policy "lyric_sets_delete_mutable"
on music.lyric_sets for delete
to authenticated
using ((select private.music_lyric_set_is_mutable(id)));

create policy "lyric_lines_select_visible_set"
on music.lyric_lines for select
to anon, authenticated
using ((select private.music_lyric_set_is_visible(lyric_set_id)));

create policy "lyric_lines_insert_mutable_set"
on music.lyric_lines for insert
to authenticated
with check ((select private.music_lyric_set_is_mutable(lyric_set_id)));

create policy "lyric_lines_update_mutable_set"
on music.lyric_lines for update
to authenticated
using ((select private.music_lyric_set_is_mutable(lyric_set_id)))
with check ((select private.music_lyric_set_is_mutable(lyric_set_id)));

create policy "lyric_lines_delete_mutable_set"
on music.lyric_lines for delete
to authenticated
using ((select private.music_lyric_set_is_mutable(lyric_set_id)));

create policy "lyric_words_select_visible_line"
on music.lyric_words for select
to anon, authenticated
using ((select private.music_lyric_line_is_visible(lyric_line_id)));

create policy "lyric_words_insert_mutable_line"
on music.lyric_words for insert
to authenticated
with check ((select private.music_lyric_line_is_mutable(lyric_line_id)));

create policy "lyric_words_update_mutable_line"
on music.lyric_words for update
to authenticated
using ((select private.music_lyric_line_is_mutable(lyric_line_id)))
with check ((select private.music_lyric_line_is_mutable(lyric_line_id)));

create policy "lyric_words_delete_mutable_line"
on music.lyric_words for delete
to authenticated
using ((select private.music_lyric_line_is_mutable(lyric_line_id)));

create or replace function public.publish_track_lyric_set(p_lyric_set_id uuid)
returns table (
  lyric_set_id uuid,
  status media.publication_status,
  line_count integer,
  sync_precision music.lyric_sync_precision
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  lyric_set_record music.lyric_sets%rowtype;
  track_status media.publication_status;
  invalid_line_count integer := 0;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into lyric_set_record
  from music.lyric_sets lyric_set
  where lyric_set.id = p_lyric_set_id
  for update;

  if not found then
    raise exception 'Lyric set not found' using errcode = 'P0002';
  end if;

  select track.publication_status
  into track_status
  from music.tracks track
  where track.id = lyric_set_record.track_id;

  if track_status <> 'published'::media.publication_status then
    raise exception 'Lyric set track must be published first' using errcode = '22023';
  end if;

  select count(*)::integer
  into line_count
  from music.lyric_lines lyric_line
  where lyric_line.lyric_set_id = lyric_set_record.id;

  if line_count = 0 then
    raise exception 'Lyric set must contain at least one line' using errcode = '22023';
  end if;

  if lyric_set_record.sync_precision in (
    'line'::music.lyric_sync_precision,
    'word'::music.lyric_sync_precision
  ) then
    select count(*)::integer
    into invalid_line_count
    from music.lyric_lines lyric_line
    where lyric_line.lyric_set_id = lyric_set_record.id
      and lyric_line.start_ms is null;

    if invalid_line_count > 0 then
      raise exception 'Line-synchronized lyric sets require every line to have start_ms' using errcode = '22023';
    end if;

    select count(*)::integer
    into invalid_line_count
    from (
      select
        lyric_line.start_ms,
        lag(lyric_line.start_ms) over (order by lyric_line.sequence) as previous_start_ms
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set_record.id
    ) ordered_line
    where ordered_line.previous_start_ms is not null
      and ordered_line.start_ms < ordered_line.previous_start_ms;

    if invalid_line_count > 0 then
      raise exception 'Lyric line start_ms values must be ordered by sequence' using errcode = '22023';
    end if;

    select count(*)::integer
    into invalid_line_count
    from (
      select
        lyric_line.end_ms,
        lead(lyric_line.start_ms) over (order by lyric_line.sequence) as next_start_ms
      from music.lyric_lines lyric_line
      where lyric_line.lyric_set_id = lyric_set_record.id
    ) ordered_line
    where ordered_line.end_ms is not null
      and ordered_line.next_start_ms is not null
      and ordered_line.end_ms > ordered_line.next_start_ms;

    if invalid_line_count > 0 then
      raise exception 'Lyric line end_ms values must not overlap the next line start_ms' using errcode = '22023';
    end if;
  end if;

  update music.lyric_sets lyric_set
  set publication_status = 'published'::media.publication_status,
      updated_by = request_user_id,
      updated_at = now()
  where lyric_set.id = lyric_set_record.id
  returning * into lyric_set_record;

  return query
  select
    lyric_set_record.id,
    lyric_set_record.publication_status,
    line_count,
    lyric_set_record.sync_precision;
end;
$$;

create or replace function public.get_published_track_lyrics(
  p_track_id uuid,
  p_locale text default null,
  p_kind music.lyric_kind default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'trackId', track.id,
    'lyricSets', coalesce((
      select jsonb_agg(lyric_set_row.payload order by lyric_set_row.locale, lyric_set_row.kind)
      from (
        select
          lyric_set.locale,
          lyric_set.kind,
          jsonb_build_object(
            'id', lyric_set.id,
            'trackId', lyric_set.track_id,
            'locale', lyric_set.locale,
            'kind', lyric_set.kind,
            'syncPrecision', lyric_set.sync_precision,
            'title', lyric_set.title,
            'source', lyric_set.source,
            'publicationStatus', lyric_set.publication_status,
            'lines', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', lyric_line.id,
                  'sequence', lyric_line.sequence,
                  'startMs', lyric_line.start_ms,
                  'endMs', lyric_line.end_ms,
                  'text', lyric_line.text,
                  'words', coalesce((
                    select jsonb_agg(
                      jsonb_build_object(
                        'id', lyric_word.id,
                        'sequence', lyric_word.sequence,
                        'startMs', lyric_word.start_ms,
                        'endMs', lyric_word.end_ms,
                        'text', lyric_word.text
                      )
                      order by lyric_word.sequence
                    )
                    from music.lyric_words lyric_word
                    where lyric_word.lyric_line_id = lyric_line.id
                  ), '[]'::jsonb)
                )
                order by lyric_line.sequence
              )
              from music.lyric_lines lyric_line
              where lyric_line.lyric_set_id = lyric_set.id
            ), '[]'::jsonb)
          ) as payload
        from music.lyric_sets lyric_set
        where lyric_set.track_id = track.id
          and lyric_set.publication_status = 'published'::media.publication_status
          and (p_locale is null or lyric_set.locale = p_locale)
          and (p_kind is null or lyric_set.kind = p_kind)
      ) lyric_set_row
    ), '[]'::jsonb)
  )
  from music.tracks track
  where track.id = p_track_id
    and track.publication_status = 'published'::media.publication_status;
$$;

revoke all on function public.publish_track_lyric_set(uuid) from public;
revoke all on function public.get_published_track_lyrics(uuid, text, music.lyric_kind) from public;

grant execute on function public.publish_track_lyric_set(uuid) to authenticated;
grant execute on function public.get_published_track_lyrics(uuid, text, music.lyric_kind) to anon, authenticated;
