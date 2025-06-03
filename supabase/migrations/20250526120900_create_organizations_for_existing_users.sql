-- Migration: Create organizations for existing users
-- Purpose: Set up organizations for users who existed before the organization system
-- Affected tables: organizations, organization_users, user_profiles
-- Special considerations: Only creates organizations for users who don't already have them

-- function to create organization for existing user
create or replace function public.create_organization_for_existing_user(target_user_id uuid)
returns integer as $$
declare
    new_org_id integer;
    org_name text;
    org_slug text;
    user_email text;
    counter integer := 0;
    unique_slug text;
begin
    -- check if user already has organizations
    if exists (
        select 1 from public.organization_users 
        where user_id = target_user_id and status = 'active'
    ) then
        -- user already has organizations, return null
        return null;
    end if;
    
    -- get user email for organization name
    select email into user_email from auth.users where id = target_user_id;
    
    if user_email is null then
        return null;
    end if;
    
    -- extract name from email
    org_name := split_part(user_email, '@', 1) || '''s Organization';
    
    -- generate unique slug
    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    unique_slug := org_slug;
    
    -- ensure slug uniqueness
    while exists (select 1 from public.organizations where slug = unique_slug) loop
        counter := counter + 1;
        unique_slug := org_slug || '-' || counter;
    end loop;
    
    -- create organization
    insert into public.organizations (name, slug, subdomain, created_by)
    values (
        org_name,
        unique_slug,
        unique_slug,
        target_user_id
    )
    returning id into new_org_id;
    
    -- create user profile if it doesn't exist
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
    
    -- add user to organization as owner
    insert into public.organization_users (
        organization_id, 
        user_id, 
        role, 
        invited_by,
        display_name
    )
    values (
        new_org_id, 
        target_user_id, 
        'owner', 
        target_user_id,
        split_part(user_email, '@', 1)
    );
    
    return new_org_id;
end;
$$ language plpgsql security definer;

-- create organizations for all existing users who don't have them
do $$
declare
    user_record record;
    new_org_id integer;
begin
    for user_record in 
        select id from auth.users 
        where id not in (
            select distinct user_id from public.organization_users where status = 'active'
        )
    loop
        select public.create_organization_for_existing_user(user_record.id) into new_org_id;
        if new_org_id is not null then
            raise notice 'Created organization % for user %', new_org_id, user_record.id;
        end if;
    end loop;
end;
$$;

-- grant permission for the function
grant execute on function public.create_organization_for_existing_user(uuid) to authenticated; 