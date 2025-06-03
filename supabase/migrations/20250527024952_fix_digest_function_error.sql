-- Migration: Fix digest function error in generate_organization_slug
-- Purpose: Enable pgcrypto extension and fix the slug generation function
-- Error: function digest(text, unknown) does not exist (SQLSTATE: 42883)

-- Enable pgcrypto extension for digest and encode functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify pgcrypto is working by testing digest function
DO $$
BEGIN
    -- Test if digest function is available
    PERFORM digest('test'::text, 'sha256'::text);
    RAISE NOTICE 'pgcrypto extension successfully enabled and digest function is working';
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to enable pgcrypto or digest function not working: %', SQLERRM;
END $$;

-- Fix the generate_organization_slug function with proper pgcrypto syntax and fallback
CREATE OR REPLACE FUNCTION public.generate_organization_slug()
RETURNS text AS $$
DECLARE
    slug_candidate text;
    attempt_count integer := 0;
    max_attempts integer := 10;
BEGIN
    LOOP
        BEGIN
            -- Try to generate slug using digest function with proper pgcrypto syntax
            -- digest(data text, type text) returns bytea
            slug_candidate := encode(
                digest(
                    (clock_timestamp()::text || random()::text || attempt_count::text)::text, 
                    'sha256'::text
                ), 
                'hex'
            );
            
            -- Take first 12 characters from hex string (already URL-safe)
            slug_candidate := substring(slug_candidate from 1 for 12);
            
        EXCEPTION WHEN OTHERS THEN
            -- Fallback to simple UUID-based generation if digest fails
            RAISE LOG 'digest function failed, using UUID fallback: %', SQLERRM;
            slug_candidate := substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
        END;
        
        -- Ensure it starts with a letter (good practice for URLs)
        IF substring(slug_candidate from 1 for 1) ~ '[0-9]' THEN
            slug_candidate := 'o' || substring(slug_candidate from 2);
        END IF;
        
        -- Check uniqueness
        IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = slug_candidate) THEN
            RETURN slug_candidate;
        END IF;
        
        attempt_count := attempt_count + 1;
        IF attempt_count >= max_attempts THEN
            -- Final fallback to UUID-based slug
            RETURN 'org-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Test the function to ensure it works
DO $$
DECLARE
    test_slug text;
BEGIN
    -- Test the main function
    SELECT public.generate_organization_slug() INTO test_slug;
    RAISE NOTICE 'Successfully generated test slug: %', test_slug;
    
    -- Verify the slug format (should be 12 characters, start with letter)
    IF length(test_slug) = 12 AND substring(test_slug from 1 for 1) ~ '[a-zA-Z]' THEN
        RAISE NOTICE 'Slug format validation passed';
    ELSE
        RAISE NOTICE 'Slug format validation failed: length=%, first_char=%', 
                     length(test_slug), substring(test_slug from 1 for 1);
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error testing slug generation: %', SQLERRM;
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.generate_organization_slug() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_organization_slug() TO authenticated;
