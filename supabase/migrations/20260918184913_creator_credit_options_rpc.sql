/**
 * The artists a creator may credit on a track: their own identity, which is the
 * default, plus every credit-only artist in the catalogue. Credit-only artists
 * are shared -- two accounts crediting the same cantor should point at one
 * artist, not two rows with the same name.
 */
create or replace function public.get_creator_credit_options(p_creator_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_identity_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not (select private.can_edit_creator_account(p_creator_account_id)) then
    raise exception 'Not authorized for creator account' using errcode = '42501';
  end if;

  select account.identity_artist_id into v_identity_id
  from creator.creator_accounts account
  where account.id = p_creator_account_id;

  return jsonb_build_object(
    'identityArtist', (
      select jsonb_build_object('id', artist.id, 'displayName', artist.display_name)
      from music.artists artist where artist.id = v_identity_id
    ),
    'creditableArtists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', artist.id,
        'displayName', artist.display_name,
        'isCreditOnly', artist.is_credit_only
      ) order by artist.is_credit_only, artist.display_name)
      from music.artists artist
      where artist.id = v_identity_id
         or artist.is_credit_only
    ), '[]'::jsonb)
  );
end;
$function$;

grant execute on function public.get_creator_credit_options(uuid) to authenticated;
