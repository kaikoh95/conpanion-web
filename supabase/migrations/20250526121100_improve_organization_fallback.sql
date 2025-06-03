-- Migration: Improve organization fallback system
-- Purpose: Ensure all users have organizations, even existing ones
-- Affected tables: organizations, organization_users, user_profiles
-- Special considerations: Adds runtime checks and fallbacks

-- Enhanced function to ensure user has an organization (with runtime fallback)
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
    
    -- Generate unique hash-based slug (using the new function)
    org_slug := public.generate_organization_slug();
    
    -- Create organization
    insert into public.organizations (name, slug, subdomain, created_by)
    values (
        org_name,
        org_slug,
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

-- Update get_user_organizations to ensure user has an organization
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
declare
    user_org_count integer;
    ensured_org_id integer;
begin
    -- Check if user has any organizations
    select count(*) into user_org_count
    from public.organization_users ou
    where ou.user_id = auth.uid() and ou.status = 'active';
    
    -- If user has no organizations, create one
    if user_org_count = 0 then
        select public.ensure_user_has_organization(auth.uid()) into ensured_org_id;
        
        -- Log that we created an organization
        raise notice 'Created fallback organization % for user %', ensured_org_id, auth.uid();
    end if;
    
    -- Return user's organizations
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

-- Create or update organizations for ALL existing users (including any new ones)
do $$
declare
    user_record record;
    new_org_id integer;
    user_count integer := 0;
    org_created_count integer := 0;
begin
    -- Get all users who don't have active organizations
    for user_record in 
        select u.id, u.email from auth.users u
        where u.id not in (
            select distinct user_id 
            from public.organization_users 
            where status = 'active'
        )
    loop
        user_count := user_count + 1;
        
        begin
            select public.ensure_user_has_organization(user_record.id) into new_org_id;
            if new_org_id is not null then
                org_created_count := org_created_count + 1;
                raise notice 'Created organization % for user % (%)', new_org_id, user_record.email, user_record.id;
            end if;
        exception when others then
            raise notice 'Failed to create organization for user % (%): %', user_record.email, user_record.id, SQLERRM;
        end;
    end loop;
    
    raise notice 'Organization creation summary: checked % users, created % organizations', user_count, org_created_count;
end;
$$;

-- Grant permissions
grant execute on function public.ensure_user_has_organization(uuid) to authenticated;

-- Also update the create_organization_for_existing_user function to use hash-based slugs
create or replace function public.create_organization_for_existing_user(target_user_id uuid)
returns integer as $$
begin
    -- Use the new ensure function which handles hash-based slugs
    return public.ensure_user_has_organization(target_user_id);
end;
$$ language plpgsql security definer; 