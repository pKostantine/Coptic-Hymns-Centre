-- Moves a submission out of `processing` on its own once every required item
-- has a completed asset, so nobody has to flip a status by hand between
-- "processing finished" and "publish".
create or replace function private.settle_submission_processing(p_upload_intent_id uuid)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  settled_count integer := 0;
  submission_record media.submissions%rowtype;
  target_submission_id uuid;
begin
  if p_upload_intent_id is null then
    return 0;
  end if;

  for target_submission_id in
    select distinct item.submission_id
    from media.submission_items item
    where item.upload_intent_id = p_upload_intent_id
  loop
    perform private.attach_completed_submission_jobs(target_submission_id);

    select *
    into submission_record
    from media.submissions submission
    where submission.id = target_submission_id
      and submission.status = 'processing'::media.publication_status
    for update;

    if not found then
      continue;
    end if;

    if not (select private.submission_required_items_ready(target_submission_id)) then
      continue;
    end if;

    update media.submissions submission
    set status = 'approved'::media.publication_status,
        updated_at = now()
    where submission.id = target_submission_id;

    perform private.add_media_submission_event(
      target_submission_id,
      submission_record.reviewer_id,
      'processing_completed',
      'processing'::media.publication_status,
      'approved'::media.publication_status,
      null,
      jsonb_build_object('uploadIntentId', p_upload_intent_id)
    );

    settled_count := settled_count + 1;
  end loop;

  return settled_count;
end;
$function$;
