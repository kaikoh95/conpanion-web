-- Migration: Create user_organization_sessions table for audit and analytics
-- Purpose: Track user's organization context switching for audit, analytics, and session management
-- Affected tables: Creates user_organization_sessions table
-- Special considerations: Used for audit trails and understanding organization usage patterns

-- create user_organization_sessions table to track organization context switching
create table if not exists public.user_organization_sessions (
    id serial primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    organization_id integer not null references public.organizations(id) on delete cascade,
    session_start timestamp with time zone default timezone('utc'::text, now()) not null,
    session_end timestamp with time zone,
    ip_address inet,
    user_agent text,
    
    -- session metadata
    actions_performed integer default 0,
    last_activity_at timestamp with time zone default timezone('utc'::text, now())
);

-- create indexes for better query performance
create index user_organization_sessions_user_id_idx on public.user_organization_sessions(user_id);
create index user_organization_sessions_organization_id_idx on public.user_organization_sessions(organization_id);
create index user_organization_sessions_session_start_idx on public.user_organization_sessions(session_start);
create index user_organization_sessions_last_activity_idx on public.user_organization_sessions(last_activity_at);

-- enable row level security
alter table public.user_organization_sessions enable row level security;

-- rls policies for user_organization_sessions table

-- select policy: users can view their own sessions, organization admins can view sessions in their org
create policy "users can view relevant organization sessions"
on public.user_organization_sessions
for select
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

-- insert policy: users can create their own session records
create policy "users can create their own session records"
on public.user_organization_sessions
for insert
to authenticated
with check (user_id = auth.uid());

-- update policy: users can update their own sessions
create policy "users can update their own sessions"
on public.user_organization_sessions
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- delete policy: users can delete their own sessions, organization admins can delete sessions in their org
create policy "users can manage relevant organization sessions"
on public.user_organization_sessions
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

-- grant permissions for user_organization_sessions table
grant select on table public.user_organization_sessions to authenticated;
grant insert on table public.user_organization_sessions to authenticated;
grant update on table public.user_organization_sessions to authenticated;
grant delete on table public.user_organization_sessions to authenticated; 