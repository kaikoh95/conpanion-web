-- Migration: Clean up organizations table and remove unused tables
-- Purpose: Remove unnecessary columns from organizations table and drop unused tables
-- Affected tables: organizations, user_organization_sessions
-- Special considerations: Removes billing, multi-tenancy, and enterprise features not needed

-- Drop unused indexes first (if they exist)
drop index if exists public.organizations_subdomain_idx;
drop index if exists public.organizations_plan_type_idx;

-- Drop the entire user_organization_sessions table (not needed)
drop table if exists public.user_organization_sessions cascade;

-- Remove unused columns from organizations table
alter table public.organizations 
    drop column if exists max_members,
    drop column if exists domain,
    drop column if exists subdomain,
    drop column if exists plan_type,
    drop column if exists subscription_id,
    drop column if exists billing_email,
    drop column if exists data_region,
    drop column if exists retention_days;

-- Remove display_name from organization_users table (can get from user_profiles)
alter table public.organization_users 
    drop column if exists display_name;

-- Update any functions that might reference the removed columns
-- (The slug conversion function was using subdomain, so let's update it)
create or replace function public.convert_slugs_to_hash()
returns table (
    org_id integer,
    old_slug text,
    new_slug text,
    updated boolean
) as $$
declare
    org_record record;
    new_hash_slug text;
    slug_updated boolean;
begin
    -- Process all organizations
    for org_record in 
        select id, name, slug 
        from public.organizations
        order by id
    loop
        slug_updated := false;
        
        -- Check if the slug looks like a hash (8 characters, alphanumeric)
        -- If not, convert it to a hash-based slug
        if length(org_record.slug) != 8 OR 
           org_record.slug !~ '^[a-zA-Z0-9]{8}$' OR
           org_record.slug ~ '[^a-zA-Z0-9]' then
            
            -- Generate a new hash-based slug
            new_hash_slug := public.generate_organization_slug();
            
            -- Update the organization with the new hash-based slug
            update public.organizations
            set 
                slug = new_hash_slug,
                updated_at = now()
            where id = org_record.id;
            
            slug_updated := true;
            
            raise notice 'Updated organization "%" (ID: %) from slug "%" to hash "%"', 
                org_record.name, org_record.id, org_record.slug, new_hash_slug;
        else
            -- Slug is already hash-based
            new_hash_slug := org_record.slug;
            raise notice 'Organization "%" (ID: %) already has hash-based slug "%"', 
                org_record.name, org_record.id, org_record.slug;
        end if;
        
        -- Return the results for this organization
        org_id := org_record.id;
        old_slug := org_record.slug;
        new_slug := new_hash_slug;
        updated := slug_updated;
        
        return next;
    end loop;
end;
$$ language plpgsql security definer;

-- Update organization creation functions to not include removed columns
create or replace function public.ensure_user_has_organization(target_user_id uuid)
returns integer as $$
declare
    new_org_id integer;
    org_name text;
    org_slug text;
    user_email text;
    existing_org_count integer;
begin
    -- Check if user already has active organizations
    select count(*) into existing_org_count 
    from public.organization_users 
    where user_id = target_user_id and status = 'active';
    
    if existing_org_count > 0 then
        -- User already has organizations, return the first one
        select organization_id into new_org_id
        from public.organization_users 
        where user_id = target_user_id and status = 'active'
        order by joined_at asc
        limit 1;
        return new_org_id;
    end if;
    
    -- Get user email for organization name
    select email into user_email from auth.users where id = target_user_id;
    
    if user_email is null then
        raise exception 'User email not found for user %', target_user_id;
    end if;
    
    -- Extract name from email
    org_name := split_part(user_email, '@', 1) || '''s Organization';
    
    -- Generate unique hash-based slug
    org_slug := public.generate_organization_slug();
    
    -- Create organization (simplified schema)
    insert into public.organizations (name, slug, created_by)
    values (
        org_name,
        org_slug,
        target_user_id
    )
    returning id into new_org_id;
    
    -- Create user profile if it doesn't exist
    insert into public.user_profiles (
        id, 
        global_display_name, 
        current_organization_id,
        default_organization_id
    )
    values (
        target_user_id,
        split_part(user_email, '@', 1),
        new_org_id,
        new_org_id
    )
    on conflict (id) do update set
        current_organization_id = coalesce(user_profiles.current_organization_id, new_org_id),
        default_organization_id = coalesce(user_profiles.default_organization_id, new_org_id);
    
    -- Add user to organization as owner
    insert into public.organization_users (
        organization_id, 
        user_id, 
        role, 
        invited_by
    )
    values (
        new_org_id, 
        target_user_id, 
        'owner', 
        target_user_id
    );
    
    return new_org_id;
end;
$$ language plpgsql security definer;

-- Update create_organization function
create or replace function public.create_organization(
    org_name text,
    org_description text default null
)
returns integer as $$
declare
    new_org_id integer;
    org_slug text;
begin
    -- Generate unique hash-based slug
    org_slug := public.generate_organization_slug();
    
    -- Create organization (simplified schema)
    insert into public.organizations (name, slug, description, created_by)
    values (
        org_name,
        org_slug,
        org_description,
        auth.uid()
    )
    returning id into new_org_id;
    
    -- Add user to organization as owner
    insert into public.organization_users (
        organization_id, 
        user_id, 
        role, 
        invited_by
    )
    values (
        new_org_id, 
        auth.uid(), 
        'owner', 
        auth.uid()
    );
    
    return new_org_id;
end;
$$ language plpgsql security definer;

-- Update handle_new_user function
create or replace function public.handle_new_user()
returns trigger as $$
declare
    new_org_id integer;
    org_name text;
    org_slug text;
begin
    -- extract name from metadata or use email
    org_name := coalesce(
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    ) || '''s Organization';
    
    -- generate unique hash-based slug
    org_slug := public.generate_organization_slug();
    
    -- create organization (simplified schema)
    insert into public.organizations (name, slug, created_by)
    values (
        org_name,
        org_slug,
        new.id
    )
    returning id into new_org_id;
    
    -- create user profile
    insert into public.user_profiles (
        id, 
        global_display_name, 
        current_organization_id,
        default_organization_id
    )
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new_org_id,
        new_org_id
    );
    
    -- add user to organization as owner
    insert into public.organization_users (
        organization_id, 
        user_id, 
        role, 
        invited_by
    )
    values (
        new_org_id, 
        new.id, 
        'owner', 
        new.id
    );
    
    return new;
