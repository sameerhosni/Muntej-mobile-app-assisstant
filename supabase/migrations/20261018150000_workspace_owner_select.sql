-- Owners can always read their own workspaces (lets insert(...).select() return the new row,
-- since can_see_workspace() may not see a row inside its own insert).
create policy workspaces_select_owner on public.workspaces for select to authenticated
  using (owner_id = public.current_profile_id());
