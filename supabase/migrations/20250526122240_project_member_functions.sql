-- Migration: Create project member management functions
-- Purpose: Provide secure database functions for managing project members
-- Affected tables: projects_users, projects
-- Special considerations: Implements proper permission checks and data validation

-- First, enhance the projects_users table with additional columns for better tracking
DO $$ 
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('pending', 'active', 'suspended', 'deactivated'));
  END IF;

  -- Add invited_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'invited_at'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN invited_at TIMESTAMPTZ;
  END IF;

  -- Add invited_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'invited_by'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN invited_by UUID REFERENCES auth.users(id);
  END IF;

  -- Add left_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'left_at'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN left_at TIMESTAMPTZ;
  END IF;

  -- Add updated_at column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN updated_at TIMESTAMPTZ;
  END IF;

  -- Add email column for easier lookup if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'projects_users' 
    AND column_name = 'email'
  ) THEN
    ALTER TABLE public.projects_users ADD COLUMN email TEXT;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS projects_users_status_idx ON public.projects_users(status);
CREATE INDEX IF NOT EXISTS projects_users_invited_by_idx ON public.projects_users(invited_by);
CREATE INDEX IF NOT EXISTS projects_users_email_idx ON public.projects_users(email);

DROP FUNCTION IF EXISTS public.get_project_members(INTEGER);

-- Function to get all members of a project with user details
CREATE OR REPLACE FUNCTION public.get_project_members(
  p_project_id INTEGER
)
RETURNS TABLE (
  id INTEGER,
  project_id INTEGER,
  user_id UUID,
  role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  invited_at TIMESTAMPTZ,
  invited_by UUID,
  left_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  email TEXT,
  user_email TEXT,
  user_name TEXT,
  user_avatar_url TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_user_membership RECORD;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if user has access to this project
  SELECT * INTO v_user_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = v_user_id
  AND status = 'active';
  
  IF v_user_membership IS NULL THEN
    RETURN;
  END IF;
  
  -- Return project members with user details
  RETURN QUERY
  SELECT 
    pu.id,
    pu.project_id,
    pu.user_id,
    pu.role,
    pu.status,
    pu.created_at,
    pu.invited_at,
    pu.invited_by,
    pu.left_at,
    pu.updated_at,
    pu.email,
    au.email as user_email,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)) as user_name,
    au.raw_user_meta_data->>'avatar_url' as user_avatar_url
  FROM public.projects_users pu
  JOIN auth.users au ON au.id = pu.user_id
  WHERE pu.project_id = p_project_id
  AND pu.status IN ('active', 'pending')
  ORDER BY 
    CASE WHEN pu.role = 'owner' THEN 1
         WHEN pu.role = 'admin' THEN 2
         WHEN pu.role = 'member' THEN 3
         ELSE 4 END,
    pu.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to invite existing user to project
CREATE OR REPLACE FUNCTION public.invite_user_to_project(
  p_project_id INTEGER,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
) RETURNS JSONB AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_existing_membership RECORD;
  v_membership_id INTEGER;
  v_project RECORD;
BEGIN
  -- Get project details and verify it exists
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id;
  
  IF v_project IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Project not found',
      'error_code', 'PROJECT_NOT_FOUND'
    );
  END IF;

  -- Check if caller has permission to invite members
  SELECT * INTO v_caller_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = v_caller_id
  AND role IN ('owner', 'admin')
  AND status = 'active';
  
  IF v_caller_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be a project owner or admin to invite users.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Check if role is valid
  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid role. Role must be one of: owner, admin, member',
      'error_code', 'INVALID_ROLE'
    );
  END IF;
  
  -- Prevent non-owners from creating owners
  IF p_role = 'owner' AND v_caller_membership.role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Only project owners can create other owners',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Check if user already has an active membership
  SELECT * INTO v_existing_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = p_user_id
  AND status = 'active';
  
  IF v_existing_membership IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User is already a member of this project',
      'error_code', 'ALREADY_MEMBER',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- Check if user has a pending invitation
  SELECT * INTO v_existing_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = p_user_id
  AND status = 'pending';
  
  IF v_existing_membership IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User already has a pending invitation to this project',
      'error_code', 'PENDING_INVITATION',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- Check if user was previously a member and is now deactivated
  SELECT * INTO v_existing_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = p_user_id
  AND status = 'deactivated';
  
  -- If user was previously a member, reactivate their membership
  IF v_existing_membership IS NOT NULL THEN
    UPDATE public.projects_users
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
  INSERT INTO public.projects_users (
    project_id,
    user_id,
    role,
    status,
    invited_at,
    invited_by,
    created_by,
    updated_at
  ) VALUES (
    p_project_id,
    p_user_id,
    p_role,
    'active', -- Directly activate for now, can be 'pending' if invitation flow is needed
    NOW(),
    v_caller_id,
    v_caller_id,
    NOW()
  ) RETURNING id INTO v_membership_id;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', v_membership_id,
    'action', 'created'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to remove member from project
