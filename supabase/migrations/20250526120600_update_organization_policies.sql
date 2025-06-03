-- Migration: Update organization policies to use organization membership
-- Purpose: Update the simplified organization policies to properly check organization membership
-- Affected tables: organizations policies
-- Special considerations: Applied after organization_users table exists

-- drop the simplified policies from the organizations table
drop policy if exists "users can view organizations they created" on public.organizations;
drop policy if exists "organization creators can update organizations" on public.organizations;
drop policy if exists "organization creators can delete organizations" on public.organizations;

-- create proper organization-membership-based policies

-- select policy: users can view organizations they belong to
create policy "users can view organizations they belong to"
on public.organizations
for select
to authenticated
using (
    id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() and status = 'active'
    )
);

-- update policy: organization owners and admins can update organization details
create policy "organization owners and admins can update organizations"
on public.organizations
for update
to authenticated
using (
    id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
)
with check (
    id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);

-- delete policy: only organization owners can delete organizations
create policy "organization owners can delete organizations"
on public.organizations
for delete
to authenticated
using (
    id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role = 'owner'
        and status = 'active'
    )
); 