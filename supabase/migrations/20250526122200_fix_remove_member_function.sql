-- Migration to fix the member removal functionality
-- This migration creates a secure database function to handle member removal

-- Drop existing functions first to avoid conflicts
DROP FUNCTION IF EXISTS public.remove_organization_member(INT);
DROP FUNCTION IF EXISTS public.invite_organization_member(INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.check_user_exists_by_email(TEXT);
DROP FUNCTION IF EXISTS public.get_user_id_by_email(TEXT);

-- Create helper function to check if user exists by email
CREATE OR REPLACE FUNCTION public.check_user_exists_by_email(
  user_email TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $check_user_exists$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users 
    WHERE email = user_email
  );
END;
$check_user_exists$;

-- Create helper function to get user ID by email
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(
  user_email TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
AS $get_user_id$
DECLARE
  user_uuid UUID;
BEGIN
  SELECT id INTO user_uuid
  FROM auth.users 
  WHERE email = user_email;
  
  RETURN user_uuid;
END;
$get_user_id$;

-- Create a function to safely remove members from organizations
-- This approach is more robust than direct deletion and can be controlled with RLS
CREATE OR REPLACE FUNCTION public.remove_organization_member(
  membership_id INT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $remove_member$
DECLARE
  v_membership RECORD;
  v_user_id UUID;
  v_organization_id INT;
  v_is_last_owner BOOLEAN;
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
BEGIN
  -- Get membership details
  SELECT * INTO v_membership
  FROM public.organization_users
  WHERE id = membership_id;
  
  -- Check if membership exists
  IF v_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Membership not found',
      'error_code', 'MEMBERSHIP_NOT_FOUND'
    );
  END IF;
  
  -- Store user_id and organization_id for later use
  v_user_id := v_membership.user_id;
  v_organization_id := v_membership.organization_id;
  
  -- Get caller's membership in the same organization
  SELECT * INTO v_caller_membership
  FROM public.organization_users
  WHERE organization_id = v_organization_id
  AND user_id = v_caller_id
  AND status = 'active';
  
  -- Check caller's permissions
  IF v_caller_membership IS NULL OR 
     (v_caller_membership.role NOT IN ('owner', 'admin') AND v_caller_id != v_user_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be an owner, admin, or removing yourself.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- If target is an owner, check if they're the last owner
  IF v_membership.role = 'owner' THEN
    SELECT COUNT(*) = 1 INTO v_is_last_owner
    FROM public.organization_users
    WHERE organization_id = v_organization_id
    AND role = 'owner'
    AND status = 'active';
    
    IF v_is_last_owner THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Cannot remove the last owner of an organization',
        'error_code', 'LAST_OWNER'
      );
    END IF;
  END IF;
  
  -- If removing someone else as admin, ensure target is not an owner
  IF v_caller_membership.role = 'admin' AND v_caller_id != v_user_id AND v_membership.role = 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Admins cannot remove owners',
      'error_code', 'ADMIN_CANNOT_REMOVE_OWNER'
    );
  END IF;
  
  -- All checks passed, update the membership status to 'deactivated'
  -- This is safer than deletion and preserves historical data
  UPDATE public.organization_users
  SET 
    status = 'deactivated',
    updated_at = NOW(),
    left_at = NOW()
  WHERE id = membership_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', membership_id,
    'user_id', v_user_id,
    'organization_id', v_organization_id
  );
END;
$remove_member$;

-- Create a function to handle inviting existing users to organizations
-- For new users, use the Edge Function that handles Supabase auth invitations
CREATE OR REPLACE FUNCTION public.invite_existing_user_to_organization(
  p_organization_id INT,
  p_user_id UUID,
  p_role TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $invite_existing$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_existing_membership RECORD;
  v_membership_id INT;
BEGIN
  -- Check if caller has permission to invite members
  SELECT * INTO v_caller_membership
  FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';
  
  IF v_caller_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be an owner or admin to invite users.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Check if role is valid
  IF p_role NOT IN ('owner', 'admin', 'member', 'guest') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid role. Role must be one of: owner, admin, member, guest',
      'error_code', 'INVALID_ROLE'
    );
  END IF;
  
  -- Prevent non-owners from creating owners
  IF p_role = 'owner' AND v_caller_membership.role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Only owners can create other owners',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Check if user already has an active membership
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = p_user_id
  AND status = 'active';
  
  IF v_existing_membership IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User is already an active member of this organization',
      'error_code', 'ALREADY_MEMBER',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- Check if user has a pending invitation
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = p_user_id
  AND status = 'pending';
  
  IF v_existing_membership IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User already has a pending invitation to this organization',
      'error_code', 'PENDING_INVITATION',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- Check if user was previously a member and is now deactivated
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = p_user_id
  AND status = 'deactivated';
  
  -- If user was previously a member, reactivate their membership
  IF v_existing_membership IS NOT NULL THEN
    UPDATE public.organization_users
    SET 
      status = 'pending',
      role = p_role,
      invited_at = NOW(),
      invited_by = v_caller_id,
      updated_at = NOW(),
      left_at = NULL
    WHERE id = v_existing_membership.id
    RETURNING id INTO v_membership_id;
    
    RETURN jsonb_build_object(
      'success', TRUE,
      'membership_id', v_membership_id,
      'action', 'reactivated'
    );
  END IF;
  
  -- Otherwise, create a new membership
  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    status,
    invited_at,
    invited_by,
    updated_at
  ) VALUES (
    p_organization_id,
    p_user_id,
    p_role,
    'pending',
    NOW(),
    v_caller_id,
    NOW()
  ) RETURNING id INTO v_membership_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', v_membership_id,
    'action', 'created'
  );
END;
$invite_existing$;

-- Add left_at column to organization_users if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'organization_users' 
    AND column_name = 'left_at'
  ) THEN
    ALTER TABLE public.organization_users ADD COLUMN left_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'organization_users' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.organization_users ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add email column to organization_users if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'organization_users' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.organization_users ADD COLUMN email TEXT;
    
    -- Update existing records to set email from auth.users
    UPDATE public.organization_users ou
    SET email = u.email
    FROM auth.users u
    WHERE ou.user_id = u.id AND ou.email IS NULL;
    
    -- Create index on email for faster lookups
    CREATE INDEX organization_users_email_idx ON public.organization_users(email);
  END IF;
END $$;

-- Add updated_at as trigger if it doesn't exist
DO $$ 
BEGIN
  -- Check if the updated_at trigger already exists for organization_users
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'set_updated_at' 
    AND tgrelid = 'public.organization_users'::regclass
  ) THEN
    -- Create function if it doesn't exist
    CREATE OR REPLACE FUNCTION public.set_updated_at()
    RETURNS TRIGGER AS $set_updated_at$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $set_updated_at$ LANGUAGE plpgsql;
    
    -- Create trigger on organization_users
    CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.organization_users
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