CREATE OR REPLACE FUNCTION public.remove_project_member(
  p_membership_id INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_membership RECORD;
  v_user_id UUID;
  v_project_id INTEGER;
  v_is_last_owner BOOLEAN;
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
BEGIN
  -- Get membership details
  SELECT * INTO v_membership
  FROM public.projects_users
  WHERE id = p_membership_id;
  
  -- Check if membership exists
  IF v_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Membership not found',
      'error_code', 'MEMBERSHIP_NOT_FOUND'
    );
  END IF;
  
  -- Store user_id and project_id for later use
  v_user_id := v_membership.user_id;
  v_project_id := v_membership.project_id;
  
  -- Get caller's membership in the same project
  SELECT * INTO v_caller_membership
  FROM public.projects_users
  WHERE project_id = v_project_id
  AND user_id = v_caller_id
  AND status = 'active';
  
  -- Check caller's permissions
  IF v_caller_membership IS NULL OR 
     (v_caller_membership.role NOT IN ('owner', 'admin') AND v_caller_id != v_user_id) THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be a project owner, admin, or removing yourself.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- If target is an owner, check if they're the last owner
  IF v_membership.role = 'owner' THEN
    SELECT COUNT(*) = 1 INTO v_is_last_owner
    FROM public.projects_users
    WHERE project_id = v_project_id
    AND role = 'owner'
    AND status = 'active';
    
    IF v_is_last_owner THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Cannot remove the last owner of a project',
        'error_code', 'LAST_OWNER'
      );
    END IF;
  END IF;
  
  -- If removing someone else as admin, ensure target is not an owner
  IF v_caller_membership.role = 'admin' AND v_caller_id != v_user_id AND v_membership.role = 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Admins cannot remove project owners',
      'error_code', 'ADMIN_CANNOT_REMOVE_OWNER'
    );
  END IF;
  
  -- All checks passed, update the membership status to 'deactivated'
  UPDATE public.projects_users
  SET 
    status = 'deactivated',
    updated_at = NOW(),
    left_at = NOW()
  WHERE id = p_membership_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', p_membership_id,
    'user_id', v_user_id,
    'project_id', v_project_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update project member role
CREATE OR REPLACE FUNCTION public.update_project_member_role(
  p_membership_id INTEGER,
  p_new_role TEXT
) RETURNS JSONB AS $$
DECLARE
  v_membership RECORD;
  v_caller_id UUID := auth.uid();
  v_caller_membership RECORD;
  v_is_last_owner BOOLEAN;
BEGIN
  -- Get membership details
  SELECT * INTO v_membership
  FROM public.projects_users
  WHERE id = p_membership_id
  AND status = 'active';
  
  -- Check if membership exists
  IF v_membership IS NULL THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Active membership not found',
      'error_code', 'MEMBERSHIP_NOT_FOUND'
    );
  END IF;
  
  -- Get caller's membership in the same project
  SELECT * INTO v_caller_membership
  FROM public.projects_users
  WHERE project_id = v_membership.project_id
  AND user_id = v_caller_id
  AND status = 'active';
  
  -- Check caller's permissions
  IF v_caller_membership IS NULL OR v_caller_membership.role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Permission denied. You must be a project owner or admin to change roles.',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- Check if new role is valid
  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Invalid role. Role must be one of: owner, admin, member',
      'error_code', 'INVALID_ROLE'
    );
  END IF;
  
  -- Prevent non-owners from creating owners
  IF p_new_role = 'owner' AND v_caller_membership.role != 'owner' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'Only project owners can promote users to owner',
      'error_code', 'PERMISSION_DENIED'
    );
  END IF;
  
  -- If demoting the last owner, prevent it
  IF v_membership.role = 'owner' AND p_new_role != 'owner' THEN
    SELECT COUNT(*) = 1 INTO v_is_last_owner
    FROM public.projects_users
    WHERE project_id = v_membership.project_id
    AND role = 'owner'
    AND status = 'active';
    
    IF v_is_last_owner THEN
      RETURN jsonb_build_object(
        'success', FALSE,
        'error', 'Cannot demote the last owner of a project',
        'error_code', 'LAST_OWNER'
      );
    END IF;
  END IF;
  
  -- Update the role
  UPDATE public.projects_users
  SET 
    role = p_new_role,
    updated_at = NOW()
  WHERE id = p_membership_id;
  
  -- Return success response
  RETURN jsonb_build_object(
    'success', TRUE,
    'membership_id', p_membership_id,
    'new_role', p_new_role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_project_members(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_user_to_project(INTEGER, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_project_member(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_member_role(INTEGER, TEXT) TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_project_members(INTEGER) IS 'Get all members of a project with user details';
COMMENT ON FUNCTION public.invite_user_to_project(INTEGER, UUID, TEXT) IS 'Invite a user to join a project with specified role';
COMMENT ON FUNCTION public.remove_project_member(INTEGER) IS 'Remove a member from a project (deactivate membership)';
COMMENT ON FUNCTION public.update_project_member_role(INTEGER, TEXT) IS 'Update a project member role with permission checks';
