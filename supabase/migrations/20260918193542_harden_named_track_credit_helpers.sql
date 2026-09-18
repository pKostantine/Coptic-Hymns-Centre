revoke all on function private.resolve_track_credit_artist(uuid, text, boolean) from public, anon;
revoke all on function private.set_track_credit_names(uuid, uuid, text, jsonb) from public, anon;

grant execute on function private.resolve_track_credit_artist(uuid, text, boolean) to authenticated;
grant execute on function private.set_track_credit_names(uuid, uuid, text, jsonb) to authenticated;
