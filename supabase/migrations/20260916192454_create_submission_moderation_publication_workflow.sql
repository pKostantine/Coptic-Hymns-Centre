do $$
begin
  create type media.submission_type as enum (
    'music_release',
    'learning_album',
    'learning_lesson_set',
    'artist_update',
    'cantor_update'
  );
exception when duplicate_object then null;
end $$;

create table if not exists media.submissions (
  id uuid primary key default gen_random_uuid(),
  creator_account_id uuid not null references creator.creator_accounts(id) on delete cascade,
  submission_type media.submission_type not null,
  title text not null,
  description text,
  status media.publication_status not null default 'draft',
  submitted_at timestamptz,
  review_due_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  approved_at timestamptz,
  published_at timestamptz,
  rejected_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submissions_title_not_blank check (length(trim(title)) > 0),
  constraint submissions_status_valid check (
    status in (
      'draft'::media.publication_status,
      'uploading'::media.publication_status,
      'ready_to_submit'::media.publication_status,
      'pending_review'::media.publication_status,
      'changes_requested'::media.publication_status,
      'approved'::media.publication_status,
      'processing'::media.publication_status,
      'published'::media.publication_status,
      'rejected'::media.publication_status
    )
  ),
  constraint submissions_review_due_requires_submit check (
    review_due_at is null or submitted_at is not null
  ),
  constraint submissions_reviewed_requires_reviewer check (
    reviewed_at is null or reviewer_id is not null
  )
);

create table if not exists media.submission_items (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references media.submissions(id) on delete cascade,
  upload_intent_id uuid references media.upload_intents(id) on delete restrict,
  media_asset_id uuid references media.media_assets(id) on delete restrict,
  media_processing_job_id uuid references media.media_processing_jobs(id) on delete set null,
  title text,
  sort_order integer not null default 0,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint submission_items_has_source check (
    upload_intent_id is not null or media_asset_id is not null
  ),
  constraint submission_items_title_not_blank check (
    title is null or length(trim(title)) > 0
  )
);

create table if not exists media.submission_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references media.submissions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  from_status media.publication_status,
  to_status media.publication_status,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint submission_events_action_not_blank check (length(trim(action)) > 0)
);

create index if not exists submissions_creator_status_idx
  on media.submissions(creator_account_id, status, created_at desc);

create index if not exists submissions_review_queue_idx
  on media.submissions(status, review_due_at, submitted_at)
  where status = 'pending_review'::media.publication_status;

create index if not exists submissions_reviewer_idx
  on media.submissions(reviewer_id, reviewed_at desc)
  where reviewer_id is not null;

create index if not exists submission_items_submission_order_idx
  on media.submission_items(submission_id, sort_order, created_at);

create unique index if not exists submission_items_submission_upload_intent_idx
  on media.submission_items(submission_id, upload_intent_id)
  where upload_intent_id is not null;

create unique index if not exists submission_items_submission_media_asset_idx
  on media.submission_items(submission_id, media_asset_id)
  where media_asset_id is not null;

create index if not exists submission_items_processing_job_idx
  on media.submission_items(media_processing_job_id)
  where media_processing_job_id is not null;

create index if not exists submission_events_submission_created_idx
  on media.submission_events(submission_id, created_at);

create trigger submissions_set_updated_at
before update on media.submissions
for each row execute function private.set_updated_at();

create trigger submission_items_set_updated_at
before update on media.submission_items
for each row execute function private.set_updated_at();

alter table media.submissions enable row level security;
alter table media.submission_items enable row level security;
alter table media.submission_events enable row level security;

grant usage on type media.submission_type to anon, authenticated;
grant select on table media.submissions to authenticated;
grant select on table media.submission_items to authenticated;
grant select on table media.submission_events to authenticated;
grant all on table media.submissions to service_role;
grant all on table media.submission_items to service_role;
grant all on table media.submission_events to service_role;

create policy "submissions_select_creator_or_admin"
on media.submissions
for select
to authenticated
using ((select private.can_read_media_owner(creator_account_id)));

create policy "submission_items_select_submission_reader"
on media.submission_items
for select
to authenticated
using (
  exists (
    select 1
    from media.submissions submission
    where submission.id = submission_id
      and (select private.can_read_media_owner(submission.creator_account_id))
  )
);

