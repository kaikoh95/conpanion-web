-- Migration: Create complete organization invitation system
-- Purpose: Comprehensive invitation system with tokens, user existence checking, rate limiting, and management
-- Affected tables: organization_users (add columns), auth.users (read-only), user_profiles (read-only)
-- Special considerations: 
--   - Handles both existing and new users
--   - Implements 3 resends per day rate limiting
--   - 7-day invitation expiry
--   - Secure token-based invitations
--   - Complete invitation lifecycle management

-- ========================================
-- STEP 1: Add invitation columns to organization_users table
-- ========================================

-- Add invitation token columns to organization_users table
ALTER TABLE public.organization_users 
ADD COLUMN IF NOT EXISTS invitation_token UUID DEFAULT gen_random_uuid(),
ADD COLUMN IF NOT EXISTS invitation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
ADD COLUMN IF NOT EXISTS invitation_email TEXT,
ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_resend_at TIMESTAMPTZ;

-- Create indexes for fast lookups and performance
CREATE INDEX IF NOT EXISTS organization_users_invitation_token_idx ON public.organization_users(invitation_token);
CREATE INDEX IF NOT EXISTS organization_users_invitation_expires_at_idx ON public.organization_users(invitation_expires_at);
CREATE INDEX IF NOT EXISTS organization_users_invitation_email_idx ON public.organization_users(invitation_email);
CREATE INDEX IF NOT EXISTS organization_users_resend_count_idx ON public.organization_users(resend_count);

