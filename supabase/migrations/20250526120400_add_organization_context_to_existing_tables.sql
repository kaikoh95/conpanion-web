-- Migration: Add organization context to existing tables
-- Purpose: Update existing tables to support multi-tenancy by adding organization_id references
-- Affected tables: projects
-- Special considerations: Maintains backward compatibility while adding organization scoping

-- add organization_id to projects table
alter table public.projects 
    add column organization_id integer references public.organizations(id);

-- create indexes for the new organization_id columns
create index projects_organization_id_idx on public.projects(organization_id);

-- update unique constraints to be organization-scoped

-- projects: ensure unique names within an organization
alter table public.projects 
    drop constraint if exists projects_name_key,
    add constraint projects_org_name_unique unique(organization_id, name);

-- update rls policies to be organization-aware

-- drop existing policies for projects
drop policy if exists "Users can view projects they own or are members of" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can update projects they own" on public.projects;
drop policy if exists "Users can delete projects they own" on public.projects;

-- create new organization-scoped policies for projects
create policy "users can view projects in their organizations"
on public.projects
for select
to authenticated
using (
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() and status = 'active'
    )
);

create policy "organization members can create projects"
on public.projects
for insert
to authenticated
with check (
    created_by = auth.uid() and
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin', 'member')
        and status = 'active'
    )
);

create policy "project owners can update projects"
on public.projects
for update
to authenticated
using (
    created_by = auth.uid() or
    owner_id = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
)
with check (
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin', 'member')
        and status = 'active'
    )
);

create policy "project owners can delete projects"
on public.projects
for delete
to authenticated
using (
    created_by = auth.uid() or
    owner_id = auth.uid() or
    organization_id in (
        select organization_id from public.organization_users 
        where user_id = auth.uid() 
        and role in ('owner', 'admin')
        and status = 'active'
    )
);
