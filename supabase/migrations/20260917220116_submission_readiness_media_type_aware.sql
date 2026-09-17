-- A required item used to hold publication back until it had a completed
-- media asset, whatever it was -- so anything with no processing pipeline
-- behind it blocked its submission forever.
--
-- Only the media types a worker actually delivers can keep a submission
-- waiting now. Artwork still counts, because image_delivery produces a real
-- asset; a document or an unknown type has nothing to wait for.
create or replace function private.submission_required_items_ready(p_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
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
      left join media.upload_intents intent
        on intent.id = item.upload_intent_id
      where item.submission_id = p_submission_id
        and item.required
        and asset.id is null
        and intent.media_type in (
          'audio'::media.media_type,
          'image'::media.media_type,
          'video'::media.media_type
        )
    );
$function$;
