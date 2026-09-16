alter table media.upload_intents
drop constraint if exists upload_intents_path_private_submission;

alter table media.upload_intents
add constraint upload_intents_path_private_submission check (
  path ~ '^submissions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/original(\.[a-z0-9]{1,12})?$'
);
