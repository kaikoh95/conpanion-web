-- Migration: Create organization_users junction table for multi-tenant membership
-- Purpose: Support users belonging to multiple organizations with different roles and permissions
-- Affected tables: Creates organization_users table
-- Special considerations: Prevents duplicate organization-user combinations and tracks membership status

-- create organization_users junction table supporting multiple organization memberships per user
create table if not exists public.organization_users (
    id serial primary key,
    organization_id integer not null references public.organizations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    
    -- role can be different in each organization
    role text not null check (role in ('owner', 'admin', 'member', 'guest')),
    
    -- invitation and membership tracking
    status text default 'active' check (status in ('pending', 'active', 'suspended', 'deactivated')),
    joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
    invited_at timestamp with time zone,
    invited_by uuid references auth.users(id),
    last_accessed_at timestamp with time zone default timezone('utc'::text, now()),
    
    -- organization-specific user settings
    display_name text, -- user can have different display names per org
    notifications_enabled boolean default true,
    
    -- prevent duplicate organization-user combinations
    unique(organization_id, user_id)
);

-- create indexes for better query performance
create index organization_users_organization_id_idx on public.organization_users(organization_id);
create index organization_users_user_id_idx on public.organization_users(user_id);
create index organization_users_role_idx on public.organization_users(role);
create index organization_users_status_idx on public.organization_users(status);
create index organization_users_invited_by_idx on public.organization_users(invited_by);
create index organization_users_last_accessed_idx on public.organization_users(last_accessed_at);

-- enable row level security
alter table public.organization_users enable row level security;

-- rls policies for organization_users table

-- select policy: users can view memberships they are part of or have invited others to
create policy "users can view relevant organization memberships"
on public.organization_users
for select
to authenticated
using (
    user_id = auth.uid() or
    invited_by = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);

-- insert policy: organization owners and admins can invite users
create policy "organization owners and admins can invite users"
on public.organization_users
for insert
to authenticated
with check (
    invited_by = auth.uid() and
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);

-- update policy: users can update their own membership settings, owners/admins can update others
create policy "users can update membership settings"
on public.organization_users
for update
to authenticated
using (
    user_id = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
)
with check (
    user_id = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);

-- delete policy: users can remove themselves, owners/admins can remove others
create policy "users can manage organization memberships"
on public.organization_users
for delete
to authenticated
using (
    user_id = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);

-- grant permissions for organization_users table
grant select on table public.organization_users to authenticated;
grant insert on table public.organization_users to authenticated;
grant update on table public.organization_users to authenticated;
grant delete on table public.organization_users to authenticated; 