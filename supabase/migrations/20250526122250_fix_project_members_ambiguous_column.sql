-- Migration: Fix ambiguous column reference in get_project_members function
-- Purpose: Resolve SQL ambiguity error when fetching project members
-- Affected functions: get_project_members

-- Drop and recreate the function with more explicit column references
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
  WHERE projects_users.project_id = p_project_id
  AND projects_users.user_id = v_user_id
  AND projects_users.status = 'active';
  
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_project_members(INTEGER) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_project_members(INTEGER) IS 'Get all members of a project with user details - fixed ambiguous column reference';
