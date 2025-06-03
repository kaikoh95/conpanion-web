-- Migration: Add project context to organization_users table (fixed)
-- Purpose: Enable per-organization project context management for users
-- Affected tables: organization_users, projects
-- Special considerations: Uses foreign keys and validation functions instead of CHECK constraints

-- Add project context columns to organization_users
ALTER TABLE public.organization_users 
ADD COLUMN IF NOT EXISTS current_project_id INTEGER REFERENCES public.projects(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS default_project_id INTEGER REFERENCES public.projects(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS organization_users_current_project_id_idx ON public.organization_users(current_project_id);
CREATE INDEX IF NOT EXISTS organization_users_default_project_id_idx ON public.organization_users(default_project_id);

-- Function to get user's current project context
CREATE OR REPLACE FUNCTION public.get_user_project_context()
RETURNS TABLE (
  organization_id INTEGER,
  current_project_id INTEGER,
  default_project_id INTEGER,
  current_project_name TEXT,
  default_project_name TEXT
) AS $$
DECLARE
  v_user_id UUID;
  v_current_org_id INTEGER;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get user's current organization
  SELECT current_organization_id INTO v_current_org_id
  FROM public.user_profiles
  WHERE id = v_user_id;
  
  IF v_current_org_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Return project context for current organization
  RETURN QUERY
  SELECT 
    ou.organization_id,
    ou.current_project_id,
    ou.default_project_id,
    cp.name as current_project_name,
    dp.name as default_project_name
  FROM public.organization_users ou
  LEFT JOIN public.projects cp ON cp.id = ou.current_project_id
  LEFT JOIN public.projects dp ON dp.id = ou.default_project_id
  WHERE ou.user_id = v_user_id 
  AND ou.organization_id = v_current_org_id
  AND ou.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user's current project
CREATE OR REPLACE FUNCTION public.set_user_current_project(
  p_project_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_current_org_id INTEGER;
  v_project_org_id INTEGER;
  v_user_has_access BOOLEAN;
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
  
  -- Update user's current project
  UPDATE public.organization_users
  SET 
    current_project_id = p_project_id,
    last_accessed_at = NOW()
  WHERE user_id = v_user_id 
  AND organization_id = v_current_org_id
  AND status = 'active';
  
  -- If this is their first project in this org, also set as default
  UPDATE public.organization_users
  SET default_project_id = p_project_id
  WHERE user_id = v_user_id 
  AND organization_id = v_current_org_id
  AND status = 'active'
  AND default_project_id IS NULL;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to set user's default project
CREATE OR REPLACE FUNCTION public.set_user_default_project(
  p_project_id INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_current_org_id INTEGER;
  v_project_org_id INTEGER;
  v_user_has_access BOOLEAN;
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
  
  -- Update user's default project
  UPDATE public.organization_users
  SET default_project_id = p_project_id
  WHERE user_id = v_user_id 
  AND organization_id = v_current_org_id
  AND status = 'active';
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically set project context when user joins a project
CREATE OR REPLACE FUNCTION public.auto_set_project_context()
RETURNS TRIGGER AS $$
DECLARE
  v_org_membership RECORD;
BEGIN
  -- Only trigger for new active project memberships
  IF NEW.status = 'active' AND (OLD IS NULL OR OLD.status != 'active') THEN
    -- Get the user's organization membership
    SELECT * INTO v_org_membership
    FROM public.organization_users
    WHERE user_id = NEW.user_id
    AND organization_id = (
      SELECT organization_id FROM public.projects WHERE id = NEW.project_id
    )
    AND status = 'active';
    
    -- If user doesn't have a current project in this org, set this as current
    IF v_org_membership IS NOT NULL AND v_org_membership.current_project_id IS NULL THEN
      UPDATE public.organization_users
      SET current_project_id = NEW.project_id
      WHERE id = v_org_membership.id;
    END IF;
    
    -- If user doesn't have a default project in this org, set this as default
    IF v_org_membership IS NOT NULL AND v_org_membership.default_project_id IS NULL THEN
      UPDATE public.organization_users
      SET default_project_id = NEW.project_id
      WHERE id = v_org_membership.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS auto_set_project_context_trigger ON public.projects_users;
-- Create trigger to auto-set project context
CREATE TRIGGER auto_set_project_context_trigger
  AFTER INSERT OR UPDATE ON public.projects_users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_set_project_context();

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.get_user_project_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_current_project(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_default_project(INTEGER) TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN public.organization_users.current_project_id IS 'The user''s currently active project within this organization';
COMMENT ON COLUMN public.organization_users.default_project_id IS 'The user''s preferred default project when switching to this organization';
COMMENT ON FUNCTION public.get_user_project_context() IS 'Get the user''s current project context for their active organization';
COMMENT ON FUNCTION public.set_user_current_project(INTEGER) IS 'Set the user''s current active project with validation';
COMMENT ON FUNCTION public.set_user_default_project(INTEGER) IS 'Set the user''s default project for the current organization';
COMMENT ON FUNCTION public.auto_set_project_context() IS 'Automatically set project context when user joins a new project';
