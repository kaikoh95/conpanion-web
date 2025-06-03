-- Migration: Create user_profiles table for multi-tenant user management
-- Purpose: Extended user profiles supporting multi-tenancy, organization context switching, and user preferences
-- Affected tables: Creates user_profiles table
-- Special considerations: Links to auth.users and tracks current organization context

-- create user_profiles table supporting multi-tenancy
create table if not exists public.user_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    
    -- global user settings
    global_display_name text,
    global_avatar_url text,
    preferred_timezone text default 'UTC',
    preferred_language text default 'en',
    
    -- multi-tenancy settings
    current_organization_id integer references public.organizations(id),
    default_organization_id integer references public.organizations(id), -- fallback when current is null
    
    -- session and security
    last_organization_switch_at timestamp with time zone,
    failed_login_attempts integer default 0,
    locked_until timestamp with time zone,
    
    -- metadata
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- create indexes for better query performance
create index user_profiles_current_organization_id_idx on public.user_profiles(current_organization_id);
create index user_profiles_default_organization_id_idx on public.user_profiles(default_organization_id);
create index user_profiles_last_organization_switch_idx on public.user_profiles(last_organization_switch_at);

-- enable row level security
alter table public.user_profiles enable row level security;

-- add updated_at trigger
create trigger handle_user_profiles_updated_at
    before update on public.user_profiles
    for each row
    execute function public.handle_updated_at();

-- rls policies for user_profiles table

-- select policy: users can view their own profile and profiles of users in their organizations
create policy "users can view relevant user profiles"
on public.user_profiles
for select
to authenticated
using (
    id = auth.uid() or
    id in (
        select distinct ou.user_id
        from public.organization_users ou
        where ou.organization_id in (
            select organization_id 
            from public.organization_users 
            where user_id = auth.uid() 
            and status = 'active'
        )
        and ou.status = 'active'
    )
);

-- insert policy: users can create their own profile
create policy "users can create their own profile"
on public.user_profiles
for insert
to authenticated
with check (id = auth.uid());

-- update policy: users can update their own profile
create policy "users can update their own profile"
on public.user_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- delete policy: users can delete their own profile
create policy "users can delete their own profile"
on public.user_profiles
for delete
to authenticated
using (id = auth.uid());

-- grant permissions for user_profiles table
grant select on table public.user_profiles to authenticated;
grant insert on table public.user_profiles to authenticated;
grant update on table public.user_profiles to authenticated;
grant delete on table public.user_profiles to authenticated; 