-- Fix set_user_current_project function return value
-- Issue: Function returns false even when current_project_id is successfully updated
-- Root cause: RETURN FOUND only returns result of last UPDATE statement

CREATE OR REPLACE FUNCTION public.set_user_current_project(
  p_project_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_current_org_id INTEGER;
  v_project_org_id INTEGER;
  v_user_has_access BOOLEAN;
  v_main_update_success BOOLEAN := FALSE;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Get user's current organization
  SELECT current_organization_id INTO v_current_org_id
  FROM public.user_profiles
  WHERE id = v_user_id;
  
  IF v_current_org_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Verify project exists and belongs to current organization
  SELECT organization_id INTO v_project_org_id
  FROM public.projects
  WHERE id = p_project_id;
  
  IF v_project_org_id IS NULL OR v_project_org_id != v_current_org_id THEN
    RETURN FALSE;
  END IF;
  
  -- Verify user has access to this project
  SELECT EXISTS(
    SELECT 1 FROM public.projects_users
    WHERE project_id = p_project_id
    AND user_id = v_user_id
    AND status = 'active'
  ) INTO v_user_has_access;
  
  IF NOT v_user_has_access THEN
    RETURN FALSE;
  END IF;
  
  -- Update user's current project (main operation)
  UPDATE public.organization_users
  SET 
    current_project_id = p_project_id,
    last_accessed_at = NOW()
  WHERE user_id = v_user_id 
  AND organization_id = v_current_org_id
  AND status = 'active';
  
  -- Capture success of the main update
  v_main_update_success := FOUND;
  
  -- If this is their first project in this org, also set as default (optional operation)
  UPDATE public.organization_users
  SET default_project_id = p_project_id
  WHERE user_id = v_user_id 
  AND organization_id = v_current_org_id
  AND status = 'active'
  AND default_project_id IS NULL;
  
  -- Return success of main update, regardless of optional update result
  RETURN v_main_update_success;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fix get_project_members function type mismatch
-- Issue: auth.users.email is VARCHAR(255) but function declares it as TEXT
-- Root cause: Type mismatch between returned data and function signature

DROP FUNCTION IF EXISTS public.get_project_members(INTEGER);

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
  user_email VARCHAR(255),
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
    au.email::VARCHAR(255) as user_email,
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
GRANT EXECUTE ON FUNCTION public.set_user_current_project(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_members(INTEGER) TO authenticated;

-- Update function comments
COMMENT ON FUNCTION public.set_user_current_project(INTEGER) IS 'Set the user''s current active project with validation. Returns true if current project was successfully updated.';
COMMENT ON FUNCTION public.get_project_members(INTEGER) IS 'Get all members of a project with user details - fixed type mismatch for auth.users.email';