-- Add unique constraint on invitation_token (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS organization_users_invitation_token_unique_idx 
ON public.organization_users(invitation_token) 
WHERE invitation_token IS NOT NULL;

-- ========================================
-- STEP 2: Utility functions for token and validation
-- ========================================

-- Function to generate secure invitation tokens
CREATE OR REPLACE FUNCTION public.generate_invitation_token()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN gen_random_uuid();
END;
$$;

-- Function to check if invitation token is valid (not expired)
CREATE OR REPLACE FUNCTION public.is_invitation_token_valid(token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expires_at TIMESTAMPTZ;
BEGIN
  SELECT invitation_expires_at INTO expires_at
  FROM public.organization_users
  WHERE invitation_token = token
  AND status = 'pending';
  
  IF expires_at IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN expires_at > NOW();
END;
$$;

-- ========================================
-- STEP 3: User existence and lookup functions
-- ========================================

-- Enhanced function to check if user exists by email
CREATE OR REPLACE FUNCTION public.check_user_exists_by_email(user_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user exists in auth.users table with confirmed email
  RETURN EXISTS (
    SELECT 1 FROM auth.users 
    WHERE email = user_email 
    AND email_confirmed_at IS NOT NULL
  );
END;
$$;

-- Function to get user ID by email (for existing users)
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_id UUID;
BEGIN
  SELECT id INTO user_id
  FROM auth.users 
  WHERE email = user_email 
  AND email_confirmed_at IS NOT NULL;
  
  RETURN user_id;
END;
$$;

-- ========================================
-- STEP 4: Main invitation creation function
-- ========================================

-- Main function to invite user to organization by email
CREATE OR REPLACE FUNCTION public.invite_user_to_organization_by_email(
  p_organization_id INTEGER,
  p_email TEXT,
  p_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_existing_user_id UUID;
  v_existing_membership RECORD;
  v_invitation_token UUID;
  v_user_exists BOOLEAN;
  v_invitation_id INTEGER;
BEGIN
  -- Validate inputs
  IF p_email IS NULL OR p_email = '' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Email address is required',
      'error_code', 'INVALID_EMAIL'
    );
  END IF;

  -- Validate email format
  IF NOT p_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid email format',
      'error_code', 'INVALID_EMAIL_FORMAT'
    );
  END IF;

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
  
  -- Validate role
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

  -- Check if user exists
  v_user_exists := public.check_user_exists_by_email(p_email);
  
  IF v_user_exists THEN
    -- Handle existing user invitation
    v_existing_user_id := public.get_user_id_by_email(p_email);
    
    -- Check if user already has an active membership
    SELECT * INTO v_existing_membership
    FROM public.organization_users
    WHERE organization_id = p_organization_id
    AND user_id = v_existing_user_id
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
    AND user_id = v_existing_user_id
    AND status = 'pending';
    
    IF v_existing_membership IS NOT NULL THEN
      -- Check rate limiting for resends
      IF v_existing_membership.resend_count >= 3 
         AND v_existing_membership.last_resend_at > (NOW() - INTERVAL '1 day') THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'Maximum resend limit reached. Please wait 24 hours before resending.',
          'error_code', 'RATE_LIMIT_EXCEEDED',
          'membership_id', v_existing_membership.id
        );
      END IF;
      
      -- Update existing pending invitation
      UPDATE public.organization_users
      SET 
        role = p_role,
        invitation_token = gen_random_uuid(),
        invitation_expires_at = NOW() + INTERVAL '7 days',
        invitation_email = p_email,
        resend_count = CASE 
          WHEN last_resend_at > (NOW() - INTERVAL '1 day') THEN resend_count + 1
          ELSE 1
        END,
        last_resend_at = NOW(),
        invited_at = NOW(),
        invited_by = v_caller_id,
        updated_at = NOW()
      WHERE id = v_existing_membership.id
      RETURNING invitation_token INTO v_invitation_token;
      
      RETURN jsonb_build_object(
        'success', TRUE,
        'user_exists', TRUE,
        'invitation_type', 'existing_user',
        'token', v_invitation_token,
        'message', 'Invitation updated and resent to existing user',
        'membership_id', v_existing_membership.id
      );
    END IF;
    
    -- Create new invitation for existing user
    INSERT INTO public.organization_users (
      organization_id,
      user_id,
      role,
      status,
      invitation_email,
      invited_at,
      invited_by,
      resend_count,
      last_resend_at,
      updated_at
    ) VALUES (
      p_organization_id,
      v_existing_user_id,
      p_role,
      'pending',
      p_email,
      NOW(),
      v_caller_id,
      1,
      NOW(),
      NOW()
    ) RETURNING id, invitation_token INTO v_invitation_id, v_invitation_token;
    
  ELSE
    -- Handle new user invitation
    -- Check if there's already a pending invitation for this email
    SELECT * INTO v_existing_membership
    FROM public.organization_users
    WHERE organization_id = p_organization_id
    AND invitation_email = p_email
    AND status = 'pending'
    AND user_id IS NULL;
    
    IF v_existing_membership IS NOT NULL THEN
      -- Check rate limiting for resends
      IF v_existing_membership.resend_count >= 3 
         AND v_existing_membership.last_resend_at > (NOW() - INTERVAL '1 day') THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'Maximum resend limit reached. Please wait 24 hours before resending.',
          'error_code', 'RATE_LIMIT_EXCEEDED',
          'membership_id', v_existing_membership.id
        );
      END IF;
      
      -- Update existing pending invitation
      UPDATE public.organization_users
      SET 
        role = p_role,
        invitation_token = gen_random_uuid(),
        invitation_expires_at = NOW() + INTERVAL '7 days',
        resend_count = CASE 
          WHEN last_resend_at > (NOW() - INTERVAL '1 day') THEN resend_count + 1
          ELSE 1
        END,
        last_resend_at = NOW(),
        invited_at = NOW(),
        invited_by = v_caller_id,
        updated_at = NOW()
      WHERE id = v_existing_membership.id
      RETURNING invitation_token INTO v_invitation_token;
      
      RETURN jsonb_build_object(
        'success', TRUE,
        'user_exists', FALSE,
        'invitation_type', 'new_user',
        'token', v_invitation_token,
        'message', 'Invitation updated and resent for new user signup',
        'membership_id', v_existing_membership.id
      );
    END IF;
    
    -- Create new invitation for new user
    INSERT INTO public.organization_users (
      organization_id,
      user_id,
      role,
      status,
      invitation_email,
      invited_at,
      invited_by,
      resend_count,
      last_resend_at,
      updated_at
    ) VALUES (
      p_organization_id,
      NULL, -- No user_id for new users
      p_role,
      'pending',
      p_email,
      NOW(),
      v_caller_id,
      1,
      NOW(),
      NOW()
    ) RETURNING id, invitation_token INTO v_invitation_id, v_invitation_token;
  END IF;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'user_exists', v_user_exists,
    'invitation_type', CASE WHEN v_user_exists THEN 'existing_user' ELSE 'new_user' END,
    'token', v_invitation_token,
    'message', CASE 
      WHEN v_user_exists THEN 'Invitation sent to existing user'
      ELSE 'Invitation sent for new user signup'
    END,
    'membership_id', v_invitation_id
  );
