-- Two different dates, which the old single `release_date` could not tell apart.
--
-- scheduled_release_at is when the record goes live on CHC. It must sit at
-- least 48 hours after the hour it was submitted, so there is always a review
-- window. It is a timestamptz because the rule is stated in hours.
--
-- original_release_date is when the record came out somewhere else -- SoundCloud,
-- YouTube, Spotify, Apple Music. It is a plain date because that is all anyone
-- knows about a back catalogue, and when it is set it is the date CHC Music
-- shows: a hymn first released in 2019 should read 2019, not the day it was
-- added here.

alter table music.releases
  add column if not exists scheduled_release_at timestamptz,
  add column if not exists original_release_date date;

comment on column music.releases.scheduled_release_at is
  'When this release goes live on CHC. At least 48 hours after the hour it was submitted.';
comment on column music.releases.original_release_date is
  'When the release came out elsewhere, if it did. Takes precedence over the CHC date for display.';

-- Nothing can claim it was originally released in the future beyond reason, and
-- a back catalogue date before recorded music is a typo, not a fact.
alter table music.releases
  drop constraint if exists releases_original_release_date_sane;

alter table music.releases
  add constraint releases_original_release_date_sane
  check (
    original_release_date is null
    or (original_release_date >= date '1900-01-01' and original_release_date <= current_date + 365)
  );

-- Carry the old date over as the scheduled moment so nothing loses its date.
update music.releases
set scheduled_release_at = (release_date::timestamptz + time '12:00')
where scheduled_release_at is null
  and release_date is not null;

/**
 * The date CHC Music shows for a release: where it first came out if that is
 * known, otherwise when it goes live here.
 */
create or replace function music.release_display_date(
  p_original_release_date date,
  p_scheduled_release_at timestamptz,
  p_release_date date
)
returns date
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    p_original_release_date,
    (p_scheduled_release_at at time zone 'UTC')::date,
    p_release_date
  );
$function$;

/**
 * The earliest moment a submission made now may schedule its release for.
 * Rounded up to the top of the hour so the rule reads the way it was asked for:
 * at least 48 hours from the hour of submission.
 */
create or replace function public.earliest_release_at(p_submitted_at timestamptz default null)
returns timestamptz
language sql
stable
set search_path to ''
as $function$
  select date_trunc('hour', coalesce(p_submitted_at, now())) + interval '48 hours';
$function$;

grant execute on function public.earliest_release_at(timestamptz) to authenticated;
