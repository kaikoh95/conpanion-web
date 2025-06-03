-- Migration: Create organization management functions
-- Purpose: Database functions for automatic organization creation on signup and context switching
-- Affected tables: Uses organizations, organization_users, user_profiles, user_organization_sessions
-- Special considerations: These functions handle automatic organization creation and security

-- function to handle new user signup with automatic organization creation
create or replace function public.handle_new_user()
returns trigger as $$
declare
    new_org_id integer;
    org_name text;
    org_slug text;
    counter integer := 0;
    unique_slug text;
begin
    -- extract name from metadata or use email
    org_name := coalesce(
        new.raw_user_meta_data->>'name',
        split_part(new.email, '@', 1)
    ) || '''s Organization';
    
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
        unique_slug, -- subdomain = slug initially
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
        invited_by,
        display_name
    )
    values (
        new_org_id, 
        new.id, 
        'owner', 
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
    );
    
    return new;
end;
$$ language plpgsql security definer;

-- create trigger for new user signup
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- function to get user's current organization context
create or replace function public.get_current_organization_id()
returns integer as $$
declare
    org_id integer;
begin
    select current_organization_id into org_id
    from public.user_profiles
    where id = auth.uid();
    
    return org_id;
end;
$$ language plpgsql security definer;

-- function to switch organization context
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
    
    -- update user's current organization
    update public.user_profiles 
    set 
        current_organization_id = new_org_id,
        last_organization_switch_at = timezone('utc'::text, now())
    where id = auth.uid();
    
    -- log organization session
    insert into public.user_organization_sessions (user_id, organization_id)
    values (auth.uid(), new_org_id);
    
    return true;
end;
$$ language plpgsql security definer;

-- function to get organizations for a user
create or replace function public.get_user_organizations()
returns table (
    organization_id integer,
    organization_name text,
    organization_slug text,
    user_role text,
    user_status text,
    joined_at timestamp with time zone,
    last_accessed_at timestamp with time zone,
    is_current boolean
) as $$
begin
    return query
    select 
        ou.organization_id,
        o.name as organization_name,
        o.slug as organization_slug,
        ou.role as user_role,
        ou.status as user_status,
        ou.joined_at,
        ou.last_accessed_at,
        (o.id = up.current_organization_id) as is_current
    from public.organization_users ou
    join public.organizations o on o.id = ou.organization_id
    left join public.user_profiles up on up.id = auth.uid()
    where ou.user_id = auth.uid()
    and ou.status = 'active'
    order by ou.last_accessed_at desc;
end;
$$ language plpgsql security definer;

-- function to create a new organization
create or replace function public.create_organization(
    org_name text,
    org_description text default null
)
returns integer as $$
declare
    new_org_id integer;
    org_slug text;
    counter integer := 0;
    unique_slug text;
begin
    -- generate unique slug
    org_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    unique_slug := org_slug;
    
    -- ensure slug uniqueness
    while exists (select 1 from public.organizations where slug = unique_slug) loop
        counter := counter + 1;
        unique_slug := org_slug || '-' || counter;
    end loop;
    
    -- create organization
    insert into public.organizations (name, slug, subdomain, description, created_by)
    values (
        org_name,
        unique_slug,
        unique_slug,
        org_description,
        auth.uid()
    )
    returning id into new_org_id;
    
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
        auth.uid(), 
        'owner', 
        auth.uid(),
        (select global_display_name from public.user_profiles where id = auth.uid())
    );
    
    return new_org_id;
end;
$$ language plpgsql security definer;

-- function to invite user to organization
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
    
    -- create organization membership
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

-- grant permissions for the functions
grant execute on function public.get_current_organization_id() to authenticated;
grant execute on function public.switch_organization_context(integer) to authenticated;
grant execute on function public.get_user_organizations() to authenticated;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.invite_user_to_organization(integer, text, text) to authenticated; 