END;
$$;

-- ========================================
-- STEP 5: Invitation management functions
-- ========================================

-- Function to accept organization invitation by token
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invitation RECORD;
  v_membership_id INTEGER;
  v_caller_email TEXT;
BEGIN
  -- Caller must be authenticated
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required',
      'error_code', 'AUTH_REQUIRED'
    );
  END IF;

  -- Get invitation details
  SELECT * INTO v_invitation
  FROM public.organization_users
  WHERE invitation_token = p_token
  AND status = 'pending';
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid invitation token',
      'error_code', 'INVALID_TOKEN'
    );
  END IF;
  
  -- Check if invitation is expired
  IF v_invitation.invitation_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation has expired',
      'error_code', 'EXPIRED_TOKEN'
    );
  END IF;
  
  -- For existing users, verify the caller is the invited user
  IF v_invitation.user_id IS NOT NULL AND v_invitation.user_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'This invitation is for a different user',
      'error_code', 'WRONG_USER'
    );
  END IF;
  
  -- For new users, check if the caller's email matches the invitation email
  IF v_invitation.user_id IS NULL THEN
    SELECT email INTO v_caller_email
    FROM auth.users
    WHERE id = v_caller_id;
    
    IF v_caller_email != v_invitation.invitation_email THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'This invitation is for a different email address',
        'error_code', 'WRONG_EMAIL'
      );
    END IF;
  END IF;
  
  -- Check if user is already an active member
  IF EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE organization_id = v_invitation.organization_id
    AND user_id = v_caller_id
    AND status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'You are already a member of this organization',
      'error_code', 'ALREADY_MEMBER'
    );
  END IF;
  
  -- Accept the invitation
  UPDATE public.organization_users
  SET 
    user_id = v_caller_id,
    status = 'active',
    joined_at = NOW(),
    updated_at = NOW(),
    -- Clear invitation-specific fields
    invitation_token = NULL,
    invitation_expires_at = NULL,
    resend_count = 0,
    last_resend_at = NULL
  WHERE id = v_invitation.id
  RETURNING id INTO v_membership_id;
  
  -- Update user's current organization if they don't have one set
  INSERT INTO public.user_profiles (id, current_organization_id, default_organization_id, updated_at)
  VALUES (v_caller_id, v_invitation.organization_id, v_invitation.organization_id, NOW())
  ON CONFLICT (id) DO UPDATE SET
    current_organization_id = COALESCE(user_profiles.current_organization_id, v_invitation.organization_id),
    default_organization_id = COALESCE(user_profiles.default_organization_id, v_invitation.organization_id),
    updated_at = NOW();
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Invitation accepted successfully',
    'membership_id', v_membership_id,
    'organization_id', v_invitation.organization_id
  );
END;
$$;

-- Function to decline organization invitation by token
CREATE OR REPLACE FUNCTION public.decline_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invitation RECORD;
BEGIN
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM public.organization_users
  WHERE invitation_token = p_token
  AND status = 'pending';
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid invitation token',
      'error_code', 'INVALID_TOKEN'
    );
  END IF;
  
  -- Check if invitation is expired
  IF v_invitation.invitation_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation has expired',
      'error_code', 'EXPIRED_TOKEN'
    );
  END IF;
  
  -- For existing users with authentication, verify the caller is the invited user
  IF v_caller_id IS NOT NULL AND v_invitation.user_id IS NOT NULL AND v_invitation.user_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'This invitation is for a different user',
      'error_code', 'WRONG_USER'
    );
  END IF;
  
  -- Decline the invitation by deleting the record
  DELETE FROM public.organization_users
  WHERE id = v_invitation.id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Invitation declined successfully'
  );
END;
$$;

