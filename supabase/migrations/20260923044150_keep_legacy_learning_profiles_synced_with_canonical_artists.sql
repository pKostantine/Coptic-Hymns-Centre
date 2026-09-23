-- Backward compatibility for older CHC Artists installs: the deprecated
-- cantor/chorus creation endpoint now resolves the one music artist identity.
-- The caller's old "kind" is display-only and never creates a separate person.
create or replace function public.create_creator_cantor(
  p_creator_account_id uuid,p_display_name text,
  p_contributor_type text default 'cantor'
) returns jsonb
language plpgsql security definer set search_path=''
as $old_client$
declare
  legacy_id uuid;
  linked_artist music.artists%rowtype;
  legacy learning.cantors%rowtype;
begin
  legacy_id := private.resolve_learning_submission_artist(
    p_creator_account_id,null,p_display_name
  );
  select * into legacy from learning.cantors where id=legacy_id;
  select * into linked_artist from music.artists where id=legacy.artist_id;
  return jsonb_build_object(
    'id',legacy.id,'artistId',linked_artist.id,
    'title',linked_artist.display_name,
    'subtitle',legacy.publication_status,
    'kind',case when lower(coalesce(p_contributor_type,''))='chorus'
      then 'chorus' else 'cantor' end
  );
end;
$old_client$;
revoke execute on function public.create_creator_cantor(uuid,text,text) from public,anon;
grant execute on function public.create_creator_cantor(uuid,text,text) to authenticated;

-- When a linked artist edits their canonical name, picture or publication
-- status, old learning FK projections follow that same profile automatically.
create or replace function private.sync_learning_artist_identity()
returns trigger language plpgsql security definer set search_path=''
as $sync$
begin
  update learning.cantors c set
    display_name=new.display_name,
    profile_image_asset_id=new.profile_image_asset_id,
    publication_status=case
      when new.publication_status='published'::media.publication_status
           or new.is_credit_only then 'published'::media.publication_status
      else c.publication_status end,
    updated_at=now()
  where c.artist_id=new.id
    and (c.display_name is distinct from new.display_name
      or c.profile_image_asset_id is distinct from new.profile_image_asset_id
      or (new.publication_status='published'::media.publication_status
          and c.publication_status<>'published'::media.publication_status));
  return new;
end;
$sync$;

drop trigger if exists sync_canonical_artist_to_learning on music.artists;
create trigger sync_canonical_artist_to_learning
after update of display_name,profile_image_asset_id,publication_status,owner_creator_account_id
on music.artists for each row
when (
  old.display_name is distinct from new.display_name or
  old.profile_image_asset_id is distinct from new.profile_image_asset_id or
  old.publication_status is distinct from new.publication_status or
  old.owner_creator_account_id is distinct from new.owner_creator_account_id
)
execute function private.sync_learning_artist_identity();
