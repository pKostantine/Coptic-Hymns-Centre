create index if not exists media_processing_jobs_media_asset_version_idx
  on media.media_processing_jobs(media_asset_version_id)
  where media_asset_version_id is not null;

create index if not exists submission_items_upload_intent_fk_idx
  on media.submission_items(upload_intent_id)
  where upload_intent_id is not null;

create index if not exists submission_items_media_asset_fk_idx
  on media.submission_items(media_asset_id)
  where media_asset_id is not null;

create index if not exists submission_events_actor_fk_idx
  on media.submission_events(actor_id)
  where actor_id is not null;

create index if not exists submissions_created_by_fk_idx
  on media.submissions(created_by);

create index if not exists submissions_updated_by_fk_idx
  on media.submissions(updated_by)
  where updated_by is not null;
