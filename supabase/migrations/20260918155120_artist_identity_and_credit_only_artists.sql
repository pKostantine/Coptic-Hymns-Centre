-- CHC Artists is deliberately not Spotify for Artists: an account IS an artist.
-- The account that signs in as Pierre Kostantine releases as Pierre Kostantine
-- and cannot put a record out under anyone else's name.
--
-- Artists who are credited but do not hold an account -- a cantor whose
-- recording someone else posts, a guest on one track -- exist as credit-only
-- artists: no owning account, creditable anywhere, never the owner of a release.

alter table creator.creator_accounts
  add column if not exists identity_artist_id uuid references music.artists(id) on delete set null;

comment on column creator.creator_accounts.identity_artist_id is
  'The single artist this account releases as. Every release it owns must name this artist.';

create unique index if not exists creator_accounts_identity_artist_key
  on creator.creator_accounts (identity_artist_id)
  where identity_artist_id is not null;

-- An artist either belongs to an account (and is that account's identity) or is
-- credit-only. The generated column keeps the two readings from drifting.
alter table music.artists
  add column if not exists is_credit_only boolean
  generated always as (owner_creator_account_id is null) stored;

comment on column music.artists.is_credit_only is
  'True when no account owns this artist. Credit-only artists can be credited on tracks but cannot own releases.';

-- Point each existing account at the artist it should be, keeping the oldest as
-- the identity: pKostantine becomes Pierre Kostantine.
with ranked as (
  select
    artist.id,
    artist.owner_creator_account_id,
    row_number() over (
      partition by artist.owner_creator_account_id
      order by artist.created_at, artist.display_name
    ) as position
  from music.artists artist
  where artist.owner_creator_account_id is not null
)
update creator.creator_accounts account
set identity_artist_id = ranked.id
from ranked
where ranked.owner_creator_account_id = account.id
  and ranked.position = 1
  and account.identity_artist_id is null;

-- Everything else an account happened to own becomes credit-only. Cantor
-- Tharwat stays fully creditable; it simply stops being able to release.
update music.artists artist
set owner_creator_account_id = null,
    updated_at = now()
where artist.owner_creator_account_id is not null
  and not exists (
    select 1
    from creator.creator_accounts account
    where account.identity_artist_id = artist.id
  );
