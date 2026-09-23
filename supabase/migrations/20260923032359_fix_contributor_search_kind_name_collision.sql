-- Avoid an ambiguous PL/pgSQL variable shadowing the returned kind field.
CREATE OR REPLACE FUNCTION public.search_creator_contributors(p_creator_account_id uuid, p_query text, p_kind text DEFAULT 'artist'::text, p_limit integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  q text := private.normalize_creator_name(left(coalesce(p_query,''),120));
  safe_limit integer := greatest(1,least(coalesce(p_limit,12),20));
  search_kind text := lower(btrim(coalesce(p_kind,'artist')));
  result jsonb;
begin
  if auth.uid() is null or not private.can_edit_creator_account(p_creator_account_id) then
    raise exception 'Not authorized for creator account' using errcode='42501';
  end if;
  if search_kind not in ('artist','cantor','all') then
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
    where search_kind in ('artist','all') and
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
    where search_kind in ('cantor','all') and
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
$function$
;
