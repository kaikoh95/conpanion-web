-- Migration: Fix recursive RLS policies causing infinite recursion
-- Purpose: Simplify organization_users policies to avoid circular references
-- Affected tables: organization_users policies
-- Special considerations: Removes recursive policy checks that cause infinite loops

-- drop the problematic recursive policies on organization_users
drop policy if exists "users can view relevant organization memberships" on public.organization_users;
drop policy if exists "organization owners and admins can invite users" on public.organization_users;
drop policy if exists "users can update membership settings" on public.organization_users;
drop policy if exists "users can manage organization memberships" on public.organization_users;

-- create simplified, non-recursive policies for organization_users

-- select policy: users can view their own memberships and memberships they created (invited)
create policy "users can view organization memberships"
on public.organization_users
for select
to authenticated
using (
    user_id = auth.uid() or
    invited_by = auth.uid()
);

-- insert policy: authenticated users can create memberships (for inviting others)
-- the application logic and database functions will handle permission checks
create policy "authenticated users can create memberships"
on public.organization_users
for insert
to authenticated
with check (
    invited_by = auth.uid()
);

-- update policy: users can update their own membership settings
create policy "users can update their own memberships"
on public.organization_users
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- delete policy: users can remove their own memberships or ones they created
create policy "users can delete relevant memberships"
on public.organization_users
for delete
to authenticated
using (
    user_id = auth.uid() or
    invited_by = auth.uid()
); 