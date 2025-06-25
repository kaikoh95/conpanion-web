-- ========================================
-- CREATE SEPARATE ORGANIZATION INVITATIONS TABLE
-- ========================================
-- This migration creates a separate table for organization invitations
-- and updates all related functions to use the new table structure.

-- Create the organization_invitations table
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resend_count INTEGER NOT NULL DEFAULT 0,
  last_resend_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  accepted_at TIMESTAMPTZ,
  declined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on the invitations table
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS organization_invitations_organization_id_idx ON public.organization_invitations(organization_id);
CREATE INDEX IF NOT EXISTS organization_invitations_email_idx ON public.organization_invitations(email);
CREATE INDEX IF NOT EXISTS organization_invitations_token_idx ON public.organization_invitations(token);
CREATE INDEX IF NOT EXISTS organization_invitations_expires_at_idx ON public.organization_invitations(expires_at);
CREATE INDEX IF NOT EXISTS organization_invitations_status_idx ON public.organization_invitations(status);
CREATE INDEX IF NOT EXISTS organization_invitations_invited_by_idx ON public.organization_invitations(invited_by);

-- Create unique constraint to prevent duplicate pending invitations
CREATE UNIQUE INDEX IF NOT EXISTS organization_invitations_unique_pending_idx 
ON public.organization_invitations(organization_id, email) 
WHERE status = 'pending';

-- Add updated_at trigger
CREATE TRIGGER set_updated_at_organization_invitations
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ========================================
-- RLS POLICIES FOR ORGANIZATION INVITATIONS
-- ========================================

-- Allow authenticated users to view invitations for organizations they're members of
CREATE POLICY "Users can view invitations for their organizations" ON public.organization_invitations
FOR SELECT TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role IN ('owner', 'admin')
  )
);

-- Allow authenticated users to insert invitations for organizations they admin
CREATE POLICY "Admins can create invitations" ON public.organization_invitations
FOR INSERT TO authenticated
WITH CHECK (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role IN ('owner', 'admin')
  )
);

-- Allow authenticated users to update invitations for organizations they admin
CREATE POLICY "Admins can update invitations" ON public.organization_invitations
FOR UPDATE TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role IN ('owner', 'admin')
  )
);

-- Allow authenticated users to delete invitations for organizations they admin
CREATE POLICY "Admins can delete invitations" ON public.organization_invitations
FOR DELETE TO authenticated
USING (
  organization_id IN (
    SELECT organization_id 
    FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND status = 'active'
    AND role IN ('owner', 'admin')
  )
);

-- Allow anonymous users to view invitation details by token (for new users)
CREATE POLICY "Anyone can view invitation by token" ON public.organization_invitations
FOR SELECT TO anon, authenticated
USING (token IS NOT NULL AND status = 'pending' AND expires_at > NOW());

-- ========================================
-- DROP OLD INVITATION COLUMNS FROM ORGANIZATION_USERS
-- ========================================

-- Remove the invitation-related columns from organization_users table
ALTER TABLE public.organization_users 
DROP COLUMN IF EXISTS invitation_token,
DROP COLUMN IF EXISTS invitation_expires_at,
DROP COLUMN IF EXISTS invitation_email,
DROP COLUMN IF EXISTS resend_count,
DROP COLUMN IF EXISTS last_resend_at;

-- Drop old indexes that are no longer needed
DROP INDEX IF EXISTS organization_users_invitation_token_idx;
DROP INDEX IF EXISTS organization_users_invitation_expires_at_idx;
DROP INDEX IF EXISTS organization_users_invitation_email_idx;
DROP INDEX IF EXISTS organization_users_resend_count_idx;
DROP INDEX IF EXISTS organization_users_invitation_token_unique_idx;

-- ========================================
-- UPDATE FUNCTIONS TO USE NEW TABLE STRUCTURE
-- ========================================

