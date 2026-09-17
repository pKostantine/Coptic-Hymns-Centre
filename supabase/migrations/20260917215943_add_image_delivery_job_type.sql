-- Artwork needs a processing job type of its own. Added in its own migration
-- because a new enum label cannot be referenced by anything created in the
-- same transaction that adds it.
alter type media.processing_job_type add value if not exists 'image_delivery';
