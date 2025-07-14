-- Migration: Fix notification function type casting
-- Description: Fix type casting issues in create_notification function calls
-- The function expects specific enum types but we were passing string literals

-- ===========================================
-- FIX TASK UPDATE NOTIFICATION FUNCTION
-- ===========================================

-- Fixed task update trigger with proper type casting
CREATE OR REPLACE FUNCTION notify_task_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_project_name TEXT;
  v_updater_name TEXT;
  v_assignee_id UUID;
  v_changes TEXT[] := '{}';
  v_change_summary TEXT;
  v_old_status_name TEXT;
  v_new_status_name TEXT;
  v_old_priority_name TEXT;
  v_new_priority_name TEXT;
BEGIN
  -- Skip if this is just an updated_at change (happens automatically)
  IF TG_OP = 'UPDATE' AND 
     NEW.title = OLD.title AND
     NEW.description = OLD.description AND
     NEW.status_id = OLD.status_id AND
     NEW.priority_id = OLD.priority_id AND
     NEW.due_date = OLD.due_date AND
     NEW.project_id = OLD.project_id AND
     NEW.parent_task_id = OLD.parent_task_id THEN
    -- Only updated_at changed, skip notification
    RETURN NEW;
  END IF;
  
  -- Get project name
  SELECT name INTO v_project_name 
  FROM projects WHERE id = NEW.project_id;
  
  -- Get updater name
  SELECT first_name || ' ' || last_name INTO v_updater_name 
  FROM user_profiles WHERE id = NEW.created_by;
  
  -- Build a list of what changed
  IF TG_OP = 'UPDATE' THEN
    -- Check each field for changes
    IF NEW.title IS DISTINCT FROM OLD.title THEN
      v_changes := array_append(v_changes, 'title');
    END IF;
    
    IF NEW.description IS DISTINCT FROM OLD.description THEN
      v_changes := array_append(v_changes, 'description');
    END IF;
    
    IF NEW.status_id IS DISTINCT FROM OLD.status_id THEN
      -- Get status names for better messaging
      SELECT name INTO v_old_status_name FROM statuses WHERE id = OLD.status_id;
      SELECT name INTO v_new_status_name FROM statuses WHERE id = NEW.status_id;
      v_changes := array_append(v_changes, format('status (%s → %s)', v_old_status_name, v_new_status_name));
    END IF;
    
    IF NEW.priority_id IS DISTINCT FROM OLD.priority_id THEN
      -- Get priority names for better messaging
      SELECT name INTO v_old_priority_name FROM priorities WHERE id = OLD.priority_id;
      SELECT name INTO v_new_priority_name FROM priorities WHERE id = NEW.priority_id;
      v_changes := array_append(v_changes, format('priority (%s → %s)', v_old_priority_name, v_new_priority_name));
    END IF;
    
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      v_changes := array_append(v_changes, 
        CASE 
          WHEN NEW.due_date IS NULL THEN 'due date (removed)'
          WHEN OLD.due_date IS NULL THEN format('due date (set to %s)', NEW.due_date::DATE)
          ELSE format('due date (%s → %s)', OLD.due_date::DATE, NEW.due_date::DATE)
        END
      );
    END IF;
    
    IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      v_changes := array_append(v_changes, 'project');
    END IF;
    
    IF NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id THEN
      v_changes := array_append(v_changes, 
        CASE 
          WHEN NEW.parent_task_id IS NULL THEN 'parent task (removed)'
          WHEN OLD.parent_task_id IS NULL THEN 'parent task (set)'
          ELSE 'parent task (changed)'
        END
      );
    END IF;
  END IF;
  
  -- Only proceed if there are meaningful changes
  IF array_length(v_changes, 1) > 0 THEN
    -- Create a user-friendly summary of changes
    v_change_summary := array_to_string(v_changes, ', ');
    
    -- Notify all assignees (excluding the person making the update)
    FOR v_assignee_id IN 
      SELECT user_id 
      FROM entity_assignees 
      WHERE entity_type = 'task' AND entity_id = NEW.id
    LOOP
      -- Skip if assignee is the one who updated the task
      IF v_assignee_id != NEW.created_by THEN
        PERFORM create_notification(
          p_user_id => v_assignee_id,
          p_type => 'task_updated'::notification_type, -- FIX: Proper type casting
          p_template_name => 'default',
          p_template_data => ARRAY[NEW.title, COALESCE(v_updater_name, 'Someone')],
          p_data => jsonb_build_object(
            'task_id', NEW.id,
            'task_title', NEW.title,
            'changes', v_changes,
            'change_summary', v_change_summary,
            'updated_by', NEW.created_by,
            'updater_name', v_updater_name,
            'project_name', v_project_name,
            -- Include old and new values for context
            'old_values', jsonb_build_object(
              'title', OLD.title,
              'description', OLD.description,
              'status_id', OLD.status_id,
              'priority_id', OLD.priority_id,
              'due_date', OLD.due_date,
              'project_id', OLD.project_id,
              'parent_task_id', OLD.parent_task_id
            ),
            'new_values', jsonb_build_object(
              'title', NEW.title,
              'description', NEW.description,
              'status_id', NEW.status_id,
              'priority_id', NEW.priority_id,
              'due_date', NEW.due_date,
              'project_id', NEW.project_id,
              'parent_task_id', NEW.parent_task_id
            )
          ),
          p_entity_type => 'task',
          p_entity_id => NEW.id::TEXT,
          p_priority => CASE  -- FIX: Proper type casting for priority
            WHEN 'status' = ANY(v_changes) THEN 'high'::notification_priority
            WHEN 'due date' = ANY(v_changes) THEN 'high'::notification_priority
            ELSE 'medium'::notification_priority
          END
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- FIX TASK METADATA NOTIFICATION FUNCTION
-- ===========================================

-- Fixed task metadata trigger with proper type casting
CREATE OR REPLACE FUNCTION notify_task_metadata_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_project_name TEXT;
  v_updater_name TEXT;
  v_assignee_id UUID;
  v_operation TEXT;
  v_change_description TEXT;
BEGIN
  -- Determine the operation type
  IF TG_OP = 'INSERT' THEN
    v_operation := 'added';
    v_change_description := format('added %s: %s', NEW.title, COALESCE(NEW.value, 'empty'));
  ELSIF TG_OP = 'UPDATE' THEN
    -- Skip if only updated_at changed
    IF NEW.title = OLD.title AND NEW.value = OLD.value THEN
      RETURN NEW;
    END IF;
    
    v_operation := 'updated';
    v_change_description := format('updated %s: %s → %s', 
      NEW.title, 
      COALESCE(OLD.value, 'empty'), 
      COALESCE(NEW.value, 'empty')
    );
  ELSIF TG_OP = 'DELETE' THEN
    v_operation := 'removed';
    v_change_description := format('removed %s: %s', OLD.title, COALESCE(OLD.value, 'empty'));
  END IF;
  
  -- Get task details (use NEW for INSERT/UPDATE, OLD for DELETE)
  SELECT t.*, p.name as project_name 
  INTO v_task
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
  WHERE t.id = COALESCE(NEW.task_id, OLD.task_id);
  
  -- Get updater name (use NEW for INSERT/UPDATE, OLD for DELETE)
  SELECT first_name || ' ' || last_name INTO v_updater_name 
  FROM user_profiles 
  WHERE id = COALESCE(NEW.created_by, OLD.created_by, auth.uid());
  
  -- Notify all task assignees (excluding the person making the update)
  FOR v_assignee_id IN 
    SELECT user_id 
    FROM entity_assignees 
    WHERE entity_type = 'task' AND entity_id = v_task.id
  LOOP
    -- Skip if assignee is the one who updated the metadata
    IF v_assignee_id != COALESCE(NEW.created_by, OLD.created_by, auth.uid()) THEN
      PERFORM create_notification(
        p_user_id => v_assignee_id,
        p_type => 'task_updated'::notification_type, -- FIX: Proper type casting
        p_template_name => 'default',
        p_template_data => ARRAY[v_task.title, COALESCE(v_updater_name, 'Someone')],
        p_data => jsonb_build_object(
          'task_id', v_task.id,
          'task_title', v_task.title,
          'metadata_change', true,
          'operation', v_operation,
          'metadata_key', COALESCE(NEW.title, OLD.title),
          'old_value', CASE WHEN TG_OP = 'DELETE' THEN OLD.value ELSE OLD.value END,
          'new_value', CASE WHEN TG_OP = 'INSERT' THEN NEW.value ELSE NEW.value END,
          'change_description', v_change_description,
          'updated_by', COALESCE(NEW.created_by, OLD.created_by, auth.uid()),
          'updater_name', v_updater_name,
          'project_name', v_task.project_name
        ),
        p_entity_type => 'task',
        p_entity_id => v_task.id::TEXT,
        p_priority => CASE  -- FIX: Proper type casting for priority
          WHEN COALESCE(NEW.title, OLD.title) IN ('due_date', 'status', 'priority') THEN 'high'::notification_priority
          ELSE 'medium'::notification_priority
        END,
        p_created_by => COALESCE(NEW.created_by, OLD.created_by, auth.uid())
      );
    END IF;
  END LOOP;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- RECREATE TRIGGERS
-- ===========================================

-- Drop and recreate triggers to ensure they use the updated functions
DROP TRIGGER IF EXISTS task_update_notification_trigger ON tasks;
CREATE TRIGGER task_update_notification_trigger
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_updates();

DROP TRIGGER IF EXISTS task_metadata_notification_trigger ON task_metadata;
CREATE TRIGGER task_metadata_notification_trigger
AFTER INSERT OR UPDATE OR DELETE ON task_metadata
FOR EACH ROW
EXECUTE FUNCTION notify_task_metadata_changes();

-- ===========================================
-- COMMENTS
-- ===========================================

COMMENT ON FUNCTION notify_task_updates IS 'Fixed function with proper type casting for notification_type and notification_priority enums';
COMMENT ON FUNCTION notify_task_metadata_changes IS 'Fixed function with proper type casting for notification_type and notification_priority enums';

-- Summary
SELECT 
  '🔧 TYPE CASTING ISSUES FIXED' as status,
  'All create_notification calls now use proper enum type casting' as description;

SELECT 
  '✅ Fixed Issues:' as category,
  '• p_type => ''task_updated''::notification_type' as fix_1,
  '• p_priority => ''high''::notification_priority / ''medium''::notification_priority' as fix_2,
  '• All enum parameters properly cast' as fix_3;
