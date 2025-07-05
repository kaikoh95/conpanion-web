-- Migration: Create project invitation system with organization membership constraints
-- Purpose: Allow inviting users to projects only if they are organization members
-- Affected tables: projects_users (add invitation columns)
-- Special considerations: 
--   - Users must be organization members to be invited to projects
--   - Similar token-based system as organization invitations
--   - 7-day invitation expiry
--   - Secure invitation lifecycle management

-- ========================================
-- STEP 1: Add invitation columns to projects_users table
-- ========================================

-- Add invitation token columns to projects_users table (similar to organization_users)
DO $$ 
BEGIN
  -- Add invitation_token column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'invitation_token'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN invitation_token UUID DEFAULT gen_random_uuid();
  END IF;

  -- Add invitation_expires_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'invitation_expires_at'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN invitation_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');
  END IF;

  -- Add invitation_email column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'invitation_email'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN invitation_email TEXT;
  END IF;

  -- Add resend_count column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'resend_count'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN resend_count INTEGER DEFAULT 0;
  END IF;

  -- Add last_resend_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'last_resend_at'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN last_resend_at TIMESTAMPTZ;
  END IF;
END $$;

-- Create indexes for fast lookups and performance
CREATE INDEX IF NOT EXISTS projects_users_invitation_token_idx ON public.projects_users(invitation_token);
CREATE INDEX IF NOT EXISTS projects_users_invitation_expires_at_idx ON public.projects_users(invitation_expires_at);
CREATE INDEX IF NOT EXISTS projects_users_invitation_email_idx ON public.projects_users(invitation_email);
CREATE INDEX IF NOT EXISTS projects_users_resend_count_idx ON public.projects_users(resend_count);

-- Add unique constraint on invitation_token (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS projects_users_invitation_token_unique_idx 
ON public.projects_users(invitation_token) 
WHERE invitation_token IS NOT NULL;

-- ========================================
-- STEP 2: Project invitation utility functions
-- ========================================

-- Function to check if user is organization member
CREATE OR REPLACE FUNCTION public.is_user_organization_member(
  p_user_id UUID,
  p_organization_id INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_users
    WHERE user_id = p_user_id
    AND organization_id = p_organization_id
    AND status = 'active'
  );
END;
$$;

-- Function to get organization members who can be invited to project
CREATE OR REPLACE FUNCTION public.get_organization_members_for_project_invitation(
  p_project_id INTEGER
)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  organization_role TEXT,
  is_already_project_member BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_project RECORD;
  v_caller_project_membership RECORD;
BEGIN
  -- Check if caller is authenticated
  IF v_caller_id IS NULL THEN
    RETURN;
  END IF;

  -- Get project and verify caller has permission
  SELECT p.*, p.organization_id INTO v_project
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN;
  END IF;

  -- Check if caller has permission to invite to this project
  SELECT * INTO v_caller_project_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';

  IF v_caller_project_membership IS NULL THEN
    RETURN;
  END IF;

  -- Return organization members with their project membership status
  RETURN QUERY
  SELECT 
    ou.user_id,
    au.email as user_email,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)) as user_name,
    ou.role as organization_role,
    EXISTS (
      SELECT 1 FROM public.projects_users pu
      WHERE pu.project_id = p_project_id
      AND pu.user_id = ou.user_id
      AND pu.status IN ('active', 'pending')
    ) as is_already_project_member
  FROM public.organization_users ou
  JOIN auth.users au ON au.id = ou.user_id
  WHERE ou.organization_id = v_project.organization_id
  AND ou.status = 'active'
  ORDER BY 
    CASE WHEN ou.role = 'owner' THEN 1
         WHEN ou.role = 'admin' THEN 2
         WHEN ou.role = 'member' THEN 3
         ELSE 4 END,
    au.email;
END;
$$;

-- ========================================
-- STEP 3: Main project invitation function
-- ========================================

