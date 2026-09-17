-- What a submission item is FOR, kept on the row instead of inferred from a
-- "Artwork: " title prefix and a sort order of zero. Processing and readiness
-- branch on this together with the upload's own media_type: the role says what
-- the file is for, media_type says what it is.
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'media' and t.typname = 'submission_item_role'
  ) then
    create type media.submission_item_role as enum ('artwork', 'track', 'lesson', 'other');
  end if;
end $$;

alter table media.submission_items
  add column if not exists role media.submission_item_role not null default 'other';

-- Backfill the rows that predate the column. An image upload is artwork
-- whatever it was titled; everything else follows the submission it belongs to.
with resolved as (
  select
    item.id,
    (case
      when item.title like 'Artwork:%' then 'artwork'
      when intent.media_type = 'image'::media.media_type then 'artwork'
      when submission.submission_type = 'music_release'::media.submission_type then 'track'
      when submission.submission_type in (
        'learning_album'::media.submission_type,
        'learning_lesson_set'::media.submission_type
      ) then 'lesson'
      else 'other'
    end)::media.submission_item_role as resolved_role
  from media.submission_items item
  join media.submissions submission on submission.id = item.submission_id
  left join media.upload_intents intent on intent.id = item.upload_intent_id
)
update media.submission_items item
set role = resolved.resolved_role
from resolved
where resolved.id = item.id;

comment on column media.submission_items.role is
  'What this item is for: artwork, track, lesson, or other. Processing branches on this plus upload_intents.media_type.';
