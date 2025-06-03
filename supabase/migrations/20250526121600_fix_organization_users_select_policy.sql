-- Migration: Fix organization_users SELECT policy to allow members to see other members
-- Purpose: Allow organization members to view other members in the same organization
-- Affected tables: Updates RLS policy on organization_users table
-- Special considerations: Maintains security while enabling proper member visibility

-- drop the existing overly restrictive select policy
drop policy if exists "users can view relevant organization memberships" on public.organization_users;

-- create new select policy that allows members to see other members in their organizations
create policy "users can view organization members"
on public.organization_users
for select
to authenticated
using (
    -- users can always see their own memberships
    user_id = auth.uid() 
    or
    -- users can see other members in organizations they belong to
    organization_id in (
        select organization_id 
        from public.organization_users 
        where user_id = auth.uid() 
        and status = 'active'
    )
); 