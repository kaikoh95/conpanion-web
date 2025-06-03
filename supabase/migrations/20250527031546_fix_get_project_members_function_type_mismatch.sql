-- Migration: Fix get_project_members function type mismatch
-- Purpose: Ensure RETURNS TABLE definition matches exactly what the SELECT query returns
-- Issue: Structure of query does not match function result type

-- Drop and recreate get_project_members function with correct types
DROP FUNCTION IF EXISTS public.get_project_members(INTEGER);

CREATE OR REPLACE FUNCTION public.get_project_members(p_project_id INTEGER)
RETURNS TABLE (
  id INTEGER,
  project_id INTEGER,
  user_id UUID,
  role TEXT,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE,
  invited_at TIMESTAMP WITH TIME ZONE,
  invited_by TEXT,
  left_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  email TEXT,
  user_email TEXT,
  user_name TEXT,
  user_avatar_url TEXT
) 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
  WHERE projects_users.project_id = p_project_id
  AND projects_users.user_id = v_user_id
  AND projects_users.status = 'active';
  
  IF v_user_membership IS NULL THEN
    RETURN;
  END IF;
  
  -- Return project members with user details from user_profiles
  RETURN QUERY
  SELECT 
    pu.id,
    pu.project_id,
    pu.user_id,
    pu.role,
    pu.status,
    pu.created_at,
    pu.invited_at,
    COALESCE(inv_user.email::TEXT, '') as invited_by,
    pu.left_at,
    pu.updated_at,
    pu.email,
    au.email::TEXT as user_email,
    COALESCE(
      up.global_display_name, 
      au.raw_user_meta_data->>'name', 
      split_part(au.email, '@', 1)
    ) as user_name,
    COALESCE(up.global_avatar_url, au.raw_user_meta_data->>'avatar_url') as user_avatar_url
  FROM public.projects_users pu
  JOIN auth.users au ON au.id = pu.user_id
  LEFT JOIN public.user_profiles up ON up.id = pu.user_id
  LEFT JOIN auth.users inv_user ON inv_user.id = pu.invited_by
  WHERE pu.project_id = p_project_id
  AND pu.status IN ('active', 'pending')
  ORDER BY 
    CASE WHEN pu.role = 'owner' THEN 1
         WHEN pu.role = 'admin' THEN 2
         WHEN pu.role = 'member' THEN 3
         ELSE 4 END,
    pu.created_at ASC;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_project_members(INTEGER) TO authenticated;

-- Update function comment
COMMENT ON FUNCTION public.get_project_members(INTEGER) IS 'Get all members of a project with user details - fixed type mismatch by casting email fields to TEXT';
