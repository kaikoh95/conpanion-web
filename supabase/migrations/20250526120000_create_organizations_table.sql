-- Migration: Create organizations table for multi-tenant architecture
-- Purpose: Establish the core organizations table to support multi-tenancy where users can belong to multiple organizations
-- Affected tables: Creates organizations table
-- Special considerations: Includes unique constraints on slug and subdomain for URL routing

-- create organizations table with comprehensive multi-tenant support
create table if not exists public.organizations (
    id serial primary key,
    name text not null,
    slug text unique not null, -- for url-friendly organization access (e.g., /org/acme-corp)
    description text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    created_by uuid not null references auth.users(id),
    
    -- organization settings
    max_members integer default 100,
    is_active boolean default true not null,
    
    -- multi-tenancy settings
    domain text, -- custom domain support (e.g., acme.yourapp.com)
    subdomain text unique, -- subdomain for organization (e.g., acme.yourapp.com)
    
    -- billing/subscription info
    plan_type text default 'free' not null check (plan_type in ('free', 'starter', 'professional', 'enterprise')),
    subscription_id text,
    billing_email text,
    
    -- compliance and data retention
    data_region text default 'us-east-1',
    retention_days integer default 365
);

-- create indexes for better query performance
create index organizations_created_by_idx on public.organizations(created_by);
create index organizations_slug_idx on public.organizations(slug);
create index organizations_subdomain_idx on public.organizations(subdomain);
create index organizations_plan_type_idx on public.organizations(plan_type);
create index organizations_is_active_idx on public.organizations(is_active);

-- enable row level security
alter table public.organizations enable row level security;

-- add updated_at trigger
create trigger handle_organizations_updated_at
    before update on public.organizations
    for each row
    execute function public.handle_updated_at();

-- rls policies for organizations table (simplified initially)

-- select policy: users can view organizations they created (will be updated later)
create policy "users can view organizations they created"
on public.organizations
for select
to authenticated
using (created_by = auth.uid());

-- insert policy: authenticated users can create organizations
create policy "authenticated users can create organizations"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

-- update policy: organization creators can update organizations (will be updated later)
create policy "organization creators can update organizations"
on public.organizations
for update
to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid());

-- delete policy: organization creators can delete organizations (will be updated later)
create policy "organization creators can delete organizations"
on public.organizations
for delete
to authenticated
using (created_by = auth.uid());

-- grant permissions for organizations table
grant select on table public.organizations to authenticated;
grant insert on table public.organizations to authenticated;
grant update on table public.organizations to authenticated;
grant delete on table public.organizations to authenticated; 