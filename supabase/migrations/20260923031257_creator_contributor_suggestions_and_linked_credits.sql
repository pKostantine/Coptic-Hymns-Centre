-- The identity resolver used by both CHC Artists' music credits and learning
-- contributor search. Only explicit selections or exact normalized matches
-- link catalog identities; fuzzy results are suggestions, never silent merges.
create or replace function private.normalize_creator_name(p_name text)
returns text language sql immutable set search_path = ''
as $norm$
  select regexp_replace(
    regexp_replace(lower(btrim(coalesce(p_name,''))),
      '^(cantor|moallem|mouallem|muallem|mo.allim|المعلم|المرتل)[[:space:]]+', '', 'i'),
    '[[:space:][:punct:]ًٌٍَُِّْـ]+', '', 'g');
$norm$;

create or replace function public.search_creator_contributors(
  p_creator_account_id uuid, p_query text, p_kind text default 'artist', p_limit integer default 12
) returns jsonb language plpgsql stable security definer set search_path = ''
as $search$
declare
  q text := private.normalize_creator_name(left(coalesce(p_query,''),120));
  safe_limit integer := greatest(1,least(coalesce(p_limit,12),20));
  kind text := lower(btrim(coalesce(p_kind,'artist')));
  result jsonb;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_creator_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  if kind not in ('artist','cantor','all') then
    raise exception 'Contributor search kind is invalid' using errcode='22023';
  end if;
  if length(q)<2 then return '[]'::jsonb; end if;
  with candidates as (
    select a.id, a.display_name as title, 'artist'::text as kind,
           a.is_credit_only, a.publication_status::text as status,
           case when ma.id is not null then
             jsonb_build_object('bucket',ma.bucket,'path',ma.path,'version',ma.version)
           else null end as photo,
           private.normalize_creator_name(a.display_name) as normalized
    from music.artists a
    left join media.media_assets ma on ma.id=a.profile_image_asset_id
      and ma.publication_status='published'::media.publication_status
      and ma.media_type='image'::media.media_type
    where kind in ('artist','all') and
      (a.publication_status='published'::media.publication_status
       or a.is_credit_only or a.owner_creator_account_id=p_creator_account_id)
    union all
    select c.id, c.display_name,
      case when lower(coalesce(c.metadata->>'contributorType','cantor'))='chorus'
           then 'chorus' else 'cantor' end,
      false, c.publication_status::text,
      case when ma.id is not null then
        jsonb_build_object('bucket',ma.bucket,'path',ma.path,'version',ma.version)
      else null end,
      private.normalize_creator_name(c.display_name)
    from learning.cantors c
    left join media.media_assets ma on ma.id=c.profile_image_asset_id
      and ma.publication_status='published'::media.publication_status
      and ma.media_type='image'::media.media_type
    where kind in ('cantor','all') and
      (c.publication_status='published'::media.publication_status
       or c.owner_creator_account_id=p_creator_account_id
       or c.owner_creator_account_id is null)
  ), scored as (
    select *,
       case when normalized=q then 1000
            when normalized like q || '%' then 700
            when normalized like '%' || q || '%' then 500
            else 0 end
       + round(extensions.similarity(normalized,q)*300)::integer as score
    from candidates
    where normalized=q or normalized like '%' || q || '%'
          or extensions.similarity(normalized,q)>=0.21
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'title',title,'kind',kind,'isCreditOnly',is_credit_only,
    'status',status,'profileImage',photo,'matchScore',score)
    order by score desc, (photo is not null) desc, title), '[]'::jsonb)
  into result
  from (select * from scored order by score desc, (photo is not null) desc, title limit safe_limit) ranked;
  return result;
end;
$search$;
revoke all on function public.search_creator_contributors(uuid,text,text,integer) from public,anon;
grant execute on function public.search_creator_contributors(uuid,text,text,integer) to authenticated;

-- Safe selected-identity resolver. Do not allow arbitrary private draft artist
-- records to be linked by their leaked UUIDs.
create or replace function private.resolve_creator_selected_artist(
  p_owner_account_id uuid,p_display_name text,p_artist_id uuid,
  p_default_identity boolean default false
) returns uuid language plpgsql security definer set search_path=''
as $resolve$
declare
  owned_identity uuid;
  artist_row music.artists%rowtype;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_owner_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  select ca.identity_artist_id into owned_identity
    from creator.creator_accounts ca where ca.id=p_owner_account_id;
  if p_artist_id is not null then
    select * into artist_row from music.artists where id=p_artist_id
      and (publication_status='published'::media.publication_status
           or is_credit_only or owner_creator_account_id=p_owner_account_id);
    if not found then raise exception 'Selected artist is unavailable' using errcode='22023'; end if;
    return artist_row.id;
  end if;
  if nullif(trim(coalesce(p_display_name,'')),'') is null then
    return case when p_default_identity then owned_identity else null end;
  end if;
  return private.resolve_track_credit_artist(p_owner_account_id,p_display_name,false);
end;
$resolve$;

create or replace function private.set_track_credit_refs(
  p_track_id uuid,p_owner_account_id uuid,p_main_artist_name text,
  p_main_artist_id uuid,p_contributors jsonb default '[]'::jsonb
) returns void language plpgsql security definer set search_path=''
as $credits$
declare
  main_id uuid; item jsonb; contributor_id uuid;
  role_name text; name_text text; n integer:=0;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_owner_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  if not exists(select 1 from music.tracks t where t.id=p_track_id
      and t.owner_creator_account_id=p_owner_account_id) then
    raise exception 'Track not owned by creator' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_contributors,'[]'::jsonb))<>'array' then
    raise exception 'Contributors must be a list' using errcode='22023';
  end if;
  main_id:=private.resolve_creator_selected_artist(
     p_owner_account_id,p_main_artist_name,p_main_artist_id,true);
  if main_id is null then raise exception 'Main artist is required' using errcode='22023'; end if;
  delete from music.track_artists where track_id=p_track_id;
  insert into music.track_artists(track_id,artist_id,role,sort_order)
    values(p_track_id,main_id,'primary'::music.track_artist_role,0);
  for item in select value from jsonb_array_elements(coalesce(p_contributors,'[]'::jsonb))
  loop
    n:=n+1;
    role_name:=lower(nullif(trim(item->>'role'),''));
    name_text:=nullif(trim(item->>'name'),'');
    if role_name not in ('featured','composer','lyricist','arranger','producer','artwork') then
      raise exception 'Unsupported contributor role' using errcode='22023';
    end if;
    if name_text is null and nullif(item->>'artistId','') is null then
      raise exception 'Contributor name required' using errcode='22023';
    end if;
    contributor_id:=private.resolve_creator_selected_artist(
       p_owner_account_id,name_text,nullif(item->>'artistId','')::uuid,false);
    if contributor_id is not null and
       not(role_name='featured' and contributor_id=main_id) then
      insert into music.track_artists(track_id,artist_id,role,sort_order)
        values(p_track_id,contributor_id,role_name::music.track_artist_role,n)
        on conflict(track_id,artist_id,role) do update
           set sort_order=least(music.track_artists.sort_order,excluded.sort_order);
    end if;
  end loop;
end;
$credits$;