-- Updated function to invite user by email using new table
CREATE OR REPLACE FUNCTION public.invite_user_to_organization_by_email(
  p_organization_id INTEGER,
  p_email TEXT,
  p_role TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_user_exists BOOLEAN;
  v_existing_user_id UUID;
  v_existing_invitation RECORD;
  v_invitation_id INTEGER;
  v_token UUID;
BEGIN
  -- Caller must be authenticated
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required',
      'error_code', 'AUTH_REQUIRED'
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
    v_existing_user_id := public.get_user_id_by_email(p_email);
    
    -- Check if user is already a member
    IF EXISTS (
      SELECT 1 FROM public.organization_users
      WHERE organization_id = p_organization_id
      AND user_id = v_existing_user_id
      AND status = 'active'
    ) THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'User is already a member of this organization',
        'error_code', 'ALREADY_MEMBER'
      );
    END IF;
  END IF;

  -- Check for existing pending invitation
  SELECT * INTO v_existing_invitation
  FROM public.organization_invitations
  WHERE organization_id = p_organization_id
  AND email = p_email
  AND status = 'pending'
  AND expires_at > NOW();
  
  IF v_existing_invitation IS NOT NULL THEN
    -- Check rate limiting for resends
    IF v_existing_invitation.resend_count >= 3
    AND v_existing_invitation.last_resend_at > (NOW() - INTERVAL '1 day') THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Maximum resend limit reached. Please wait 24 hours before resending.',
        'error_code', 'RATE_LIMIT_EXCEEDED'
      );
    END IF;

    -- Update existing invitation (resend)
    UPDATE public.organization_invitations
    SET 
      role = p_role,
      resend_count = CASE
        WHEN last_resend_at > (NOW() - INTERVAL '1 day') THEN resend_count + 1
        ELSE 1
      END,
      last_resend_at = NOW(),
      expires_at = NOW() + INTERVAL '7 days',
      updated_at = NOW()
    WHERE id = v_existing_invitation.id
    RETURNING id, token INTO v_invitation_id, v_token;
  ELSE
    -- Create new invitation
    INSERT INTO public.organization_invitations (
      organization_id,
      email,
      role,
      invited_by,
      resend_count
    ) VALUES (
      p_organization_id,
      p_email,
      p_role,
      v_caller_id,
      0
    ) RETURNING id, token INTO v_invitation_id, v_token;
  END IF;

  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'user_exists', v_user_exists,
    'token', v_token,
    'invitation_id', v_invitation_id,
    'message', CASE 
      WHEN v_existing_invitation IS NOT NULL THEN 'Invitation resent successfully'
      ELSE 'Invitation sent successfully'
    END
  );
END;
$$;

-- Updated function to accept invitation using new table
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID := auth.uid();
  v_existing_membership RECORD;
BEGIN
  -- Must be authenticated to accept invitation
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Authentication required to accept invitation',
      'error_code', 'AUTH_REQUIRED'
    );
  END IF;

  -- Get invitation details
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token = p_token
  AND status = 'pending'
  AND expires_at > NOW();
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid or expired invitation',
      'error_code', 'INVALID_INVITATION'
    );
  END IF;

  -- Check if user is already a member
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = v_invitation.organization_id
  AND user_id = v_user_id
  AND status = 'active';
  
  IF v_existing_membership IS NOT NULL THEN
    -- Mark invitation as accepted
    UPDATE public.organization_invitations
    SET 
      status = 'accepted',
      accepted_at = NOW(),
      updated_at = NOW()
    WHERE id = v_invitation.id;
    
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'You are already a member of this organization',
      'error_code', 'ALREADY_MEMBER'
    );
  END IF;

  -- Create organization membership
  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    status,
    joined_at,
    last_accessed_at,
    notifications_enabled
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    v_invitation.role,
    'active',
    NOW(),
    NOW(),
    TRUE
  );

  -- Mark invitation as accepted
  UPDATE public.organization_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  -- Switch user's current organization context
  PERFORM public.switch_organization_context(v_invitation.organization_id);

  RETURN jsonb_build_object(
    'success', TRUE,
    'organization_id', v_invitation.organization_id,
    'role', v_invitation.role,
    'message', 'Invitation accepted successfully'
  );
END;
$$;

-- Updated function to decline invitation using new table
CREATE OR REPLACE FUNCTION public.decline_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
BEGIN
  -- Get invitation details
  SELECT * INTO v_invitation
  FROM public.organization_invitations
  WHERE token = p_token
  AND status = 'pending'
  AND expires_at > NOW();
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid or expired invitation',
      'error_code', 'INVALID_INVITATION'
    );
  END IF;

  -- Mark invitation as declined
  UPDATE public.organization_invitations
  SET 
    status = 'declined',
    declined_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Invitation declined successfully'
  );
END;
$$;

-- Updated function to get invitation by token using new table
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_organization RECORD;
  v_inviter RECORD;
BEGIN
  -- Get invitation with organization and inviter details
  SELECT 
    i.*,
    o.name as organization_name,
    o.slug as organization_slug
  INTO v_invitation
  FROM public.organization_invitations i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.token = p_token;
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation not found',
      'error_code', 'INVITATION_NOT_FOUND'
    );
  END IF;

  -- Check if invitation is expired
  IF v_invitation.expires_at < NOW() THEN
    -- Mark as expired if not already
    IF v_invitation.status = 'pending' THEN
      UPDATE public.organization_invitations
      SET status = 'expired', updated_at = NOW()
      WHERE id = v_invitation.id;
    END IF;
    
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation has expired',
      'error_code', 'INVITATION_EXPIRED'
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

  -- Return invitation details
  RETURN jsonb_build_object(
    'success', TRUE,
    'invitation', jsonb_build_object(
      'id', v_invitation.id,
      'organization_id', v_invitation.organization_id,
      'organization_name', v_invitation.organization_name,
      'organization_slug', v_invitation.organization_slug,
      'role', v_invitation.role,
      'invited_email', v_invitation.email,
      'invited_by_name', COALESCE(v_inviter.inviter_name, 'Someone'),
      'invited_by_email', v_inviter.inviter_email,
      'invited_at', v_invitation.invited_at,
      'expires_at', v_invitation.expires_at,
      'status', v_invitation.status,
      'user_exists', public.check_user_exists_by_email(v_invitation.email),
      'resend_count', v_invitation.resend_count,
      'last_resend_at', v_invitation.last_resend_at
    )
  );
