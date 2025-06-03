-- Migration: Add project creation to signup process
-- Purpose: Create default project and project membership during user signup
-- Affected tables: Updates handle_new_user trigger function
-- Special considerations: Ensures new users have a complete setup (org + project) from signup

-- Update the handle_new_user function to also create projects
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    new_org_id integer;
    new_project_id integer;
    org_name text;
    org_slug text;
    project_name text;
    user_display_name text;
    step_name text;
BEGIN
    -- Log the start of user creation
    RAISE LOG 'Starting handle_new_user for user: % (email: %)', NEW.id, NEW.email;
    
    BEGIN
        step_name := 'extract_display_name';
        -- Extract display name from metadata or use email
        user_display_name := coalesce(
            NEW.raw_user_meta_data->>'name',
            split_part(NEW.email, '@', 1),
            'User'
        );
        
        step_name := 'create_organization_name';
        -- Create organization name
        org_name := user_display_name || '''s Organization';
        
        step_name := 'generate_organization_slug';
        -- Generate unique hash-based slug
        org_slug := public.generate_organization_slug();
        
        RAISE LOG 'User % - Creating organization: name=%, slug=%', NEW.id, org_name, org_slug;
        
        step_name := 'insert_organization';
        -- Create organization
        INSERT INTO public.organizations (name, slug, created_by, is_active, created_at, updated_at, description)
        VALUES (
            org_name,
            org_slug,
            NEW.id,
            true,
            NOW(),
            NOW(),
            NULL
        )
        RETURNING id INTO new_org_id;
        
        RAISE LOG 'User % - Organization created with ID: %', NEW.id, new_org_id;
        
        step_name := 'insert_user_profile';
        -- Create user profile
        INSERT INTO public.user_profiles (
            id, 
            global_display_name, 
            global_avatar_url,
            current_organization_id,
            default_organization_id,
            email
        )
        VALUES (
            NEW.id,
            user_display_name,
            NULL,
            new_org_id,
            new_org_id,
            NEW.email
        );
        
        RAISE LOG 'User % - User profile created', NEW.id;
        
        step_name := 'create_project_name';
        -- Create default project name
        project_name := user_display_name || '''s Project';
        
        step_name := 'insert_project';
        -- Create default project
        INSERT INTO public.projects (
            name,
            description,
            organization_id,
            owner_id,
            created_by
        )
        VALUES (
            project_name,
            'Default project for ' || user_display_name,
            new_org_id,
            NEW.id,
            NEW.id
        )
        RETURNING id INTO new_project_id;
        
        RAISE LOG 'User % - Default project created with ID: %', NEW.id, new_project_id;
        
        step_name := 'insert_project_membership';
        -- Add user to project as owner
        INSERT INTO public.projects_users (
            project_id,
            user_id,
            role,
            status,
            created_by
        )
        VALUES (
            new_project_id,
            NEW.id,
            'owner',
            'active',
            NEW.id
        );
        
        RAISE LOG 'User % - Project membership created', NEW.id;
        
        step_name := 'insert_organization_membership';
        -- Add user to organization as owner
        INSERT INTO public.organization_users (
            organization_id, 
            user_id, 
            role, 
            invited_by,
            status,
            joined_at,
            current_project_id,
            default_project_id
        )
        VALUES (
            new_org_id, 
            NEW.id, 
            'owner', 
            NEW.id,
            'active',
            NOW(),
            new_project_id,
            new_project_id
        );
        
        RAISE LOG 'User % - Organization membership created', NEW.id;
        
        RETURN NEW;
        
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Error in handle_new_user step "%" for user %: % (SQLSTATE: %)', 
                  step_name, NEW.id, SQLERRM, SQLSTATE;
        
        -- Clean up any created records if there was an error
        BEGIN
            IF new_project_id IS NOT NULL THEN
                DELETE FROM public.projects_users WHERE project_id = new_project_id AND user_id = NEW.id;
                DELETE FROM public.projects WHERE id = new_project_id;
                RAISE LOG 'Cleaned up project % for failed user %', new_project_id, NEW.id;
            END IF;
            
            IF new_org_id IS NOT NULL THEN
                DELETE FROM public.organization_users WHERE organization_id = new_org_id AND user_id = NEW.id;
                DELETE FROM public.user_profiles WHERE id = NEW.id;
                DELETE FROM public.organizations WHERE id = new_org_id;
                RAISE LOG 'Cleaned up organization % for failed user %', new_org_id, NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to clean up after error for user %: %', NEW.id, SQLERRM;
        END;
        
        -- Return the user record anyway to not prevent account creation
        RETURN NEW;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger is properly set up (drop and recreate to be sure)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
