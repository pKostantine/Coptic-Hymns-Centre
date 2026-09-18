-- An artist's public page: where to find them elsewhere, and which releases
-- they want at the top of it.

create table if not exists music.artist_social_links (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references music.artists(id) on delete cascade,
  platform text not null,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artist_social_links_platform_known check (
    platform in (
      'soundcloud', 'youtube', 'spotify', 'apple_music', 'instagram',
      'facebook', 'x', 'tiktok', 'bandcamp', 'website'
    )
  ),
  -- Only somewhere a listener can actually be sent.
  constraint artist_social_links_url_is_http check (url ~* '^https?://[^\s]+$'),
  constraint artist_social_links_one_per_platform unique (artist_id, platform)
);

create index if not exists artist_social_links_artist_idx
  on music.artist_social_links (artist_id, sort_order);

create table if not exists music.artist_pinned_releases (
  artist_id uuid not null references music.artists(id) on delete cascade,
  release_id uuid not null references music.releases(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (artist_id, release_id)
);

create index if not exists artist_pinned_releases_order_idx
  on music.artist_pinned_releases (artist_id, sort_order);

alter table music.artist_social_links enable row level security;
alter table music.artist_pinned_releases enable row level security;

-- Listeners read; only the artist's own account writes, through the RPC below.
drop policy if exists artist_social_links_public_read on music.artist_social_links;
create policy artist_social_links_public_read
  on music.artist_social_links for select
  using (
    exists (
      select 1 from music.artists artist
      where artist.id = artist_social_links.artist_id
        and artist.publication_status = 'published'::media.publication_status
    )
    or (select private.is_admin())
    or exists (
      select 1 from music.artists artist
      where artist.id = artist_social_links.artist_id
        and artist.owner_creator_account_id is not null
        and (select private.can_edit_creator_account(artist.owner_creator_account_id))
    )
  );

drop policy if exists artist_pinned_releases_public_read on music.artist_pinned_releases;
create policy artist_pinned_releases_public_read
  on music.artist_pinned_releases for select
  using (
    exists (
      select 1 from music.artists artist
      where artist.id = artist_pinned_releases.artist_id
        and artist.publication_status = 'published'::media.publication_status
    )
    or (select private.is_admin())
    or exists (
      select 1 from music.artists artist
      where artist.id = artist_pinned_releases.artist_id
        and artist.owner_creator_account_id is not null
        and (select private.can_edit_creator_account(artist.owner_creator_account_id))
    )
  );

grant select on music.artist_social_links to anon, authenticated;
grant select on music.artist_pinned_releases to anon, authenticated;
