-- Migration: Fix get_pending_invitations SQL error and enhance invitation acceptance
-- Issues fixed:
-- 1. ORDER BY clause inside jsonb_agg() causing PostgreSQL error
-- 2. Users not getting project access when accepting invitations
-- New features:
-- 1. Add user_id column to organization_invitations for linking users to invitations
-- 2. Auto-assign users to default/first project when accepting invitations

-- First, fix the get_pending_organization_invitations function
CREATE OR REPLACE FUNCTION public.get_pending_organization_invitations(p_organization_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitations JSONB;
BEGIN
  -- Must be an admin or owner to view pending invitations
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users 
    WHERE user_id = auth.uid() 
    AND organization_id = p_organization_id 
    AND role IN ('owner', 'admin')
    AND status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Insufficient permissions to view invitations',
      'error_code', 'INSUFFICIENT_PERMISSIONS'
    );
  END IF;

  -- Get pending invitations with proper ordering in subquery
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', invitation_data.id,
      'email', invitation_data.email,
      'role', invitation_data.role,
      'status', invitation_data.status,
      'expires_at', invitation_data.expires_at,
      'invited_at', invitation_data.invited_at,
      'resend_count', invitation_data.resend_count,
      'last_resend_at', invitation_data.last_resend_at,
      'inviter_name', invitation_data.inviter_name
    )
  ) INTO v_invitations
  FROM (
    SELECT 
      i.id,
      i.email,
      i.role,
      i.status,
      i.expires_at,
      i.invited_at,
      i.resend_count,
      i.last_resend_at,
      COALESCE(up.first_name || ' ' || up.last_name, up.email, au.email) as inviter_name
    FROM public.organization_invitations i
    LEFT JOIN auth.users au ON au.id = i.invited_by
    LEFT JOIN public.user_profiles up ON up.id = i.invited_by
    WHERE i.organization_id = p_organization_id
    AND i.status = 'pending'
    AND i.expires_at > NOW()
    ORDER BY i.invited_at DESC
  ) AS invitation_data;

  RETURN jsonb_build_object(
    'success', TRUE,
    'invitations', COALESCE(v_invitations, '[]'::jsonb)
  );
END;
$$;

-- Add user_id column to organization_invitations table for linking users to invitations
ALTER TABLE public.organization_invitations 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add index for user_id column
CREATE INDEX IF NOT EXISTS organization_invitations_user_id_idx ON public.organization_invitations(user_id);

-- Create function to link users to pending invitations
CREATE OR REPLACE FUNCTION public.link_user_to_pending_invitations(p_user_id UUID, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_linked_count INTEGER := 0;
  v_invitation RECORD;
BEGIN
  -- Link all pending invitations for this email to the user
  FOR v_invitation IN 
    SELECT id FROM public.organization_invitations 
    WHERE email = p_email 
    AND status = 'pending' 
    AND expires_at > NOW()
    AND user_id IS NULL
  LOOP
    UPDATE public.organization_invitations 
    SET user_id = p_user_id, updated_at = NOW()
    WHERE id = v_invitation.id;
    
    v_linked_count := v_linked_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'linked_count', v_linked_count
  );
END;
$$;

-- Create function to get user's pending invitations
CREATE OR REPLACE FUNCTION public.get_user_pending_invitations(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitations JSONB;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'token', i.token,
      'organization_id', i.organization_id,
      'organization_name', o.name,
      'organization_slug', o.slug,
      'role', i.role,
      'expires_at', i.expires_at,
      'invited_at', i.invited_at
    )
  ) INTO v_invitations
  FROM public.organization_invitations i
  JOIN public.organizations o ON o.id = i.organization_id
  WHERE i.user_id = p_user_id
  AND i.status = 'pending'
  AND i.expires_at > NOW()
  ORDER BY i.invited_at DESC;

  RETURN jsonb_build_object(
    'success', TRUE,
    'invitations', COALESCE(v_invitations, '[]'::jsonb)
  );
END;
$$;

-- Create function to check if user has pending invitations
CREATE OR REPLACE FUNCTION public.user_has_pending_invitations(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_invitations
    WHERE user_id = p_user_id
    AND status = 'pending'
    AND expires_at > NOW()
  );
END;
$$;

-- Enhanced accept_organization_invitation function with project assignment
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(p_token UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID := auth.uid();
  v_existing_membership RECORD;
  v_default_project_id INTEGER;
  v_first_project_id INTEGER;
  v_assigned_project_id INTEGER;
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

  -- Find an appropriate project to assign the user to
  -- First, try to find a default/main project in the organization
  SELECT p.id INTO v_default_project_id
  FROM public.projects p
  WHERE p.organization_id = v_invitation.organization_id
  AND (p.name ILIKE '%default%' OR p.name ILIKE '%main%')
  ORDER BY p.created_at ASC
  LIMIT 1;

  -- If no default project found, get the first (oldest) project in the organization
  IF v_default_project_id IS NULL THEN
    SELECT p.id INTO v_first_project_id
    FROM public.projects p
    WHERE p.organization_id = v_invitation.organization_id
    ORDER BY p.created_at ASC
    LIMIT 1;
    
    v_assigned_project_id := v_first_project_id;
  ELSE
    v_assigned_project_id := v_default_project_id;
  END IF;

  -- Create organization membership with project assignment
  INSERT INTO public.organization_users (
    organization_id,
    user_id,
    role,
    status,
    joined_at,
    last_accessed_at,
    notifications_enabled,
    current_project_id,
    default_project_id
  ) VALUES (
    v_invitation.organization_id,
    v_user_id,
    v_invitation.role,
    'active',
    NOW(),
    NOW(),
    TRUE,
    v_assigned_project_id,
    v_assigned_project_id
  );

  -- If a project was found, add user to the project
  IF v_assigned_project_id IS NOT NULL THEN
    INSERT INTO public.projects_users (
      project_id,
      user_id,
      role,
      status,
      created_by
    ) VALUES (
      v_assigned_project_id,
      v_user_id,
      CASE 
        WHEN v_invitation.role IN ('owner', 'admin') THEN 'admin'
        ELSE 'member'
      END,
      'active',
      v_invitation.invited_by
    );
  END IF;

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
    'assigned_project_id', v_assigned_project_id,
    'message', 'Invitation accepted successfully'
  );
END;
$$;

-- Grant permissions for new functions
GRANT EXECUTE ON FUNCTION public.link_user_to_pending_invitations(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_pending_invitations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_pending_invitations(UUID) TO authenticated;
