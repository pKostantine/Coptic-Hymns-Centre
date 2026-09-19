-- Ensure deleted published catalog items are omitted from CHC Admin's Published list.
do $patch_overview$
declare
  definition text;
  patched text;
  needle text := $needle$        where submission.status = 'published'::media.publication_status$needle$;
  replacement text := $replacement$        where submission.status = 'published'::media.publication_status
          and (
            (
              submission.submission_type = 'music_release'::media.submission_type
              and exists (
                select 1 from music.releases release
                where release.metadata ->> 'submissionId' = submission.id::text
              )
            )
            or (
              submission.submission_type = 'learning_album'::media.submission_type
              and exists (
                select 1 from learning.albums album
                where album.submission_id = submission.id
              )
            )
            or (
              submission.submission_type = 'learning_lesson_set'::media.submission_type
              and exists (
                select 1 from learning.lesson_sets lesson_set
                where lesson_set.submission_id = submission.id
              )
            )
          )$replacement$;
begin
  select pg_get_functiondef(p.oid)
  into definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_publication_overview';

  if definition is null then
    raise exception 'get_admin_publication_overview not found';
  end if;

  if position($marker$where submission.status = 'published'::media.publication_status
          and ($marker$ in definition) > 0 then
    return;
  end if;

  patched := replace(definition, needle, replacement);
  if patched = definition then
    raise exception 'Could not patch published overview filtering';
  end if;

  execute patched;
end;
$patch_overview$;
