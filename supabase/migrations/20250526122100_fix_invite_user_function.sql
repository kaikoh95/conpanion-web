-- Migration to fix invite_user_to_organization function
-- This improves error handling and fallback to auth.users for email lookup

-- First drop the existing function
DROP FUNCTION IF EXISTS public.invite_user_to_organization(int, text, text);

-- Create a function to debug the invite process (for admins)
CREATE OR REPLACE FUNCTION public.debug_invite_process(
  org_id INT,
  user_email TEXT,
  user_role TEXT DEFAULT 'member'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_auth_user_id UUID;
  v_org_exists BOOLEAN;
  v_already_member BOOLEAN;
  v_result JSONB;
BEGIN
  -- Check if the organization exists
  SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id = org_id) INTO v_org_exists;
  
  IF NOT v_org_exists THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Organization does not exist',
      'error_code', 'ORG_NOT_FOUND'
    );
  END IF;
  
  -- Try to find user by email in user_profiles first
  SELECT id INTO v_user_id
  FROM public.user_profiles
  WHERE email = user_email;
  
  -- If not found in user_profiles, check auth.users
  IF v_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE email = user_email;
    
    v_user_id := v_auth_user_id;
  END IF;
  
  -- Return debugging info
  RETURN jsonb_build_object(
    'organization_id', org_id,
    'organization_exists', v_org_exists,
    'email_provided', user_email,
    'user_id_found', v_user_id,
    'found_in_profiles', v_user_id IS NOT NULL AND v_auth_user_id IS NULL,
    'found_in_auth', v_auth_user_id IS NOT NULL
  );
END;
$$;

-- Recreate the invite_user_to_organization function with JSONB return type
CREATE OR REPLACE FUNCTION public.invite_user_to_organization(
  org_id INT,
  user_email TEXT,
  user_role TEXT DEFAULT 'member'
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_auth_user_id UUID;
  v_org_exists BOOLEAN;
  v_already_member BOOLEAN;
  v_result JSONB;
  v_membership_id INT;
BEGIN
  -- Validate role
  IF user_role NOT IN ('owner', 'admin', 'member', 'guest') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid role. Must be one of: owner, admin, member, guest',
      'error_code', 'INVALID_ROLE'
    );
  END IF;

  -- Check if the organization exists
  SELECT EXISTS(SELECT 1 FROM public.organizations WHERE id = org_id) INTO v_org_exists;
  
  IF NOT v_org_exists THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Organization does not exist',
      'error_code', 'ORG_NOT_FOUND'
    );
  END IF;
  
  -- Try to find user by email in user_profiles first
  SELECT id INTO v_user_id
  FROM public.user_profiles
  WHERE email = user_email;
  
  -- If not found in user_profiles, check auth.users
  IF v_user_id IS NULL THEN
    SELECT id INTO v_auth_user_id
    FROM auth.users
    WHERE email = user_email;
    
    -- If found in auth.users, update or create user_profile
    IF v_auth_user_id IS NOT NULL THEN
      -- Update user_profiles with email
      INSERT INTO public.user_profiles (id, email, updated_at)
      VALUES (v_auth_user_id, user_email, NOW())
      ON CONFLICT (id) 
      DO UPDATE SET 
        email = EXCLUDED.email,
        updated_at = NOW()
      RETURNING id INTO v_user_id;
    END IF;
  END IF;
  
  -- Check if user was found
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User with provided email not found',
      'error_code', 'USER_NOT_FOUND'
    );
  END IF;
  
  -- Check if already a member of this organization
  SELECT EXISTS(
    SELECT 1 
    FROM public.organization_users 
    WHERE organization_id = org_id 
    AND user_id = v_user_id
    AND status = 'active'
  ) INTO v_already_member;
  
  IF v_already_member THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User is already a member of this organization',
      'error_code', 'ALREADY_MEMBER'
    );
  END IF;
  
  -- Add user to organization
  INSERT INTO public.organization_users (
    organization_id, 
    user_id, 
    role, 
    status,
    joined_at,
    notifications_enabled
  )
  VALUES (
    org_id,
    v_user_id,
    user_role,
    'active',
    NOW(),
    true
  )
  RETURNING id INTO v_membership_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', v_membership_id,
    'user_id', v_user_id
  );
END;
$$; 