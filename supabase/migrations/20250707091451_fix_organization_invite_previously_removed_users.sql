-- ========================================
-- FIX ORGANIZATION INVITE FLOW FOR PREVIOUSLY REMOVED USERS
-- ========================================
-- This migration fixes the issue where users who have been previously removed 
-- from an organization (status = 'deactivated') cannot be re-invited.

-- Updated function to invite user by email - handles previously removed users
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
  v_existing_membership RECORD;
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
    
    -- Check for ANY existing membership (active, deactivated, pending)
    SELECT * INTO v_existing_membership
    FROM public.organization_users
    WHERE organization_id = p_organization_id
    AND user_id = v_existing_user_id;
    
    IF v_existing_membership IS NOT NULL THEN
      -- If user is already active, return error
      IF v_existing_membership.status = 'active' THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'User is already a member of this organization',
          'error_code', 'ALREADY_MEMBER'
        );
      END IF;
      
      -- If user is pending, check for existing invitation
      IF v_existing_membership.status = 'pending' THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'User already has a pending invitation to this organization',
          'error_code', 'PENDING_INVITATION'
        );
      END IF;
      
      -- If user was deactivated (previously removed), we can create a new invitation
      -- The invitation system will handle reactivating their membership
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
    'was_previously_member', (v_existing_membership IS NOT NULL AND v_existing_membership.status = 'deactivated'),
    'message', CASE 
      WHEN v_existing_invitation IS NOT NULL THEN 'Invitation resent successfully'
      WHEN v_existing_membership IS NOT NULL AND v_existing_membership.status = 'deactivated' THEN 'Invitation sent to previously removed user'
      ELSE 'Invitation sent successfully'
    END
  );
END;
$$;

-- Updated function to accept invitation - handles reactivating deactivated memberships
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

  -- Check for ANY existing membership (active, deactivated, pending)
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = v_invitation.organization_id
  AND user_id = v_user_id;
  
  IF v_existing_membership IS NOT NULL THEN
    -- If user is already active, mark invitation as accepted and return error
    IF v_existing_membership.status = 'active' THEN
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

    -- If user has a deactivated membership, reactivate it
    IF v_existing_membership.status = 'deactivated' THEN
      UPDATE public.organization_users
      SET 
        status = 'active',
        role = v_invitation.role,
        joined_at = NOW(),
        last_accessed_at = NOW(),
        left_at = NULL,
        updated_at = NOW()
      WHERE id = v_existing_membership.id;
      
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
        'message', 'Invitation accepted successfully - membership reactivated',
        'was_reactivated', TRUE
      );
    END IF;

    -- If user has a pending membership, update it to active
    IF v_existing_membership.status = 'pending' THEN
      UPDATE public.organization_users
      SET 
        status = 'active',
        role = v_invitation.role,
        joined_at = NOW(),
        last_accessed_at = NOW(),
        updated_at = NOW()
      WHERE id = v_existing_membership.id;
      
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
    END IF;
  END IF;

  -- No existing membership, create new one
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