-- Function to get invitation details by token (for display purposes)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_inviter RECORD;
BEGIN
  -- Get invitation with organization details
  SELECT 
    ou.*,
    o.name as organization_name,
    o.description as organization_description,
    o.slug as organization_slug
  INTO v_invitation
  FROM public.organization_users ou
  JOIN public.organizations o ON o.id = ou.organization_id
  WHERE ou.invitation_token = p_token
  AND ou.status = 'pending';
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid invitation token',
      'error_code', 'INVALID_TOKEN'
    );
  END IF;
  
  -- Check if invitation is expired
  IF v_invitation.invitation_expires_at < NOW() THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation has expired',
      'error_code', 'EXPIRED_TOKEN'
    );
  END IF;
  
  -- Get inviter details
  SELECT 
    COALESCE(up.first_name || ' ' || up.last_name, up.email, au.email) as inviter_name,
    COALESCE(up.email, au.email) as inviter_email
  INTO v_inviter
  FROM auth.users au
  LEFT JOIN public.user_profiles up ON up.id = au.id
  WHERE au.id = v_invitation.invited_by;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'invitation', jsonb_build_object(
      'id', v_invitation.id,
      'organization_id', v_invitation.organization_id,
      'organization_name', v_invitation.organization_name,
      'organization_description', v_invitation.organization_description,
      'organization_slug', v_invitation.organization_slug,
      'role', v_invitation.role,
      'invited_email', v_invitation.invitation_email,
      'invited_by_name', COALESCE(v_inviter.inviter_name, 'Unknown'),
      'invited_by_email', COALESCE(v_inviter.inviter_email, 'Unknown'),
      'expires_at', v_invitation.invitation_expires_at,
      'user_exists', v_invitation.user_id IS NOT NULL,
      'created_at', v_invitation.invited_at
    )
  );
END;
$$;

-- Function to cancel pending invitation (for inviters)
CREATE OR REPLACE FUNCTION public.cancel_organization_invitation(p_invitation_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invitation RECORD;
  v_caller_membership RECORD;
BEGIN
  -- Caller must be authenticated
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required',
      'error_code', 'AUTH_REQUIRED'
    );
  END IF;

  -- Get invitation details
  SELECT * INTO v_invitation
  FROM public.organization_users
  WHERE id = p_invitation_id
  AND status = 'pending';
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid invitation ID or invitation not pending',
      'error_code', 'INVALID_INVITATION'
    );
  END IF;
  
  -- Check if caller has permission to cancel invitations
  SELECT * INTO v_caller_membership
  FROM public.organization_users
  WHERE organization_id = v_invitation.organization_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';
  
  IF v_caller_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be an owner or admin to cancel invitations.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Cancel the invitation by deleting the record
  DELETE FROM public.organization_users
  WHERE id = p_invitation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Invitation cancelled successfully'
  );
END;
$$;

-- Function to get pending invitations for an organization
CREATE OR REPLACE FUNCTION public.get_pending_organization_invitations(p_organization_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_invitations JSONB;
BEGIN
  -- Caller must be authenticated
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required',
      'error_code', 'AUTH_REQUIRED'
    );
  END IF;

  -- Check if caller has permission to view invitations
  SELECT * INTO v_caller_membership
  FROM public.organization_users
  WHERE organization_id = p_organization_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';
  
  IF v_caller_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be an owner or admin to view invitations.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Get pending invitations with inviter details
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', ou.id,
      'invitation_token', ou.invitation_token,
      'role', ou.role,
      'invited_email', ou.invitation_email,
      'invited_at', ou.invited_at,
      'expires_at', ou.invitation_expires_at,
      'resend_count', ou.resend_count,
      'last_resend_at', ou.last_resend_at,
      'user_exists', ou.user_id IS NOT NULL,
      'invited_by_name', COALESCE(up.first_name || ' ' || up.last_name, up.email, au.email),
      'invited_by_email', COALESCE(up.email, au.email)
    )
  ) INTO v_invitations
  FROM public.organization_users ou
  LEFT JOIN auth.users au ON au.id = ou.invited_by
  LEFT JOIN public.user_profiles up ON up.id = au.id
  WHERE ou.organization_id = p_organization_id
  AND ou.status = 'pending'
  AND ou.invitation_expires_at > NOW()
  ORDER BY ou.invited_at DESC;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'invitations', COALESCE(v_invitations, '[]'::jsonb)
  );
END;
$$;

-- ========================================
-- STEP 6: Cleanup and maintenance functions
-- ========================================

