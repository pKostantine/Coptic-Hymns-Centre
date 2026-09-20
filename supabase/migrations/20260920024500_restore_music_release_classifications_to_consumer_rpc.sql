-- The release row already stores the CHC Artists Details selections in
-- music.releases.metadata. A later replacement of the consumer RPC dropped
-- those two keys from its JSON payload, so CHC could no longer render them.
do $$
declare
  definition text;
begin
  select pg_get_functiondef('public.get_published_music_release_for_locale(uuid,text)'::regprocedure)
    into definition;

  if position('''musicType''' in definition) = 0 then
    definition := replace(
      definition,
      '''publicationStatus'', release.publication_status,',
      '''publicationStatus'', release.publication_status,' || E'\n    ' ||
      '''musicType'', release.metadata ->> ''musicType'',' || E'\n    ' ||
      '''recordingType'', release.metadata ->> ''recordingType'','
    );
    execute definition;
  end if;
end;
$$;
