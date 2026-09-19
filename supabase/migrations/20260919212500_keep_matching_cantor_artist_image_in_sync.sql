-- Keep a matching Learn cantor's inherited artist image in sync when the
-- Music artist replaces that profile image. A cantor with its own different
-- image remains independent.
create or replace function private.sync_music_artist_image_to_learning_cantor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.profile_image_asset_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    update learning.cantors cantor
    set profile_image_asset_id = new.profile_image_asset_id,
        updated_at = now()
    where lower(trim(cantor.display_name)) = lower(trim(new.display_name))
      and (
        cantor.profile_image_asset_id is null
        or cantor.profile_image_asset_id = old.profile_image_asset_id
      );
  else
    update learning.cantors cantor
    set profile_image_asset_id = new.profile_image_asset_id,
        updated_at = now()
    where lower(trim(cantor.display_name)) = lower(trim(new.display_name))
      and cantor.profile_image_asset_id is null;
  end if;

  return new;
end;
$function$;
