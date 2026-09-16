do $$
begin
  create type media.upload_intent_status as enum (
    'authorized',
    'uploaded',
    'failed',
    'expired',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

create table if not exists media.upload_intents (
  id uuid primary key default gen_random_uuid(),
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'chc-submissions',
  path text not null,
  media_type media.media_type not null,
  original_filename text not null,
  content_type text not null,
  content_length bigint not null,
  checksum_sha256 text,
  status media.upload_intent_status not null default 'authorized',
  upload_expires_at timestamptz not null,
  uploaded_size bigint,
  r2_http_etag text,
  uploaded_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint upload_intents_bucket_private_submission check (bucket = 'chc-submissions'),
  constraint upload_intents_path_private_submission check (
    path ~ '^submissions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original(\\.[a-z0-9]{1,12})?$'
  ),
  constraint upload_intents_original_filename_not_blank check (length(trim(original_filename)) > 0),
  constraint upload_intents_content_type_not_blank check (length(trim(content_type)) > 0),
  constraint upload_intents_content_length_positive check (content_length > 0),
  constraint upload_intents_content_length_max check (content_length <= 21474836480),
  constraint upload_intents_uploaded_size_nonnegative check (uploaded_size is null or uploaded_size >= 0),
  constraint upload_intents_checksum_sha256_format check (
    checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'
  ),
  unique (bucket, path)
);

create index if not exists upload_intents_creator_status_idx
  on media.upload_intents(creator_account_id, status, created_at desc);

create index if not exists upload_intents_requested_by_idx
  on media.upload_intents(requested_by, created_at desc);

create index if not exists upload_intents_expires_idx
  on media.upload_intents(upload_expires_at)
  where status = 'authorized';

create trigger upload_intents_set_updated_at
before update on media.upload_intents
for each row execute function private.set_updated_at();

alter table media.upload_intents enable row level security;

grant select on table media.upload_intents to authenticated;
grant all on table media.upload_intents to service_role;

create policy "upload_intents_select_requester_or_creator"
on media.upload_intents
for select
to authenticated
using (
  requested_by = (select auth.uid())
  or (select private.can_read_media_owner(creator_account_id))
);

create or replace function private.upload_file_extension(filename text)
returns text
language plpgsql
set search_path = ''
immutable
as $$
declare
  matches text[];
begin
  matches := regexp_match(filename, '\.([A-Za-z0-9]{1,12})$');

  if matches is null then
    return '';
  end if;

  return '.' || lower(matches[1]);
end;
$$;

create or replace function public.create_media_upload_intent(
  p_creator_account_id uuid,
  p_original_filename text,
  p_content_type text,
  p_content_length bigint,
  p_media_type media.media_type default 'audio'::media.media_type,
  p_checksum_sha256 text default null
)
returns table (
  upload_intent_id uuid,
  bucket text,
  object_path text,
  expires_at timestamptz,
  content_type text,
  content_length bigint,
  media_type media.media_type
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  generated_upload_intent_id uuid := gen_random_uuid();
  generated_bucket text := 'chc-submissions';
  generated_path text;
  normalized_content_type text := lower(trim(p_content_type));
  normalized_checksum text := lower(trim(coalesce(p_checksum_sha256, '')));
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if p_creator_account_id is null then
    raise exception 'creator_account_id is required' using errcode = '22023';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  if p_original_filename is null or length(trim(p_original_filename)) = 0 then
    raise exception 'original_filename is required' using errcode = '22023';
  end if;

  if normalized_content_type !~ '^(audio|video|image)/[a-z0-9.+-]+$' then
    raise exception 'Unsupported content type' using errcode = '22023';
  end if;

  if p_content_length is null or p_content_length <= 0 or p_content_length > 21474836480 then
    raise exception 'Invalid content length' using errcode = '22023';
  end if;

  if normalized_checksum <> '' and normalized_checksum !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid sha256 checksum' using errcode = '22023';
  end if;

  generated_path :=
    'submissions/' ||
    p_creator_account_id::text ||
    '/' ||
    generated_upload_intent_id::text ||
    '/original' ||
    private.upload_file_extension(p_original_filename);

  insert into media.upload_intents (
    id,
    creator_account_id,
    requested_by,
    bucket,
    path,
    media_type,
    original_filename,
    content_type,
    content_length,
    checksum_sha256,
    status,
    upload_expires_at
  )
  values (
    generated_upload_intent_id,
    p_creator_account_id,
    request_user_id,
    generated_bucket,
    generated_path,
    p_media_type,
    trim(p_original_filename),
    normalized_content_type,
    p_content_length,
    nullif(normalized_checksum, ''),
    'authorized'::media.upload_intent_status,
    now() + interval '15 minutes'
  );

  return query
  select
    intent.id,
    intent.bucket,
    intent.path,
    intent.upload_expires_at,
    intent.content_type,
    intent.content_length,
    intent.media_type
  from media.upload_intents intent
  where intent.id = generated_upload_intent_id;
end;
$$;

create or replace function public.get_media_upload_intent_for_upload(
  p_upload_intent_id uuid
)
returns table (
  upload_intent_id uuid,
  creator_account_id uuid,
  bucket text,
  object_path text,
  content_type text,
  content_length bigint,
  media_type media.media_type,
  checksum_sha256 text,
  expires_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    intent.id,
    intent.creator_account_id,
    intent.bucket,
    intent.path,
    intent.content_type,
    intent.content_length,
    intent.media_type,
    intent.checksum_sha256,
    intent.upload_expires_at
  from media.upload_intents intent
  where intent.id = p_upload_intent_id
    and intent.requested_by = (select auth.uid())
    and intent.status = 'authorized'::media.upload_intent_status
    and intent.upload_expires_at > now()
    and (select private.can_edit_creator_account(intent.creator_account_id));
$$;

create or replace function public.complete_media_upload_intent(
  p_upload_intent_id uuid,
  p_uploaded_size bigint,
  p_r2_http_etag text
)
returns table (
  upload_intent_id uuid,
  status media.upload_intent_status,
  bucket text,
  object_path text,
  uploaded_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_intent media.upload_intents%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select *
  into existing_intent
  from media.upload_intents intent
  where intent.id = p_upload_intent_id
  for update;

  if not found then
    raise exception 'Upload intent not found' using errcode = 'P0002';
  end if;

  if existing_intent.requested_by <> (select auth.uid())
    or not (select private.can_edit_creator_account(existing_intent.creator_account_id)) then
    raise exception 'Not authorized for upload intent' using errcode = '42501';
  end if;

  if existing_intent.status <> 'authorized'::media.upload_intent_status then
    raise exception 'Upload intent is not authorized' using errcode = '22023';
  end if;

  if existing_intent.upload_expires_at <= now() then
    update media.upload_intents
    set status = 'expired'::media.upload_intent_status,
        failed_at = now(),
        error_message = 'Upload intent expired'
    where id = existing_intent.id;

    raise exception 'Upload intent expired' using errcode = '22023';
  end if;

  if p_uploaded_size <> existing_intent.content_length then
    update media.upload_intents
    set status = 'failed'::media.upload_intent_status,
        uploaded_size = p_uploaded_size,
        failed_at = now(),
        error_message = 'Uploaded size did not match authorized content length'
    where id = existing_intent.id;

    raise exception 'Uploaded size mismatch' using errcode = '22023';
  end if;

  update media.upload_intents
  set status = 'uploaded'::media.upload_intent_status,
      uploaded_size = p_uploaded_size,
      r2_http_etag = p_r2_http_etag,
      uploaded_at = now(),
      completed_at = now(),
      error_message = null
  where id = existing_intent.id;

  return query
  select
    intent.id,
    intent.status,
    intent.bucket,
    intent.path,
    intent.uploaded_at
  from media.upload_intents intent
  where intent.id = existing_intent.id;
end;
$$;

revoke all on function private.upload_file_extension(text) from public;
revoke all on function public.create_media_upload_intent(uuid, text, text, bigint, media.media_type, text) from public;
revoke all on function public.get_media_upload_intent_for_upload(uuid) from public;
revoke all on function public.complete_media_upload_intent(uuid, bigint, text) from public;

grant execute on function private.upload_file_extension(text) to service_role;
grant execute on function public.create_media_upload_intent(uuid, text, text, bigint, media.media_type, text) to authenticated;
grant execute on function public.get_media_upload_intent_for_upload(uuid) to authenticated;
grant execute on function public.complete_media_upload_intent(uuid, bigint, text) to authenticated;
