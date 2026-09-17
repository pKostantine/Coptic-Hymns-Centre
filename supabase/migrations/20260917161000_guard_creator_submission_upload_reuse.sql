-- An uploaded file belongs to exactly one submission item. Without this the
-- same upload intent could be attached to a second submission (or twice to the
-- same one), which would then be published or rejected alongside work it has
-- nothing to do with. Enforced as an index so every path is covered: the
-- CHC Artists submission RPC, the requested-changes flow, and direct RPC calls.

create unique index if not exists submission_items_upload_intent_id_unique
  on media.submission_items (upload_intent_id)
  where upload_intent_id is not null;