end;
$$ language plpgsql security definer;

-- Update the get_or_create_default_organization function
create or replace function public.get_or_create_default_organization()
returns integer as $$
declare
    default_org_id integer;
    default_org_name text := 'Conpanion Internal';
    default_org_slug text;
    first_user_id uuid;
begin
    -- Check if we already have a default organization for legacy data
    select id into default_org_id
    from public.organizations
    where name = default_org_name
    limit 1;
    
    if default_org_id is not null then
        return default_org_id;
    end if;
    
    -- Must have at least one user to create an organization
    select id into first_user_id
    from auth.users 
    order by created_at asc 
    limit 1;
    
    if first_user_id is null then
        raise exception 'Cannot create default organization: no users exist in the system';
    end if;
    
    -- Generate unique slug for the default organization
    default_org_slug := public.generate_organization_slug();
    
    -- Create a default organization for legacy data migration (simplified schema)
    insert into public.organizations (
        name, 
        slug, 
        description,
        created_by
    )
    values (
        default_org_name,
        default_org_slug,
        'Internal development organization for Conpanion team',
        first_user_id
    )
    returning id into default_org_id;
    
    return default_org_id;
end;
$$ language plpgsql security definer;

-- Update switch_organization_context function to remove session logging
create or replace function public.switch_organization_context(new_org_id integer)
returns boolean as $$
begin
    -- verify user has access to the organization
    if not exists (
        select 1 from public.organization_users 
        where user_id = auth.uid() 
        and organization_id = new_org_id 
        and status = 'active'
    ) then
        return false;
    end if;
    
    -- update user's current organization (removed session logging)
    update public.user_profiles 
    set 
        current_organization_id = new_org_id,
        last_organization_switch_at = timezone('utc'::text, now())
    where id = auth.uid();
    
    return true;
end;
$$ language plpgsql security definer;

-- Update invite_user_to_organization function to remove display_name
create or replace function public.invite_user_to_organization(
    org_id integer,
    user_email text,
    user_role text default 'member'
)
returns boolean as $$
declare
    target_user_id uuid;
begin
    -- verify caller has permission to invite users
    if not exists (
        select 1 from public.organization_users 
        where user_id = auth.uid() 
        and organization_id = org_id 
        and role in ('owner', 'admin')
        and status = 'active'
    ) then
        return false;
    end if;
    
    -- find user by email
    select id into target_user_id
    from auth.users
    where email = user_email;
    
    if target_user_id is null then
        return false;
    end if;
    
    -- check if user is already a member
    if exists (
        select 1 from public.organization_users 
        where user_id = target_user_id 
        and organization_id = org_id
    ) then
        return false;
    end if;
    
    -- create organization membership (removed display_name)
    insert into public.organization_users (
        organization_id, 
        user_id, 
        role, 
        status,
        invited_by,
        invited_at
    )
    values (
        org_id, 
        target_user_id, 
        user_role, 
        'active',
        auth.uid(),
        timezone('utc'::text, now())
    );
    
    return true;
end;
$$ language plpgsql security definer;

-- Add comment for documentation
comment on table public.organizations is 'Simplified organizations table with only essential fields: id, name, slug, description, created_by, timestamps, is_active';

-- Final cleanup summary
do $$
begin
    raise notice 'Organizations cleanup completed - removed unused columns from organizations table, dropped user_organization_sessions table, removed display_name from organization_users, and updated all functions';
end;
$$; 