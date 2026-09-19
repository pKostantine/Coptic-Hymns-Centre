-- Keep a deleted catalog release from lingering in the active review queue.
-- Published submissions stay in publication history; non-published submissions
-- are retired as rejected because the product currently has no separate
-- creator-cancelled status.

create or replace function private.retire_submission_when_music_release_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  submission_id uuid;
begin
  submission_id := nullif(old.metadata ->> 'submissionId', '')::uuid;

  if submission_id is not null then
    update media.submissions submission
    set status = 'rejected'::media.publication_status,
        rejected_at = coalesce(submission.rejected_at, now()),
        review_notes = coalesce(
          nullif(submission.review_notes, ''),
          'The linked music release was deleted from the catalog.'
        ),
        updated_at = now()
    where submission.id = submission_id
      and submission.status not in (
        'published'::media.publication_status,
        'rejected'::media.publication_status
      );
  end if;

  return old;
end;
$function$;

drop trigger if exists music_release_retire_submission_on_delete on music.releases;
create trigger music_release_retire_submission_on_delete
before delete on music.releases
for each row execute function private.retire_submission_when_music_release_deleted();

revoke all on function private.retire_submission_when_music_release_deleted() from public;
