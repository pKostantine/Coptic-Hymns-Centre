-- Takes the item's role. Dropped rather than replaced because adding a
-- defaulted parameter would leave the old six-argument version in place and
-- make every existing six-argument call ambiguous.
drop function if exists public.add_media_submission_item(uuid, uuid, uuid, text, integer, boolean);

create or replace function public.add_media_submission_item(
  p_submission_id uuid,
  p_upload_intent_id uuid default null::uuid,
  p_media_asset_id uuid default null::uuid,
  p_title text default null::text,
  p_sort_order integer default 0,
  p_required boolean default true,
  p_role media.submission_item_role default null
)
returns table(item_id uuid, submission_id uuid, upload_intent_id uuid, media_asset_id uuid, media_processing_job_id uuid)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  source_intent media.upload_intents%rowtype;
  source_asset media.media_assets%rowtype;
  inserted_item media.submission_items%rowtype;
  previous_status media.publication_status;
  next_status media.publication_status;
  normalized_title text := nullif(trim(coalesce(p_title, '')), '');
  resolved_role media.submission_item_role;
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if (p_upload_intent_id is null and p_media_asset_id is null)
    or (p_upload_intent_id is not null and p_media_asset_id is not null) then
    raise exception 'Provide exactly one upload intent or media asset' using errcode = '22023';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if not (select private.can_edit_creator_account(current_submission.creator_account_id)) then
    raise exception 'Not authorized for submission' using errcode = '42501';
  end if;

  if current_submission.status not in (
    'draft'::media.publication_status,
    'uploading'::media.publication_status,
    'ready_to_submit'::media.publication_status,
    'changes_requested'::media.publication_status
  ) then
    raise exception 'Submission is not editable' using errcode = '22023';
  end if;

  if p_upload_intent_id is not null then
    select *
    into source_intent
    from media.upload_intents intent
    where intent.id = p_upload_intent_id;

    if not found then
      raise exception 'Upload intent not found' using errcode = 'P0002';
    end if;

    if source_intent.creator_account_id <> current_submission.creator_account_id then
      raise exception 'Upload intent belongs to a different creator account' using errcode = '42501';
    end if;

    if source_intent.status <> 'uploaded'::media.upload_intent_status then
      raise exception 'Upload intent must be uploaded before submission' using errcode = '22023';
    end if;

    normalized_title := coalesce(normalized_title, source_intent.original_filename);
  end if;

  if p_media_asset_id is not null then
    select *
    into source_asset
    from media.media_assets asset
    where asset.id = p_media_asset_id;

    if not found then
      raise exception 'Media asset not found' using errcode = 'P0002';
    end if;

    if source_asset.owner_creator_account_id <> current_submission.creator_account_id then
      raise exception 'Media asset belongs to a different creator account' using errcode = '42501';
    end if;

    if source_asset.processing_status <> 'completed'::media.processing_status then
      raise exception 'Media asset is not processing-complete' using errcode = '22023';
    end if;

    normalized_title := coalesce(normalized_title, source_asset.path);
  end if;

  -- An explicit role wins. Otherwise an image is artwork whatever it is
  -- called, and anything else takes the shape of the submission it joins.
  resolved_role := coalesce(
    p_role,
    (case
      when source_intent.id is not null and source_intent.media_type = 'image'::media.media_type then 'artwork'
      when source_asset.id is not null and source_asset.media_type = 'image'::media.media_type then 'artwork'
      when current_submission.submission_type = 'music_release'::media.submission_type then 'track'
      when current_submission.submission_type in (
        'learning_album'::media.submission_type,
        'learning_lesson_set'::media.submission_type
      ) then 'lesson'
      else 'other'
    end)::media.submission_item_role
  );

  insert into media.submission_items (
    submission_id,
    upload_intent_id,
    media_asset_id,
    title,
    sort_order,
    required,
    role
  )
  values (
    current_submission.id,
    p_upload_intent_id,
    p_media_asset_id,
    normalized_title,
    coalesce(p_sort_order, 0),
    coalesce(p_required, true),
    resolved_role
  )
  returning * into inserted_item;

  previous_status := current_submission.status;
  next_status := case
    when current_submission.status = 'ready_to_submit'::media.publication_status then current_submission.status
    else 'ready_to_submit'::media.publication_status
  end;

  update media.submissions submission
  set status = next_status,
      updated_by = request_user_id
  where submission.id = current_submission.id;

  perform private.add_media_submission_event(
    current_submission.id,
    request_user_id,
    'item_added',
    previous_status,
    next_status,
    null,
    jsonb_build_object(
      'submissionItemId', inserted_item.id,
      'uploadIntentId', inserted_item.upload_intent_id,
      'mediaAssetId', inserted_item.media_asset_id,
      'role', inserted_item.role
    )
  );

  return query
  select
    inserted_item.id,
    inserted_item.submission_id,
    inserted_item.upload_intent_id,
    inserted_item.media_asset_id,
    inserted_item.media_processing_job_id;
end;
$function$;

grant execute on function public.add_media_submission_item(uuid, uuid, uuid, text, integer, boolean, media.submission_item_role) to authenticated;