END;
$$;

-- Updated function to cancel invitation using new table
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
  FROM public.organization_invitations
  WHERE id = p_invitation_id
  AND status = 'pending';
  
  IF v_invitation IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invitation not found or already processed',
      'error_code', 'INVITATION_NOT_FOUND'
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

  -- Delete the invitation
  DELETE FROM public.organization_invitations
  WHERE id = p_invitation_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Invitation cancelled successfully'
  );
END;
$$;

-- Updated function to get pending invitations using new table
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
      'id', i.id,
      'invitation_token', i.token,
      'role', i.role,
      'invited_email', i.email,
      'invited_at', i.invited_at,
      'expires_at', i.expires_at,
      'resend_count', i.resend_count,
      'last_resend_at', i.last_resend_at,
      'user_exists', public.check_user_exists_by_email(i.email),
      'invited_by_name', COALESCE(up.first_name || ' ' || up.last_name, up.email, au.email),
      'invited_by_email', COALESCE(up.email, au.email)
    )
  ) INTO v_invitations
  FROM public.organization_invitations i
  LEFT JOIN auth.users au ON au.id = i.invited_by
  LEFT JOIN public.user_profiles up ON up.id = au.id
  WHERE i.organization_id = p_organization_id
  AND i.status = 'pending'
  AND i.expires_at > NOW()
  ORDER BY i.invited_at DESC;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'invitations', COALESCE(v_invitations, '[]'::jsonb)
  );
END;
$$;

-- Updated cleanup function for new table
CREATE OR REPLACE FUNCTION public.cleanup_expired_invitations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  -- Mark expired pending invitations as expired
  UPDATE public.organization_invitations
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'pending'
  AND expires_at < NOW();
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'cleaned_up_count', cleanup_count,
    'message', format('Marked %s invitations as expired', cleanup_count)
  );
END;
$$;

-- ========================================
-- GRANT PERMISSIONS FOR NEW FUNCTIONS
-- ========================================

-- Grant permissions for updated functions
GRANT EXECUTE ON FUNCTION public.invite_user_to_organization_by_email(INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_organization_invitation(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cancel_organization_invitation(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_organization_invitations(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_invitations() TO authenticated;

-- ========================================
-- ADD DOCUMENTATION
-- ========================================

-- Add table and column comments
COMMENT ON TABLE public.organization_invitations IS 'Separate table for managing organization invitations with complete lifecycle tracking';
COMMENT ON COLUMN public.organization_invitations.token IS 'Secure UUID token for invitation links (7-day expiry)';
COMMENT ON COLUMN public.organization_invitations.expires_at IS 'When the invitation token expires (default 7 days from creation)';
COMMENT ON COLUMN public.organization_invitations.email IS 'Email address for invitation';
COMMENT ON COLUMN public.organization_invitations.resend_count IS 'Number of times invitation has been resent (max 3 per day)';
COMMENT ON COLUMN public.organization_invitations.last_resend_at IS 'Timestamp of last invitation resend for rate limiting';
COMMENT ON COLUMN public.organization_invitations.status IS 'Invitation status: pending, accepted, declined, expired';
COMMENT ON COLUMN public.organization_invitations.accepted_at IS 'When the invitation was accepted';
COMMENT ON COLUMN public.organization_invitations.declined_at IS 'When the invitation was declined';

-- Add function comments
COMMENT ON FUNCTION public.invite_user_to_organization_by_email(INTEGER, TEXT, TEXT) IS 'Invite user to organization by email using separate invitations table';
COMMENT ON FUNCTION public.accept_organization_invitation(UUID) IS 'Accept organization invitation and create membership';
COMMENT ON FUNCTION public.decline_organization_invitation(UUID) IS 'Decline organization invitation';
COMMENT ON FUNCTION public.get_invitation_by_token(UUID) IS 'Get invitation details by token from invitations table';
COMMENT ON FUNCTION public.cancel_organization_invitation(INTEGER) IS 'Cancel pending invitation from invitations table';
COMMENT ON FUNCTION public.get_pending_organization_invitations(INTEGER) IS 'Get all pending invitations from invitations table';
COMMENT ON FUNCTION public.cleanup_expired_invitations() IS 'Mark expired invitations as expired in invitations table';
