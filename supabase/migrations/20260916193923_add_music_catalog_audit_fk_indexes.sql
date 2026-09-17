create index if not exists artists_created_by_idx
  on music.artists(created_by)
  where created_by is not null;

create index if not exists artists_updated_by_idx
  on music.artists(updated_by)
  where updated_by is not null;

create index if not exists artist_localizations_created_by_idx
  on music.artist_localizations(created_by)
  where created_by is not null;

create index if not exists artist_localizations_updated_by_idx
  on music.artist_localizations(updated_by)
  where updated_by is not null;

create index if not exists releases_created_by_idx
  on music.releases(created_by)
  where created_by is not null;

create index if not exists releases_updated_by_idx
  on music.releases(updated_by)
  where updated_by is not null;

create index if not exists release_localizations_created_by_idx
  on music.release_localizations(created_by)
  where created_by is not null;

create index if not exists release_localizations_updated_by_idx
  on music.release_localizations(updated_by)
  where updated_by is not null;

create index if not exists tracks_created_by_idx
  on music.tracks(created_by)
  where created_by is not null;

create index if not exists tracks_updated_by_idx
  on music.tracks(updated_by)
  where updated_by is not null;

create index if not exists track_localizations_created_by_idx
  on music.track_localizations(created_by)
  where created_by is not null;

create index if not exists track_localizations_updated_by_idx
  on music.track_localizations(updated_by)
  where updated_by is not null;
