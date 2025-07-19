-- ========================================
-- FIX PROJECT INVITATION DUPLICATE KEY CONSTRAINT VIOLATION
-- ========================================
-- This migration fixes the duplicate key violation when inviting users
-- who were previously removed from projects.
-- 
-- Root Cause: The unique constraint on (project_id, user_id) prevents
-- duplicate records, but the invitation logic sometimes tries to INSERT
-- instead of UPDATE existing deactivated records.

-- Enhanced function to invite user to project with robust constraint handling
CREATE OR REPLACE FUNCTION public.invite_user_to_project(
  p_project_id INTEGER,
  p_user_id UUID,
  p_role TEXT DEFAULT 'member'
) RETURNS JSONB 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  
  -- Check for ANY existing membership to determine response
  SELECT * INTO v_existing_membership
  FROM public.projects_users
  WHERE project_id = p_project_id
  AND user_id = p_user_id;
  
  -- If user is already active, return error
  IF v_existing_membership IS NOT NULL AND v_existing_membership.status = 'active' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User is already a member of this project',
      'error_code', 'ALREADY_MEMBER',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- If user has a pending invitation, return error
  IF v_existing_membership IS NOT NULL AND v_existing_membership.status = 'pending' THEN
    RETURN jsonb_build_object(
      'success', FALSE,
      'error', 'User already has a pending invitation to this project',
      'error_code', 'PENDING_INVITATION',
      'membership_id', v_existing_membership.id
    );
  END IF;
  
  -- Use UPSERT pattern to handle both new and existing memberships atomically
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
    'active', -- Directly activate for now
    NOW(),
    v_caller_id,
    v_caller_id,
    NOW()
  )
  ON CONFLICT (project_id, user_id)
  DO UPDATE SET
    status = 'active',
    role = p_role,
    invited_at = NOW(),
    invited_by = v_caller_id,
    left_at = NULL,
    updated_at = NOW()
  RETURNING id INTO v_membership_id;
  
  -- Determine if this was a reactivation
  DECLARE
    was_reactivated BOOLEAN := (v_existing_membership IS NOT NULL AND v_existing_membership.status = 'deactivated');
  BEGIN
    RETURN jsonb_build_object(
      'success', TRUE,
      'membership_id', v_membership_id,
      'action', CASE 
        WHEN was_reactivated THEN 'reactivated'
        ELSE 'created'
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

-- Helper function to safely check for duplicate project memberships and clean them up if needed
CREATE OR REPLACE FUNCTION public.cleanup_duplicate_project_memberships()
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
    SELECT project_id, user_id, COUNT(*) as member_count
    FROM public.projects_users
    GROUP BY project_id, user_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    cleanup_log := format('Found %s duplicate project membership combinations', duplicate_count);
    RAISE LOG '%', cleanup_log;
    
    -- For any duplicates, keep the most recent active record and deactivate others
    WITH ranked_memberships AS (
      SELECT id, 
             project_id, 
             user_id, 
             status,
             ROW_NUMBER() OVER (
               PARTITION BY project_id, user_id 
               ORDER BY 
                 CASE WHEN status = 'active' THEN 1 
                      WHEN status = 'pending' THEN 2 
                      ELSE 3 END,
                 updated_at DESC NULLS LAST,
                 created_at DESC
             ) as rn
      FROM public.projects_users
    )
    UPDATE public.projects_users
    SET status = 'deactivated', 
        updated_at = NOW(),
        left_at = NOW()
    WHERE id IN (
      SELECT id FROM ranked_memberships WHERE rn > 1
    );
    
    cleanup_log := cleanup_log || '. Deactivated duplicate records.';
  ELSE
    cleanup_log := 'No duplicate project memberships found';
  END IF;
  
  RETURN jsonb_build_object(
    'success', TRUE,
    'duplicates_found', duplicate_count,
    'message', cleanup_log
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.cleanup_duplicate_project_memberships() TO authenticated;
