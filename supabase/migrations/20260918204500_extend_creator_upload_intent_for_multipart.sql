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
    now() + interval '6 hours'
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

revoke all on function public.create_media_upload_intent(uuid, text, text, bigint, media.media_type, text)
from public, anon;
grant execute on function public.create_media_upload_intent(uuid, text, text, bigint, media.media_type, text)
to authenticated;
