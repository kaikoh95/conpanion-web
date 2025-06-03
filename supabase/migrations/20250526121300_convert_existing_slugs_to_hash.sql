-- Migration: Convert existing organization slugs to hash-based format
-- Purpose: Update any existing organizations to use hash-based slugs instead of name-based slugs
-- Affected tables: organizations
-- Special considerations: Preserves data while ensuring URL-safe, collision-resistant slugs

-- Function to convert existing organization slugs to hash format
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
        select id, name, slug, subdomain 
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
                subdomain = new_hash_slug,
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

-- Execute the slug conversion
do $$
declare
    org_count integer := 0;
    updated_count integer := 0;
    conversion_summary text;
begin
    raise notice 'Starting organization slug conversion to hash format...';
    
    -- Check if there are any organizations in the system
    select count(*) into org_count from public.organizations;
    
    if org_count = 0 then
        raise notice 'No organizations found - nothing to convert';
        return;
    end if;
    
    raise notice 'Found % organizations to process...', org_count;
    
    -- Convert slugs and count updates
    select count(*) into updated_count
    from public.convert_slugs_to_hash()
    where updated = true;
    
    -- Create summary
    conversion_summary := format(
        'Slug conversion completed: %s organizations processed, %s slugs updated to hash format',
        org_count, updated_count
    );
    
    raise notice '%', conversion_summary;
end;
$$;

-- Grant permissions for the conversion function
grant execute on function public.convert_slugs_to_hash() to authenticated;

-- Create a function to manually re-run the slug conversion if needed
create or replace function public.rerun_slug_conversion()
returns text as $$
declare
    org_count integer := 0;
    updated_count integer := 0;
    conversion_summary text;
begin
    -- Check if there are any organizations in the system
    select count(*) into org_count from public.organizations;
    
    if org_count = 0 then
        return 'No organizations found - nothing to convert';
    end if;
    
    -- Convert slugs and count updates
    select count(*) into updated_count
    from public.convert_slugs_to_hash()
    where updated = true;
    
    -- Create summary
    conversion_summary := format(
        'Re-conversion completed: %s organizations processed, %s slugs updated to hash format',
        org_count, updated_count
    );
    
    return conversion_summary;
end;
$$ language plpgsql security definer;

grant execute on function public.rerun_slug_conversion() to authenticated;

-- Add comment for documentation
comment on function public.convert_slugs_to_hash() is 'Converts existing organization slugs from name-based to hash-based format for better URL safety and collision resistance';
comment on function public.rerun_slug_conversion() is 'Helper function to manually re-run slug conversion if needed'; 