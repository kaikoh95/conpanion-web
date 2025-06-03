-- Migration to sync emails from auth.users to user_profiles
-- This migration:
-- 1. Ensures user_profiles has an email column
-- 2. Creates a trigger to automatically copy emails for new users
-- 3. Updates all existing user_profiles with emails from auth.users

-- Step 1: Add email column to user_profiles if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'email'
    ) THEN
        ALTER TABLE public.user_profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- Step 2: Create function and trigger to sync emails on user creation/update
CREATE OR REPLACE FUNCTION public.sync_user_email_to_profile()
RETURNS TRIGGER AS $$
BEGIN
    -- Insert or update the user profile with the email from auth.users
    INSERT INTO public.user_profiles (id, email, updated_at)
    VALUES (NEW.id, NEW.email, NOW())
    ON CONFLICT (id) 
    DO UPDATE SET 
        email = EXCLUDED.email,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS sync_user_email_trigger ON auth.users;

-- Create trigger to sync email when a user is created or updated
CREATE TRIGGER sync_user_email_trigger
AFTER INSERT OR UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_user_email_to_profile();

-- Step 3: Update all existing user_profiles with emails from auth.users
-- This ensures all existing profiles get updated
DO $$
DECLARE
    _user RECORD;
BEGIN
    FOR _user IN 
        SELECT id, email FROM auth.users
    LOOP
        -- Update existing profiles
        INSERT INTO public.user_profiles (id, email, updated_at)
        VALUES (_user.id, _user.email, NOW())
        ON CONFLICT (id) 
        DO UPDATE SET 
            email = EXCLUDED.email,
            updated_at = NOW();
    END LOOP;
END $$;

-- Add a comment to the email column
COMMENT ON COLUMN public.user_profiles.email IS 'User email synchronized from auth.users'; 