create policy "submission_events_select_submission_reader"
on media.submission_events
for select
to authenticated
using (
  exists (
    select 1
    from media.submissions submission
    where submission.id = submission_id
      and (select private.can_read_media_owner(submission.creator_account_id))
  )
);

create or replace function private.add_media_submission_event(
  p_submission_id uuid,
  p_actor_id uuid,
  p_action text,
  p_from_status media.publication_status,
  p_to_status media.publication_status,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into media.submission_events (
    submission_id,
    actor_id,
    action,
    from_status,
    to_status,
    notes,
    metadata
  )
  values (
    p_submission_id,
    p_actor_id,
    trim(p_action),
    p_from_status,
    p_to_status,
    nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function private.attach_completed_submission_jobs(
  p_submission_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_count integer := 0;
begin
  with completed_jobs as (
    select
      item.id as item_id,
      job.id as processing_job_id,
      job.media_asset_id
    from media.submission_items item
    join media.media_processing_jobs job
      on job.upload_intent_id = item.upload_intent_id
     and job.job_type = 'audio_delivery'::media.processing_job_type
     and job.status = 'completed'::media.processing_job_status
     and job.media_asset_id is not null
    where item.submission_id = p_submission_id
  )
  update media.submission_items item
  set media_asset_id = coalesce(item.media_asset_id, completed_jobs.media_asset_id),
      media_processing_job_id = completed_jobs.processing_job_id
  from completed_jobs
  where item.id = completed_jobs.item_id
    and (
      item.media_asset_id is distinct from coalesce(item.media_asset_id, completed_jobs.media_asset_id)
      or item.media_processing_job_id is distinct from completed_jobs.processing_job_id
    );

  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;

create or replace function private.submission_required_items_ready(
  p_submission_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select
    exists (
      select 1
      from media.submission_items item
      where item.submission_id = p_submission_id
        and item.required
    )
    and not exists (
      select 1
      from media.submission_items item
      left join media.media_assets asset
        on asset.id = item.media_asset_id
       and asset.processing_status = 'completed'::media.processing_status
      where item.submission_id = p_submission_id
        and item.required
        and asset.id is null
    );
$$;

create or replace function public.create_media_submission(
  p_creator_account_id uuid,
  p_submission_type media.submission_type,
  p_title text,
  p_description text default null
)
returns table (
  submission_id uuid,
  status media.publication_status,
  review_due_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
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

  if not exists (
    select 1
    from creator.creator_accounts account
    where account.id = p_creator_account_id
      and account.status = 'active'::creator.creator_account_status
  ) then
    raise exception 'Creator account is not active' using errcode = '22023';
  end if;

  if p_title is null or length(trim(p_title)) = 0 then
    raise exception 'title is required' using errcode = '22023';
  end if;

  insert into media.submissions (
    creator_account_id,
    submission_type,
    title,
    description,
    status,
    created_by,
    updated_by
  )
  values (
    p_creator_account_id,
    p_submission_type,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    'draft'::media.publication_status,
    request_user_id,
    request_user_id
  )
  returning * into current_submission;

  perform private.add_media_submission_event(
    current_submission.id,
    request_user_id,
    'created',
    null,
    current_submission.status,
    null,
    jsonb_build_object('submissionType', current_submission.submission_type)
  );

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.review_due_at;
end;
$$;

create or replace function public.add_media_submission_item(
  p_submission_id uuid,
  p_upload_intent_id uuid default null,
  p_media_asset_id uuid default null,
  p_title text default null,
  p_sort_order integer default 0,
  p_required boolean default true
)
returns table (
  item_id uuid,
  submission_id uuid,
  upload_intent_id uuid,
  media_asset_id uuid,
  media_processing_job_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  source_intent media.upload_intents%rowtype;
  source_asset media.media_assets%rowtype;
  inserted_item media.submission_items%rowtype;
  previous_status media.publication_status;
  next_status media.publication_status;
  normalized_title text := nullif(trim(coalesce(p_title, '')), '');
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

  insert into media.submission_items (
    submission_id,
    upload_intent_id,
    media_asset_id,
    title,
    sort_order,
    required
  )
  values (
    current_submission.id,
    p_upload_intent_id,
    p_media_asset_id,
    normalized_title,
    coalesce(p_sort_order, 0),
    coalesce(p_required, true)
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
      'mediaAssetId', inserted_item.media_asset_id
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
$$;

create or replace function public.submit_media_submission(
  p_submission_id uuid
)
returns table (
  submission_id uuid,
  status media.publication_status,
  submitted_at timestamptz,
  review_due_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
  submission_time timestamptz := now();
begin
  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
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
    'ready_to_submit'::media.publication_status,
    'changes_requested'::media.publication_status
  ) then
    raise exception 'Submission cannot be submitted from its current status' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from media.submission_items item
    where item.submission_id = current_submission.id
  ) then
    raise exception 'Submission must have at least one item' using errcode = '22023';
  end if;

  if exists (
    select 1
    from media.submission_items item
    join media.upload_intents intent
      on intent.id = item.upload_intent_id
    where item.submission_id = current_submission.id
      and intent.status <> 'uploaded'::media.upload_intent_status
  ) then
    raise exception 'All upload items must be uploaded before submission' using errcode = '22023';
  end if;

  previous_status := current_submission.status;

  update media.submissions submission
  set status = 'pending_review'::media.publication_status,
      submitted_at = submission_time,
      review_due_at = submission_time + interval '48 hours',
      reviewer_id = null,
      reviewed_at = null,
      review_notes = null,
      rejected_at = null,
      updated_by = request_user_id
  where submission.id = current_submission.id
  returning * into current_submission;

  perform private.add_media_submission_event(
    current_submission.id,
    request_user_id,
    'submitted',
    previous_status,
    current_submission.status,
    null,
    jsonb_build_object('reviewDueAt', current_submission.review_due_at)
  );

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.submitted_at,
    current_submission.review_due_at;
end;
$$;

create or replace function public.review_media_submission(
  p_submission_id uuid,
  p_action text,
  p_notes text default null
)
returns table (
  submission_id uuid,
  status media.publication_status,
  review_due_at timestamptz,
  processing_jobs_queued integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_notes text := nullif(trim(coalesce(p_notes, '')), '');
  item_record record;
  queued_job_id uuid;
begin
  processing_jobs_queued := 0;

  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  if normalized_action not in ('approve', 'request_changes', 'reject') then
    raise exception 'Unsupported review action' using errcode = '22023';
  end if;

  if normalized_action = 'request_changes' and normalized_notes is null then
    raise exception 'Review notes are required when requesting changes' using errcode = '22023';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if current_submission.status <> 'pending_review'::media.publication_status then
    raise exception 'Submission is not pending review' using errcode = '22023';
  end if;

  previous_status := current_submission.status;

  if normalized_action = 'request_changes' then
    update media.submissions submission
    set status = 'changes_requested'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = null,
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'changes_requested',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );
  elsif normalized_action = 'reject' then
    update media.submissions submission
    set status = 'rejected'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        rejected_at = now(),
        approved_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'rejected',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );
  else
    if not exists (
      select 1
      from media.submission_items item
      where item.submission_id = current_submission.id
    ) then
      raise exception 'Submission must have at least one item' using errcode = '22023';
    end if;

    perform private.attach_completed_submission_jobs(current_submission.id);

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        reviewer_id = request_user_id,
        reviewed_at = now(),
        review_notes = normalized_notes,
        approved_at = now(),
        rejected_at = null,
        updated_by = request_user_id
    where submission.id = current_submission.id
    returning * into current_submission;

    perform private.add_media_submission_event(
      current_submission.id,
      request_user_id,
      'approved',
      previous_status,
      current_submission.status,
      normalized_notes,
      '{}'::jsonb
    );

    for item_record in
      select
        item.id,
        item.upload_intent_id
      from media.submission_items item
      left join media.media_assets asset
        on asset.id = item.media_asset_id
       and asset.processing_status = 'completed'::media.processing_status
      where item.submission_id = current_submission.id
        and item.required
        and asset.id is null
    loop
      if item_record.upload_intent_id is null then
        raise exception 'Required submission item has no processable upload' using errcode = '22023';
      end if;

      select result.job_id
      into queued_job_id
      from public.enqueue_media_processing_job(
        item_record.upload_intent_id,
        'audio_delivery'::media.processing_job_type,
        'chc-music'
      ) as result;

      processing_jobs_queued := processing_jobs_queued + 1;

      update media.submission_items item
      set media_processing_job_id = queued_job_id
      where item.id = item_record.id;
    end loop;

    perform private.attach_completed_submission_jobs(current_submission.id);

    if not (select private.submission_required_items_ready(current_submission.id)) then
      previous_status := current_submission.status;

      update media.submissions submission
      set status = 'processing'::media.publication_status,
          updated_by = request_user_id
      where submission.id = current_submission.id
      returning * into current_submission;

      perform private.add_media_submission_event(
        current_submission.id,
        request_user_id,
        'processing_started',
        previous_status,
        current_submission.status,
        null,
        jsonb_build_object('processingJobsQueued', processing_jobs_queued)
      );
    end if;
  end if;

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.review_due_at,
    processing_jobs_queued;
end;
$$;

create or replace function public.publish_media_submission(
  p_submission_id uuid
)
returns table (
  submission_id uuid,
  status media.publication_status,
  published_at timestamptz,
  published_asset_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
  current_submission media.submissions%rowtype;
  previous_status media.publication_status;
begin
  published_asset_count := 0;

  if request_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.is_admin()) then
    raise exception 'Admin role required' using errcode = '42501';
  end if;

  select *
  into current_submission
  from media.submissions submission
  where submission.id = p_submission_id
  for update;

  if not found then
    raise exception 'Submission not found' using errcode = 'P0002';
  end if;

  if current_submission.status not in (
    'approved'::media.publication_status,
    'processing'::media.publication_status
  ) then
    raise exception 'Submission is not approved or processing' using errcode = '22023';
  end if;

  perform private.attach_completed_submission_jobs(current_submission.id);

  if not (select private.submission_required_items_ready(current_submission.id)) then
    raise exception 'Submission still has required items waiting for processing' using errcode = '22023';
  end if;

  previous_status := current_submission.status;

  with published_assets as (
    update media.media_assets asset
    set publication_status = 'published'::media.publication_status,
        updated_by = request_user_id,
        updated_at = now()
    from (
      select distinct item.media_asset_id
      from media.submission_items item
      where item.submission_id = current_submission.id
        and item.media_asset_id is not null
    ) asset_to_publish
    where asset.id = asset_to_publish.media_asset_id
    returning asset.id
  )
  select count(*)::integer
  into published_asset_count
  from published_assets;

  update media.submissions submission
  set status = 'published'::media.publication_status,
      published_at = now(),
      updated_by = request_user_id
  where submission.id = current_submission.id
  returning * into current_submission;

  perform private.add_media_submission_event(
    current_submission.id,
    request_user_id,
    'published',
    previous_status,
    current_submission.status,
    null,
    jsonb_build_object('publishedAssetCount', published_asset_count)
  );

  return query
  select
    current_submission.id,
    current_submission.status,
    current_submission.published_at,
    published_asset_count;
end;
$$;

revoke all on function private.add_media_submission_event(uuid, uuid, text, media.publication_status, media.publication_status, text, jsonb) from public;
revoke all on function private.attach_completed_submission_jobs(uuid) from public;
revoke all on function private.submission_required_items_ready(uuid) from public;
revoke all on function public.create_media_submission(uuid, media.submission_type, text, text) from public;
revoke all on function public.add_media_submission_item(uuid, uuid, uuid, text, integer, boolean) from public;
revoke all on function public.submit_media_submission(uuid) from public;
revoke all on function public.review_media_submission(uuid, text, text) from public;
revoke all on function public.publish_media_submission(uuid) from public;

grant execute on function public.create_media_submission(uuid, media.submission_type, text, text) to authenticated;
grant execute on function public.add_media_submission_item(uuid, uuid, uuid, text, integer, boolean) to authenticated;
grant execute on function public.submit_media_submission(uuid) to authenticated;
grant execute on function public.review_media_submission(uuid, text, text) to authenticated;
grant execute on function public.publish_media_submission(uuid) to authenticated;
