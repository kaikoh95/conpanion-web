-- Migration: Update organization slug generation to use short hashes
-- Purpose: Replace name-based slugs with secure, short hash-based slugs
-- Affected tables: organizations (slug column behavior)
-- Special considerations: Generates 8-character Base62 slugs that are URL-safe and unique

-- Function to generate a short, unique hash-based slug
create or replace function public.generate_organization_slug()
returns text as $$
declare
    slug_candidate text;
    attempt_count integer := 0;
    max_attempts integer := 100;
begin
    loop
        -- Generate 8-character Base62 slug using timestamp and random data
        -- Base62 uses: 0-9, a-z, A-Z (62 characters total)
        slug_candidate := encode(
            digest(
                extract(epoch from now())::text || 
                random()::text || 
                attempt_count::text, 
                'sha256'
            )::bytea, 
            'base64'
        );
        
        -- Clean up base64 to make it Base62 (URL-safe)
        slug_candidate := translate(slug_candidate, '+/=', '');
        
        -- Take first 8 characters
        slug_candidate := substring(slug_candidate from 1 for 16);
        
        -- Ensure it starts with a letter (good practice for URLs)
        if substring(slug_candidate from 1 for 1) ~ '[0-9]' then
            slug_candidate := 'o' || substring(slug_candidate from 2);
        end if;
        
        -- Check uniqueness
        if not exists (select 1 from public.organizations where slug = slug_candidate) then
            return slug_candidate;
        end if;
        
        attempt_count := attempt_count + 1;
        if attempt_count >= max_attempts then
            -- Fallback to UUID-based slug if we can't find a unique hash
            return 'org-' || replace(gen_random_uuid()::text, '-', '')::text;
        end if;
    end loop;
end;
$$ language plpgsql;

-- Update the handle_new_user function to use hash-based slugs
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
    
    -- create organization
    insert into public.organizations (name, slug, subdomain, created_by)
    values (
        org_name,
        org_slug,
        org_slug, -- subdomain = slug initially
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

-- Update the create_organization function to use hash-based slugs
create or replace function public.create_organization(
    org_name text,
    org_description text default null
)
returns integer as $$
declare
    new_org_id integer;
    org_slug text;
begin
    -- generate unique hash-based slug
    org_slug := public.generate_organization_slug();
    
    -- create organization
    insert into public.organizations (name, slug, subdomain, description, created_by)
    values (
        org_name,
        org_slug,
        org_slug,
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

-- Update the create_organization_for_existing_user function to use hash-based slugs
create or replace function public.create_organization_for_existing_user(target_user_id uuid)
returns integer as $$
declare
    new_org_id integer;
    org_name text;
    org_slug text;
    user_email text;
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
    
    -- generate unique hash-based slug
    org_slug := public.generate_organization_slug();
    
    -- create organization
    insert into public.organizations (name, slug, subdomain, created_by)
    values (
        org_name,
        org_slug,
        org_slug,
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

-- Grant execute permission on the new slug generation function
grant execute on function public.generate_organization_slug() to authenticated; 