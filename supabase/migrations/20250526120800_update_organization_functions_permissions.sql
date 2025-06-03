-- Migration: Update organization functions to handle permission checks
-- Purpose: Add permission validation to functions since RLS policies were simplified
-- Affected tables: Updates organization management functions
-- Special considerations: Functions now handle permission checks that were in RLS policies

-- update the invite_user_to_organization function to include proper permission checks
create or replace function public.invite_user_to_organization(
    org_id integer,
    user_email text,
    user_role text default 'member'
)
returns boolean as $$
declare
    target_user_id uuid;
    caller_role text;
begin
    -- verify caller has permission to invite users (must be owner or admin)
    select role into caller_role
    from public.organization_users 
    where user_id = auth.uid() 
    and organization_id = org_id 
    and status = 'active';
    
    if caller_role is null or caller_role not in ('owner', 'admin') then
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

-- create a function to check if user has admin permissions in organization
create or replace function public.user_has_org_permission(
    org_id integer,
    required_roles text[] default array['owner', 'admin']
)
returns boolean as $$
declare
    user_role text;
begin
    select role into user_role
    from public.organization_users
    where user_id = auth.uid()
    and organization_id = org_id
    and status = 'active';
    
    return user_role = any(required_roles);
end;
$$ language plpgsql security definer;

-- create a function to get organization members (with permission check)
create or replace function public.get_organization_members(org_id integer)
returns table (
    membership_id integer,
    user_id uuid,
    role text,
    status text,
    joined_at timestamp with time zone,
    invited_by uuid,
    display_name text,
    user_email text
) as $$
begin
    -- check if user has permission to view members
    if not public.user_has_org_permission(org_id, array['owner', 'admin', 'member']) then
        return;
    end if;
    
    return query
    select 
        ou.id as membership_id,
        ou.user_id,
        ou.role,
        ou.status,
        ou.joined_at,
        ou.invited_by,
        ou.display_name,
        u.email as user_email
    from public.organization_users ou
    join auth.users u on u.id = ou.user_id
    where ou.organization_id = org_id
    and ou.status = 'active'
    order by ou.joined_at desc;
end;
$$ language plpgsql security definer;

-- grant permissions for the new functions
grant execute on function public.user_has_org_permission(integer, text[]) to authenticated;
grant execute on function public.get_organization_members(integer) to authenticated; 