-- Function to invite user to project by email with organization membership check
CREATE OR REPLACE FUNCTION public.invite_user_to_project_by_email(
  p_project_id INTEGER,
  p_email TEXT,
  p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_project RECORD;
  v_caller_project_membership RECORD;
  v_existing_user_id UUID;
  v_existing_project_membership RECORD;
  v_invitation_token UUID;
  v_user_exists BOOLEAN;
  v_membership_id INTEGER;
  v_is_organization_member BOOLEAN;
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

  -- Get project and verify it exists
  SELECT p.*, p.organization_id INTO v_project
  FROM public.projects p
  WHERE p.id = p_project_id;

  IF v_project IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Project not found',
      'error_code', 'PROJECT_NOT_FOUND'
    );
  END IF;

  -- Check if caller has permission to invite members
  SELECT * INTO v_caller_project_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';

  IF v_caller_project_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be a project owner or admin to invite users.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;

  -- Validate role
  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid role. Role must be one of: owner, admin, member',
      'error_code', 'INVALID_ROLE'
    );
  END IF;

  -- Prevent non-owners from creating owners
  IF p_role = 'owner' AND v_caller_project_membership.role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Only project owners can create other owners',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;

  -- Check if user exists
  v_user_exists := public.check_user_exists_by_email(p_email);

  IF v_user_exists THEN
    v_existing_user_id := public.get_user_id_by_email(p_email);

    -- *** CRITICAL CHECK: User must be organization member to be invited to project ***
    v_is_organization_member := public.is_user_organization_member(v_existing_user_id, v_project.organization_id);

    IF NOT v_is_organization_member THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'User must be invited to the organization first before they can be invited to projects',
        'error_code', 'NOT_ORGANIZATION_MEMBER',
        'organization_id', v_project.organization_id
      );
    END IF;

    -- Check if user already has an active project membership
    SELECT * INTO v_existing_project_membership
    FROM public.projects_users
    WHERE project_id = p_project_id
    AND user_id = v_existing_user_id
    AND status = 'active';

    IF v_existing_project_membership IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'User is already a member of this project',
        'error_code', 'ALREADY_MEMBER',
        'membership_id', v_existing_project_membership.id
      );
    END IF;

    -- Check if user has a pending project invitation
    SELECT * INTO v_existing_project_membership
    FROM public.projects_users
    WHERE project_id = p_project_id
    AND user_id = v_existing_user_id
    AND status = 'pending';

    IF v_existing_project_membership IS NOT NULL THEN
      -- Check rate limiting for resends
      IF v_existing_project_membership.resend_count >= 3 
         AND v_existing_project_membership.last_resend_at > (NOW() - INTERVAL '1 day') THEN
        RETURN jsonb_build_object(
          'success', FALSE,
          'error', 'Maximum resend limit reached. Please wait 24 hours before resending.',
          'error_code', 'RATE_LIMIT_EXCEEDED',
          'membership_id', v_existing_project_membership.id
        );
      END IF;

      -- Update existing pending invitation
      UPDATE public.projects_users
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
      WHERE id = v_existing_project_membership.id
      RETURNING invitation_token INTO v_invitation_token;

      RETURN jsonb_build_object(
        'success', TRUE,
        'user_exists', TRUE,
        'invitation_type', 'existing_user',
        'token', v_invitation_token,
        'message', 'Project invitation updated and resent to existing user',
        'membership_id', v_existing_project_membership.id
      );
    END IF;

    -- Create new project invitation for existing organization member
    INSERT INTO public.projects_users (
      project_id,
      user_id,
      role,
      status,
      invitation_email,
      invited_at,
      invited_by,
      created_by,
      resend_count,
      last_resend_at,
      updated_at
    ) VALUES (
      p_project_id,
      v_existing_user_id,
      p_role,
      'pending',
      p_email,
      NOW(),
      v_caller_id,
      v_caller_id,
      1,
      NOW(),
      NOW()
    ) RETURNING id, invitation_token INTO v_membership_id, v_invitation_token;

    RETURN jsonb_build_object(
      'success', TRUE,
      'user_exists', TRUE,
      'invitation_type', 'existing_user',
      'token', v_invitation_token,
      'message', 'Project invitation sent to existing organization member',
      'membership_id', v_membership_id
    );

  ELSE
    -- User doesn't exist - they need to be invited to organization first
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User must be invited to the organization first before they can be invited to projects',
      'error_code', 'NOT_ORGANIZATION_MEMBER',
      'organization_id', v_project.organization_id
    );
  END IF;
END;
$$;

-- ========================================
-- STEP 4: Project invitation management functions
-- ========================================

