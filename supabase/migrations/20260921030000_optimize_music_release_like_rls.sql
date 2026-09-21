-- Evaluate the authenticated user once per statement instead of once per row.
drop policy if exists release_likes_select_own on music.release_likes;
create policy release_likes_select_own
  on music.release_likes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists release_likes_insert_own on music.release_likes;
create policy release_likes_insert_own
  on music.release_likes
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists release_likes_delete_own on music.release_likes;
create policy release_likes_delete_own
  on music.release_likes
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