-- Enhanced cleanup function for expired invitations
CREATE OR REPLACE FUNCTION public.cleanup_expired_invitations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  -- Delete expired pending invitations
  DELETE FROM public.organization_users
  WHERE status = 'pending'
  AND invitation_expires_at < NOW();
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'cleaned_up_count', cleanup_count,
    'message', format('Cleaned up %s expired invitations', cleanup_count)
  );
END;
$$;

-- ========================================
-- STEP 7: Triggers for automatic invitation management
-- ========================================

-- Trigger to automatically set invitation_token and expiration for new pending invitations
CREATE OR REPLACE FUNCTION public.set_invitation_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only set defaults for pending invitations
  IF NEW.status = 'pending' THEN
    -- Set invitation token if not already set
    IF NEW.invitation_token IS NULL THEN
      NEW.invitation_token = gen_random_uuid();
    END IF;
    
    -- Set expiration if not already set
    IF NEW.invitation_expires_at IS NULL THEN
      NEW.invitation_expires_at = NOW() + INTERVAL '7 days';
    END IF;
    
    -- Reset resend count for new invitations
    IF OLD IS NULL THEN
      NEW.resend_count = 0;
      NEW.last_resend_at = NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for setting invitation defaults
DROP TRIGGER IF EXISTS set_invitation_defaults_trigger ON public.organization_users;
CREATE TRIGGER set_invitation_defaults_trigger
  BEFORE INSERT OR UPDATE ON public.organization_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_invitation_defaults();

-- ========================================
-- STEP 8: Update existing data and grant permissions
-- ========================================

-- Update existing pending invitations to have tokens
UPDATE public.organization_users
SET 
  invitation_token = gen_random_uuid(),
  invitation_expires_at = COALESCE(invitation_expires_at, NOW() + INTERVAL '7 days'),
  resend_count = 0
WHERE status = 'pending' 
AND invitation_token IS NULL;

-- Grant necessary permissions for all functions
GRANT EXECUTE ON FUNCTION public.generate_invitation_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_invitation_token_valid(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_user_exists_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_organization_by_email(INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_organization_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_organization_invitation(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_organization_invitations(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_invitations() TO authenticated;

-- Allow anonymous users to decline invitations and view invitation details (for new users)
GRANT EXECUTE ON FUNCTION public.decline_organization_invitation(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO anon;

-- ========================================
-- STEP 9: Add helpful documentation
-- ========================================

-- Add column comments
COMMENT ON COLUMN public.organization_users.invitation_token IS 'Secure UUID token for invitation links (7-day expiry)';
COMMENT ON COLUMN public.organization_users.invitation_expires_at IS 'When the invitation token expires (default 7 days from creation)';
COMMENT ON COLUMN public.organization_users.invitation_email IS 'Email address for invitation (may differ from user email for new users)';
COMMENT ON COLUMN public.organization_users.resend_count IS 'Number of times invitation has been resent (max 3 per day)';
COMMENT ON COLUMN public.organization_users.last_resend_at IS 'Timestamp of last invitation resend for rate limiting';

-- Add function comments
COMMENT ON FUNCTION public.generate_invitation_token() IS 'Generate secure UUID token for invitations';
COMMENT ON FUNCTION public.is_invitation_token_valid(UUID) IS 'Check if invitation token is valid and not expired';
COMMENT ON FUNCTION public.check_user_exists_by_email(TEXT) IS 'Check if a user exists by email address';
COMMENT ON FUNCTION public.get_user_id_by_email(TEXT) IS 'Get user ID by email address for existing users';
COMMENT ON FUNCTION public.invite_user_to_organization_by_email(INTEGER, TEXT, TEXT) IS 'Invite user to organization by email with rate limiting and user existence checking';
COMMENT ON FUNCTION public.accept_organization_invitation(UUID) IS 'Accept organization invitation by token';
COMMENT ON FUNCTION public.decline_organization_invitation(UUID) IS 'Decline organization invitation by token';
COMMENT ON FUNCTION public.get_invitation_by_token(UUID) IS 'Get invitation details by token for display';
COMMENT ON FUNCTION public.cancel_organization_invitation(INTEGER) IS 'Cancel pending invitation (admin/owner only)';
COMMENT ON FUNCTION public.get_pending_organization_invitations(INTEGER) IS 'Get all pending invitations for an organization (admin/owner only)';
COMMENT ON FUNCTION public.cleanup_expired_invitations() IS 'Clean up expired invitations (returns count of cleaned invitations)';