-- Function to accept project invitation by token
CREATE OR REPLACE FUNCTION public.accept_project_invitation(p_token UUID)
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
  FROM public.projects_users
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

  -- Verify the caller is the invited user
  IF v_invitation.user_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'This invitation is for a different user',
      'error_code', 'WRONG_USER'
    );
  END IF;

  -- Check if user is already an active member
  IF EXISTS (
    SELECT 1 FROM public.projects_users
    WHERE project_id = v_invitation.project_id
    AND user_id = v_caller_id
    AND status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'You are already a member of this project',
      'error_code', 'ALREADY_MEMBER'
    );
  END IF;

  -- Accept the invitation
  UPDATE public.projects_users
  SET 
    status = 'active',
    updated_at = NOW(),
    -- Clear invitation-specific fields
    invitation_token = NULL,
    invitation_expires_at = NULL,
    resend_count = 0,
    last_resend_at = NULL
  WHERE id = v_invitation.id
  RETURNING id INTO v_membership_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Project invitation accepted successfully',
    'membership_id', v_membership_id,
    'project_id', v_invitation.project_id
  );
END;
$$;

-- Function to decline project invitation by token
CREATE OR REPLACE FUNCTION public.decline_project_invitation(p_token UUID)
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
  FROM public.projects_users
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

  -- Verify the caller is the invited user
  IF v_invitation.user_id != v_caller_id THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'This invitation is for a different user',
      'error_code', 'WRONG_USER'
    );
  END IF;

  -- Decline the invitation (remove the record)
  DELETE FROM public.projects_users
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'Project invitation declined successfully'
  );
END;
$$;

-- Function to get project invitation by token
CREATE OR REPLACE FUNCTION public.get_project_invitation_by_token(p_token UUID)
RETURNS TABLE (
  id INTEGER,
  project_id INTEGER,
  project_name TEXT,
  project_description TEXT,
  organization_id INTEGER,
  organization_name TEXT,
  user_id UUID,
  role TEXT,
  invited_email TEXT,
  invited_by UUID,
  invited_by_name TEXT,
  invited_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_expired BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pu.id,
    pu.project_id,
    p.name as project_name,
    p.description as project_description,
    p.organization_id,
    o.name as organization_name,
    pu.user_id,
    pu.role,
    pu.invitation_email as invited_email,
    pu.invited_by,
    COALESCE(inviter.raw_user_meta_data->>'name', split_part(inviter.email, '@', 1)) as invited_by_name,
    pu.invited_at,
    pu.invitation_expires_at as expires_at,
    (pu.invitation_expires_at < NOW()) as is_expired
  FROM public.projects_users pu
  JOIN public.projects p ON p.id = pu.project_id
  JOIN public.organizations o ON o.id = p.organization_id
  LEFT JOIN auth.users inviter ON inviter.id = pu.invited_by
  WHERE pu.invitation_token = p_token
  AND pu.status = 'pending';
END;
$$;

-- ========================================
-- STEP 5: Grant permissions and cleanup
-- ========================================

-- Grant permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.is_user_organization_member(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_members_for_project_invitation(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_project_by_email(INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_project_invitation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_invitation_by_token(UUID) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.is_user_organization_member(UUID, INTEGER) IS 'Check if user is an active member of an organization';
COMMENT ON FUNCTION public.get_organization_members_for_project_invitation(INTEGER) IS 'Get organization members who can be invited to a project';
COMMENT ON FUNCTION public.invite_user_to_project_by_email(INTEGER, TEXT, TEXT) IS 'Invite organization member to project by email';
COMMENT ON FUNCTION public.accept_project_invitation(UUID) IS 'Accept project invitation by token';
COMMENT ON FUNCTION public.decline_project_invitation(UUID) IS 'Decline project invitation by token';
COMMENT ON FUNCTION public.get_project_invitation_by_token(UUID) IS 'Get project invitation details by token';

-- Create trigger to set default values for invitation fields
CREATE OR REPLACE FUNCTION public.set_project_invitation_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set default invitation token if not provided
  IF NEW.invitation_token IS NULL AND NEW.status = 'pending' THEN
    NEW.invitation_token := gen_random_uuid();
  END IF;

  -- Set default expiration if not provided
  IF NEW.invitation_expires_at IS NULL AND NEW.status = 'pending' THEN
    NEW.invitation_expires_at := NOW() + INTERVAL '7 days';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for project invitation defaults
DROP TRIGGER IF EXISTS set_project_invitation_defaults_trigger ON public.projects_users;
CREATE TRIGGER set_project_invitation_defaults_trigger
  BEFORE INSERT OR UPDATE ON public.projects_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_project_invitation_defaults();