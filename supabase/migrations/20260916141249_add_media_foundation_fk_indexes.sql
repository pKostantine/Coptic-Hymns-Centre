create index if not exists user_roles_granted_by_idx
  on creator.user_roles(granted_by)
  where granted_by is not null;

create index if not exists creator_accounts_created_by_idx
  on creator.creator_accounts(created_by)
  where created_by is not null;

create index if not exists creator_accounts_updated_by_idx
  on creator.creator_accounts(updated_by)
  where updated_by is not null;

create index if not exists creator_account_members_invited_by_idx
  on creator.creator_account_members(invited_by)
  where invited_by is not null;

create index if not exists media_assets_created_by_idx
  on media.media_assets(created_by)
  where created_by is not null;

create index if not exists media_assets_updated_by_idx
  on media.media_assets(updated_by)
  where updated_by is not null;

create index if not exists media_asset_versions_created_by_idx
  on media.media_asset_versions(created_by)
  where created_by is not null;

create index if not exists localized_texts_created_by_idx
  on media.localized_texts(created_by)
  where created_by is not null;

create index if not exists localized_texts_updated_by_idx
  on media.localized_texts(updated_by)
  where updated_by is not null;

create index if not exists search_aliases_owner_idx
  on media.search_aliases(owner_creator_account_id)
  where owner_creator_account_id is not null;

create index if not exists search_aliases_created_by_idx
  on media.search_aliases(created_by)
  where created_by is not null;

create index if not exists search_aliases_updated_by_idx
  on media.search_aliases(updated_by)
  where updated_by is not null;
