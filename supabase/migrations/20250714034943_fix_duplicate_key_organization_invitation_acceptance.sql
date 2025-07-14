-- ========================================
-- FIX DUPLICATE KEY CONSTRAINT VIOLATION ON ORGANIZATION INVITATION ACCEPTANCE
-- ========================================
-- This migration fixes the duplicate key violation when accepting invitations
-- for users who were previously removed from organizations.
-- 
-- Root Cause: The unique constraint on (organization_id, user_id) prevents
-- duplicate records, but the acceptance logic sometimes tries to INSERT
-- instead of UPDATE existing deactivated records.

-- Enhanced function to accept invitation with robust constraint handling
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID := auth.uid();
  v_existing_membership RECORD;
  v_user_email TEXT;
  v_email_matches BOOLEAN := FALSE;
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

  -- Get current user's email to verify invitation match
  SELECT email INTO v_user_email
  FROM auth.users
  WHERE id = v_user_id;
  
  -- Check if user's email matches invitation email
  v_email_matches := (LOWER(v_user_email) = LOWER(v_invitation.email));
  
  IF NOT v_email_matches THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'This invitation was sent to a different email address',
      'error_code', 'EMAIL_MISMATCH'
    );
  END IF;

  -- Use a more robust approach: Check for ANY existing membership and handle with UPSERT pattern
  SELECT * INTO v_existing_membership
  FROM public.organization_users
  WHERE organization_id = v_invitation.organization_id
  AND user_id = v_user_id;
  
  -- Use UPSERT pattern to handle both new and existing memberships
  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    status,
    joined_at,
    last_accessed_at,
    notifications_enabled,
    invited_at,
    invited_by
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    v_invitation.role,
    'active',
    NOW(),
    NOW(),
    TRUE,
    v_invitation.invited_at,
    v_invitation.invited_by
  )
  ON CONFLICT (organization_id, user_id)
  DO UPDATE SET
    status = 'active',
    role = v_invitation.role,
    joined_at = CASE 
      WHEN organization_users.status = 'deactivated' THEN NOW()
      ELSE organization_users.joined_at
    END,
    last_accessed_at = NOW(),
    left_at = NULL,
    updated_at = NOW(),
    notifications_enabled = TRUE;

  -- Mark invitation as accepted
  UPDATE public.organization_invitations
  SET 
    status = 'accepted',
    accepted_at = NOW(),
    updated_at = NOW()
  WHERE id = v_invitation.id;

  -- Switch user's current organization context
  PERFORM public.switch_organization_context(v_invitation.organization_id);

  -- Determine if this was a reactivation
  DECLARE
    was_reactivated BOOLEAN := (v_existing_membership IS NOT NULL AND v_existing_membership.status = 'deactivated');
  BEGIN
    RETURN jsonb_build_object(
      'success', TRUE,
      'organization_id', v_invitation.organization_id,
      'role', v_invitation.role,
      'message', CASE 
        WHEN was_reactivated THEN 'Invitation accepted successfully - membership reactivated'
        ELSE 'Invitation accepted successfully'
      END,
      'was_reactivated', was_reactivated
    );
  END;

EXCEPTION 
  WHEN unique_violation THEN
    -- Handle any remaining edge cases with unique constraint violations
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Unable to process invitation due to existing membership conflict. Please contact support.',
      'error_code', 'MEMBERSHIP_CONFLICT'
    );
  WHEN OTHERS THEN
    -- Handle any other unexpected errors
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'An unexpected error occurred while processing the invitation',
      'error_code', 'PROCESSING_ERROR',
      'details', SQLERRM
    );
END;
$$;

-- Enhanced function to invite user by email with better conflict detection
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

  -- Normalize email to lowercase for consistent matching
  p_email := LOWER(TRIM(p_email));

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
      
      -- If user is pending, return error
      IF v_existing_membership.status = 'pending' THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'User already has a pending invitation to this organization',
          'error_code', 'PENDING_INVITATION'
        );
      END IF;
      
      -- If user was deactivated (previously removed), we can create a new invitation
      -- Log this for better tracking
      RAISE LOG 'Creating invitation for previously removed user. Email: %, Org: %, Previous Status: %', 
        p_email, p_organization_id, v_existing_membership.status;
    END IF;
  END IF;

  -- Check for existing pending invitation
  SELECT * INTO v_existing_invitation
  FROM public.organization_invitations
  WHERE organization_id = p_organization_id
  AND LOWER(email) = p_email
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

EXCEPTION 
  WHEN OTHERS THEN
    -- Handle any unexpected errors
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'An unexpected error occurred while creating the invitation',
      'error_code', 'INVITATION_CREATION_ERROR',
      'details', SQLERRM
    );
END;
$$;

-- Helper function to safely check for duplicate memberships and clean them up if needed
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_organization_memberships()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  duplicate_count INTEGER := 0;
  cleanup_log TEXT := '';
BEGIN
  -- Find and log any duplicate memberships (shouldn't exist due to unique constraint)
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT organization_id, user_id, COUNT(*) as member_count
    FROM public.organization_users
    GROUP BY organization_id, user_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    cleanup_log := format('Found %s duplicate membership combinations', duplicate_count);
    RAISE LOG '%', cleanup_log;
    
    -- For any duplicates, keep the most recent active record and deactivate others
    WITH ranked_memberships AS (
      SELECT id, 
             organization_id, 
             user_id, 
             status,
             ROW_NUMBER() OVER (
               PARTITION BY organization_id, user_id 
               ORDER BY 
                 CASE WHEN status = 'active' THEN 1 
                      WHEN status = 'pending' THEN 2 
                      ELSE 3 END,
                 updated_at DESC NULLS LAST,
                 created_at DESC
             ) as rn
      FROM public.organization_users
    )
    UPDATE public.organization_users
    SET status = 'deactivated', 
        updated_at = NOW(),
        left_at = NOW()
    WHERE id IN (
      SELECT id FROM ranked_memberships WHERE rn > 1
    );
    
    cleanup_log := cleanup_log || '. Deactivated duplicate records.';
  ELSE
    cleanup_log := 'No duplicate memberships found';
  END IF;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'duplicates_found', duplicate_count,
    'message', cleanup_log
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_duplicate_organization_memberships() TO authenticated;
