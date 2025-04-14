-- Update the RLS policies to allow proper access to user data through relations
create policy "Users can view user details through entity_assignees"
  on auth.users
  for select
  to authenticated
  using (
    -- Users can view details of:
    -- 1. Users they have assigned to entities
    -- 2. Users who are assigned to the same entities as them
    id in (
      select user_id from public.entity_assignees where assigned_by = auth.uid()
      union
      select user_id from public.entity_assignees ea
      where exists (
        select 1 from public.entity_assignees ea2
        where ea2.entity_type = ea.entity_type
        and ea2.entity_id = ea.entity_id
        and ea2.user_id = auth.uid()
      )
    )
  ); 