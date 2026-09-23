
-- Detect matching unclaimed historic credits automatically when a creator later
-- submits under that name. Ownership transfer is deliberately admin-confirmed:
-- a display name alone does not prove someone is the credited person.
create or replace function public.get_admin_creator_artist_claims(p_submission_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $claims$
declare account_id uuid; existing_id uuid; account_name text; result jsonb;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin role required' using errcode='42501';
  end if;
  select ca.id,ca.identity_artist_id,ca.display_name
    into account_id,existing_id,account_name
  from media.submissions sub
  join creator.creator_accounts ca on ca.id=sub.creator_account_id
  where sub.id=p_submission_id;
  if account_id is null or existing_id is null then return '[]'::jsonb; end if;
  if exists(select 1 from music.artists own where own.id=existing_id
    and own.publication_status='published'::media.publication_status) then
    return '[]'::jsonb;
  end if;
  if exists(select 1 from music.releases rel
    where rel.owner_creator_account_id=account_id
    and rel.publication_status='published'::media.publication_status) then
    return '[]'::jsonb;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'artistId',artist.id,'title',artist.display_name,
    'profileImage',case when photo.id is not null then
      jsonb_build_object('bucket',photo.bucket,'path',photo.path,'version',photo.version)
      else null end,
    'existingCredits',(select count(*) from music.track_artists ta where ta.artist_id=artist.id),
    'creditOnly',artist.is_credit_only
  ) order by (
    select count(*) from music.track_artists ta where ta.artist_id=artist.id
  ) desc, artist.created_at), '[]'::jsonb)
  into result
  from music.artists artist
  left join media.media_assets photo on photo.id=artist.profile_image_asset_id
      and photo.publication_status='published'::media.publication_status
  where artist.id<>existing_id
    and artist.owner_creator_account_id is null
    and not exists(select 1 from creator.creator_accounts other_ca
      where other_ca.identity_artist_id=artist.id)
    and private.normalize_creator_name(artist.display_name)=
      private.normalize_creator_name(account_name);
  return result;
end;
$claims$;
revoke all on function public.get_admin_creator_artist_claims(uuid) from public,anon,authenticated;
grant execute on function public.get_admin_creator_artist_claims(uuid) to authenticated;

create or replace function public.confirm_admin_creator_artist_claim(
  p_submission_id uuid,p_existing_artist_id uuid
) returns jsonb language plpgsql security definer set search_path=''
as $link$
declare
  account_record creator.creator_accounts%rowtype;
  old_artist music.artists%rowtype;
  target_artist music.artists%rowtype;
  sub media.submissions%rowtype;
  actor uuid:=auth.uid();
begin
  if actor is null or not private.is_admin() then
    raise exception 'Admin verification required' using errcode='42501';
  end if;
  select * into sub from media.submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found' using errcode='P0002'; end if;
  select * into account_record from creator.creator_accounts
    where id=sub.creator_account_id for update;
  if not found then raise exception 'Creator account not found' using errcode='P0002'; end if;
  select * into old_artist from music.artists
    where id=account_record.identity_artist_id for update;
  select * into target_artist from music.artists
    where id=p_existing_artist_id for update;
  if target_artist.id is null or target_artist.owner_creator_account_id is not null
    or exists(select 1 from creator.creator_accounts ca where ca.identity_artist_id=target_artist.id)
    or private.normalize_creator_name(target_artist.display_name) <>
       private.normalize_creator_name(account_record.display_name)
    or target_artist.id=old_artist.id then
    raise exception 'The existing credit is no longer available for this creator' using errcode='22023';
  end if;
  if old_artist.owner_creator_account_id<>account_record.id
    or old_artist.publication_status='published'::media.publication_status
    or exists(select 1 from music.releases r where
      r.owner_creator_account_id=account_record.id and
      r.publication_status='published'::media.publication_status) then
    raise exception 'Cannot automatically merge a live artist profile; contact CHC support' using errcode='22023';
  end if;

  update music.artists target set
    owner_creator_account_id=account_record.id,
    is_credit_only=false,
    profile_image_asset_id=coalesce(target.profile_image_asset_id,old_artist.profile_image_asset_id),
    biography=coalesce(nullif(target.biography,''),old_artist.biography),
    updated_at=now(),updated_by=actor
  where target.id=target_artist.id;

  update creator.creator_accounts ca set identity_artist_id=target_artist.id,
    updated_by=actor,updated_at=now() where ca.id=account_record.id;

  update music.releases rel set primary_artist_id=target_artist.id,updated_by=actor
    where rel.owner_creator_account_id=account_record.id and rel.primary_artist_id=old_artist.id;

  insert into music.track_artists(track_id,artist_id,role,sort_order)
  select ta.track_id,target_artist.id,ta.role,ta.sort_order
    from music.track_artists ta where ta.artist_id=old_artist.id
  on conflict(track_id,artist_id,role) do nothing;
  delete from music.track_artists where artist_id=old_artist.id;

  insert into music.artist_localizations
    (artist_id,locale,display_name,sort_name,biography,is_primary,publication_status,created_by,updated_by)
  select target_artist.id,l.locale,l.display_name,l.sort_name,l.biography,l.is_primary,
         l.publication_status,l.created_by,actor
    from music.artist_localizations l where l.artist_id=old_artist.id
  on conflict(artist_id,locale) do nothing;

  insert into music.artist_memberships(artist_id,creator_account_id,role)
  select target_artist.id,m.creator_account_id,m.role
    from music.artist_memberships m where m.artist_id=old_artist.id
  on conflict(artist_id,creator_account_id) do nothing;

  insert into music.artist_follows(user_id,artist_id,created_at)
  select f.user_id,target_artist.id,f.created_at
    from music.artist_follows f where f.artist_id=old_artist.id
  on conflict(user_id,artist_id) do nothing;
  delete from music.artist_follows where artist_id=old_artist.id;

  insert into music.artist_social_links(artist_id,platform,url,sort_order,label)
  select target_artist.id,l.platform,l.url,l.sort_order,l.label
    from music.artist_social_links l where l.artist_id=old_artist.id
  on conflict(artist_id,platform) do nothing;

  insert into music.artist_pinned_releases(artist_id,release_id,sort_order)
  select target_artist.id,p.release_id,p.sort_order
    from music.artist_pinned_releases p where p.artist_id=old_artist.id
  on conflict(artist_id,release_id) do nothing;

  update music.artists a set publication_status='archived'::media.publication_status,
      metadata=coalesce(a.metadata,'{}'::jsonb)||
        jsonb_build_object('mergedInto',target_artist.id,'mergedAt',now(),
          'verifiedByAdmin',true), updated_by=actor
    where a.id=old_artist.id;

  perform private.add_media_submission_event(
    sub.id,actor,'artist_identity_linked',sub.status,sub.status,null,
    jsonb_build_object('oldArtistId',old_artist.id,
      'existingArtistId',target_artist.id,'creatorAccountId',account_record.id));
  return jsonb_build_object('linked',true,'artistId',target_artist.id,
    'previousArtistId',old_artist.id);
end;
$link$;
revoke all on function public.confirm_admin_creator_artist_claim(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.confirm_admin_creator_artist_claim(uuid,uuid)
  to authenticated;
