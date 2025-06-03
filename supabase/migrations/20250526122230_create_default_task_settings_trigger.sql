-- Migration: Create trigger to automatically create default statuses and priorities for new projects
-- Purpose: Ensure every new project has standard task statuses and priorities set up automatically
-- Affected tables: projects, statuses, priorities
-- Special considerations: Uses trigger to maintain data consistency and reduce setup friction

-- Function to create default statuses and priorities for a new project
CREATE OR REPLACE FUNCTION public.create_default_task_settings()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default statuses
  INSERT INTO public.statuses (name, color, position, is_default, project_id, created_by) VALUES
    ('To Do', '#6b7280', 1, true, NEW.id, NEW.created_by),
    ('In Progress', '#3b82f6', 2, false, NEW.id, NEW.created_by),
    ('In Review', '#f97316', 3, false, NEW.id, NEW.created_by),
    ('Done', '#22c55e', 4, false, NEW.id, NEW.created_by);

  -- Create default priorities
  INSERT INTO public.priorities (name, color, position, is_default, project_id, created_by) VALUES
    ('Low', '#22c55e', 1, false, NEW.id, NEW.created_by),
    ('Medium', '#eab308', 2, true, NEW.id, NEW.created_by),
    ('High', '#f97316', 3, false, NEW.id, NEW.created_by),
    ('Urgent', '#ef4444', 4, false, NEW.id, NEW.created_by);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS create_default_task_settings_trigger ON public.projects;

-- Create trigger that fires after project creation
CREATE TRIGGER create_default_task_settings_trigger
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_task_settings();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.create_default_task_settings() TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION public.create_default_task_settings() IS 'Automatically creates default statuses and priorities when a new project is created';
COMMENT ON TRIGGER create_default_task_settings_trigger ON public.projects IS 'Trigger that creates default task statuses and priorities for new projects';

-- Note: Default statuses created are:
-- 1. To Do (gray, #6b7280) - default status
-- 2. In Progress (blue, #3b82f6) 
-- 3. In Review (orange, #f97316)
-- 4. Done (green, #22c55e)

-- Note: Default priorities created are:
-- 1. Low (green, #22c55e)
-- 2. Medium (yellow, #eab308) - default priority
-- 3. High (orange, #f97316)
-- 4. Urgent (red, #ef4444)
