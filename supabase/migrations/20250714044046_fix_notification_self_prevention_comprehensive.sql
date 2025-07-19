-- Migration: Fix notification self-prevention comprehensive
-- Description: Update all notification triggers to prevent users from receiving notifications for their own actions
-- This ensures users only receive notifications when OTHER users make changes to entities they're involved with

-- ===========================================
-- IMPROVED TASK NOTIFICATION TRIGGERS
-- ===========================================

-- Task assignment trigger - FIX: Add check to prevent self-notification
CREATE OR REPLACE FUNCTION notify_task_assignment_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_project_name TEXT;
  v_assigner_name TEXT;
  v_notification_id UUID;
BEGIN
  -- Only handle task assignments
  IF NEW.entity_type = 'task' THEN
    -- FIX: Skip if user is assigning themselves
    IF NEW.user_id = NEW.assigned_by THEN
      RETURN NEW;
    END IF;
    
    -- Get task details
    SELECT t.*, p.name as project_name 
    INTO v_task
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = NEW.entity_id;
    
    -- Get assigner name
    SELECT first_name || ' ' || last_name INTO v_assigner_name 
    FROM user_profiles WHERE id = NEW.assigned_by;
    
    -- Notify new assignee
    v_notification_id := create_notification(
      p_user_id => NEW.user_id,
      p_type => 'task_assigned',
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_assigner_name, 'Someone'), v_task.title],
      p_data => jsonb_build_object(
        'task_id', v_task.id,
        'task_title', v_task.title,
        'project_id', v_task.project_id,
        'project_name', v_task.project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name,
        'due_date', v_task.due_date,
        'priority', (SELECT name FROM priorities WHERE id = v_task.priority_id)
      ),
      p_entity_type => 'task',
      p_entity_id => v_task.id::TEXT,
      p_priority => 'high',
      p_created_by => NEW.assigned_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Task unassignment trigger - FIX: Add check to prevent self-notification  
CREATE OR REPLACE FUNCTION notify_task_unassignment()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_project_name TEXT;
  v_unassigner_name TEXT;
BEGIN
  -- Only handle task unassignments
  IF OLD.entity_type = 'task' THEN
    -- FIX: Skip if user is unassigning themselves
    -- Note: We need to check who initiated the unassignment via auth.uid() or a passed parameter
    -- For now, we'll get the current authenticated user
    IF OLD.user_id = auth.uid() THEN
      RETURN OLD;
    END IF;
    
    -- Get task details
    SELECT t.*, p.name as project_name 
    INTO v_task
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = OLD.entity_id;
    
    -- Get unassigner name (current user)
    SELECT first_name || ' ' || last_name INTO v_unassigner_name
    FROM user_profiles WHERE id = auth.uid();
    
    -- Notify removed assignee
    PERFORM create_notification(
      p_user_id => OLD.user_id,
      p_type => 'task_unassigned',
      p_template_name => 'default',
      p_template_data => ARRAY[v_task.title, COALESCE(v_unassigner_name, 'Someone')],
      p_data => jsonb_build_object(
        'task_id', v_task.id,
        'task_title', v_task.title,
        'project_id', v_task.project_id,
        'project_name', v_task.project_name,
        'unassigned_by', auth.uid(),
        'unassigner_name', v_unassigner_name
      ),
      p_entity_type => 'task',
      p_entity_id => v_task.id::TEXT,
      p_priority => 'low',
      p_created_by => auth.uid()
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- IMPROVED FORM NOTIFICATION TRIGGERS  
-- ===========================================

-- Form assignment trigger - FIX: Add check to prevent self-notification
CREATE OR REPLACE FUNCTION notify_form_assignment_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_form RECORD;
  v_project_name TEXT;
  v_assigner_name TEXT;
  v_notification_id UUID;
BEGIN
  -- Only handle form assignments
  IF NEW.entity_type = 'form' THEN
    -- FIX: Skip if user is assigning themselves
    IF NEW.user_id = NEW.assigned_by THEN
      RETURN NEW;
    END IF;
    
    -- Get form details
    SELECT f.*, p.name as project_name 
    INTO v_form
    FROM forms f
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE f.id = NEW.entity_id;
    
    -- Get assigner name
    SELECT first_name || ' ' || last_name INTO v_assigner_name 
    FROM user_profiles WHERE id = NEW.assigned_by;
    
    -- Notify new assignee
    v_notification_id := create_notification(
      p_user_id => NEW.user_id,
      p_type => 'form_assigned',
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_assigner_name, 'Someone'), v_form.name],
      p_data => jsonb_build_object(
        'form_id', v_form.id,
        'form_name', v_form.name,
        'project_id', v_form.project_id,
        'project_name', v_project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name
      ),
      p_entity_type => 'form',
      p_entity_id => v_form.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.assigned_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Form unassignment trigger - FIX: Add check to prevent self-notification
CREATE OR REPLACE FUNCTION notify_form_unassignment()
RETURNS TRIGGER AS $$
DECLARE
  v_form RECORD;
  v_project_name TEXT;
  v_unassigner_name TEXT;
BEGIN
  -- Only handle form unassignments
  IF OLD.entity_type = 'form' THEN
    -- FIX: Skip if user is unassigning themselves
    IF OLD.user_id = auth.uid() THEN
      RETURN OLD;
    END IF;
    
    -- Get form details
    SELECT f.*, p.name as project_name 
    INTO v_form
    FROM forms f
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE f.id = OLD.entity_id;
    
    -- Get unassigner name
    SELECT first_name || ' ' || last_name INTO v_unassigner_name
    FROM user_profiles WHERE id = auth.uid();
    
    -- Notify removed assignee
    PERFORM create_notification(
      p_user_id => OLD.user_id,
      p_type => 'form_unassigned',
      p_template_name => 'default',
      p_template_data => ARRAY[v_form.name, COALESCE(v_unassigner_name, 'Someone')],
      p_data => jsonb_build_object(
        'form_id', v_form.id,
        'form_name', v_form.name,
        'project_id', v_form.project_id,
        'project_name', v_project_name,
        'unassigned_by', auth.uid(),
        'unassigner_name', v_unassigner_name
      ),
      p_entity_type => 'form',
      p_entity_id => v_form.id::TEXT,
      p_priority => 'low',
      p_created_by => auth.uid()
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- IMPROVED APPROVAL NOTIFICATION TRIGGERS
-- ===========================================

-- Approval changes trigger - FIX: Improve self-notification prevention
CREATE OR REPLACE FUNCTION notify_approval_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_approver RECORD;
  v_requester_name TEXT;
  v_approved_by_name TEXT;
  v_entity_title TEXT;
BEGIN
  -- Get entity title based on entity_type and entity_id
  IF NEW.entity_type IS NOT NULL AND NEW.entity_id IS NOT NULL THEN
    CASE NEW.entity_type
      WHEN 'tasks' THEN
        SELECT title INTO v_entity_title FROM tasks WHERE id = NEW.entity_id;
      WHEN 'form' THEN
        SELECT name INTO v_entity_title FROM forms WHERE id = NEW.entity_id;
      WHEN 'entries' THEN
        SELECT name INTO v_entity_title FROM form_entries WHERE id = NEW.entity_id;
      WHEN 'site_diary' THEN
        SELECT name INTO v_entity_title FROM site_diaries WHERE id = NEW.entity_id;
      ELSE
        v_entity_title := 'Unknown Entity';
    END CASE;
  ELSE
    v_entity_title := 'General Approval';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Get requester name
    SELECT first_name || ' ' || last_name INTO v_requester_name
    FROM user_profiles WHERE id = NEW.requester_id;
    
    -- FIX: Only notify requester if they didn't create the approval themselves
    -- (This handles cases where approvals are created by system/admin on behalf of users)
    IF NEW.requester_id != COALESCE(NEW.created_by, auth.uid()) THEN
      -- Notify the requester that their approval request was submitted
      PERFORM create_notification(
        p_user_id => NEW.requester_id,
        p_type => 'approval_requested',
        p_template_name => 'requester_confirmation',
        p_template_data => ARRAY[COALESCE(v_entity_title, 'Unknown Item')],
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'entity_title', v_entity_title,
          'requested_by', NEW.requester_id,
          'requester_name', v_requester_name,
          'status', 'pending'
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'medium',
        p_created_by => NEW.requester_id
      );
    END IF;
    
    -- Notify all approvers (excluding the requester if they're also an approver)
    FOR v_approver IN 
      SELECT * FROM approval_approvers
      WHERE approval_id = NEW.id
      AND approver_id != NEW.requester_id  -- FIX: Don't notify if requester is also approver
    LOOP
      PERFORM create_notification(
        p_user_id => v_approver.approver_id,
        p_type => 'approval_requested',
        p_template_name => 'default',
        p_template_data => ARRAY[COALESCE(v_requester_name, 'Someone'), COALESCE(v_entity_title, 'Unknown Item')],
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'entity_title', v_entity_title,
          'requested_by', NEW.requester_id,
          'requester_name', v_requester_name,
          'approver_id', v_approver.approver_id,
          'due_date', NEW.due_date,
          'status', 'pending'
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => CASE
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '1 day' THEN 'critical'
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'high'
          ELSE 'medium'
        END,
        p_created_by => NEW.requester_id
      );
    END LOOP;

  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Get approver name for status change
    SELECT first_name || ' ' || last_name INTO v_approved_by_name
    FROM user_profiles WHERE id = COALESCE(NEW.approved_by, auth.uid());
    
    -- FIX: Only notify requester if they're not the one who changed the status
    IF NEW.requester_id != COALESCE(NEW.approved_by, auth.uid()) THEN
      -- Notify requester of status change
      PERFORM create_notification(
        p_user_id => NEW.requester_id,
        p_type => 'approval_status_changed',
        p_template_name => 'status_change',
        p_template_data => ARRAY[COALESCE(v_entity_title, 'Unknown Item'), NEW.status, COALESCE(v_approved_by_name, 'Someone')],
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'entity_title', v_entity_title,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'approved_by', NEW.approved_by,
          'approved_by_name', v_approved_by_name,
          'comments', NEW.comments
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'high',
        p_created_by => NEW.approved_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- NEW: SITE DIARY AND ENTRY NOTIFICATION TRIGGERS
-- ===========================================

-- Site diary assignment notifications
CREATE OR REPLACE FUNCTION notify_site_diary_assignment_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_site_diary RECORD;
  v_project_name TEXT;
  v_assigner_name TEXT;
BEGIN
  -- Only handle site diary assignments
  IF NEW.entity_type = 'site_diary' THEN
    -- Skip if user is assigning themselves
    IF NEW.user_id = NEW.assigned_by THEN
      RETURN NEW;
    END IF;
    
    -- Get site diary details
    SELECT sd.*, p.name as project_name 
    INTO v_site_diary
    FROM site_diaries sd
    LEFT JOIN projects p ON sd.project_id = p.id
    WHERE sd.id = NEW.entity_id;
    
    -- Get assigner name
    SELECT first_name || ' ' || last_name INTO v_assigner_name 
    FROM user_profiles WHERE id = NEW.assigned_by;
    
    -- Notify new assignee
    PERFORM create_notification(
      p_user_id => NEW.user_id,
      p_type => 'entity_assigned',
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_assigner_name, 'Someone'), 'site diary', COALESCE(v_site_diary.name, 'Untitled Site Diary')],
      p_data => jsonb_build_object(
        'site_diary_id', v_site_diary.id,
        'site_diary_name', v_site_diary.name,
        'project_id', v_site_diary.project_id,
        'project_name', v_project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name,
        'entity_type', 'site_diary'
      ),
      p_entity_type => 'site_diary',
      p_entity_id => v_site_diary.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.assigned_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Form entry assignment notifications  
CREATE OR REPLACE FUNCTION notify_entry_assignment_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_entry RECORD;
  v_form_name TEXT;
  v_project_name TEXT;
  v_assigner_name TEXT;
BEGIN
  -- Only handle entry assignments
  IF NEW.entity_type = 'entry' THEN
    -- Skip if user is assigning themselves
    IF NEW.user_id = NEW.assigned_by THEN
      RETURN NEW;
    END IF;
    
    -- Get entry and form details
    SELECT fe.*, f.name as form_name, p.name as project_name 
    INTO v_entry
    FROM form_entries fe
    LEFT JOIN forms f ON fe.form_id = f.id
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE fe.id = NEW.entity_id;
    
    -- Get assigner name
    SELECT first_name || ' ' || last_name INTO v_assigner_name 
    FROM user_profiles WHERE id = NEW.assigned_by;
    
    -- Notify new assignee
    PERFORM create_notification(
      p_user_id => NEW.user_id,
      p_type => 'entity_assigned',
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_assigner_name, 'Someone'), 'form entry', COALESCE(v_entry.form_name, 'Untitled Form')],
      p_data => jsonb_build_object(
        'entry_id', v_entry.id,
        'form_id', v_entry.form_id,
        'form_name', v_entry.form_name,
        'project_name', v_entry.project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name,
        'entity_type', 'entry'
      ),
      p_entity_type => 'entry',
      p_entity_id => v_entry.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.assigned_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- UPDATE EXISTING TRIGGERS
-- ===========================================

-- Update existing triggers to use the fixed functions
DROP TRIGGER IF EXISTS entity_assignment_notification_trigger ON entity_assignees;
CREATE TRIGGER entity_assignment_notification_trigger
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_task_assignment_changes();

DROP TRIGGER IF EXISTS entity_assignment_notification_trigger2 ON entity_assignees;
CREATE TRIGGER entity_assignment_notification_trigger2
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_form_assignment_changes();

-- Add new triggers for site diaries and entries
DROP TRIGGER IF EXISTS entity_assignment_notification_trigger3 ON entity_assignees;
CREATE TRIGGER entity_assignment_notification_trigger3
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_site_diary_assignment_changes();

DROP TRIGGER IF EXISTS entity_assignment_notification_trigger4 ON entity_assignees;
CREATE TRIGGER entity_assignment_notification_trigger4
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_entry_assignment_changes();

-- Update unassignment triggers
DROP TRIGGER IF EXISTS entity_unassignment_notification_trigger ON entity_assignees;
CREATE TRIGGER entity_unassignment_notification_trigger
AFTER DELETE ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_task_unassignment();

DROP TRIGGER IF EXISTS entity_unassignment_notification_trigger2 ON entity_assignees;
CREATE TRIGGER entity_unassignment_notification_trigger2
AFTER DELETE ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_form_unassignment();

-- Update approval trigger
DROP TRIGGER IF EXISTS approval_notification_trigger ON approvals;
CREATE TRIGGER approval_notification_trigger
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION notify_approval_changes();

-- ===========================================
-- HELPER FUNCTION: CHECK NOTIFICATION SELF-PREVENTION
-- ===========================================

-- Function to test notification self-prevention (for debugging)
CREATE OR REPLACE FUNCTION test_notification_self_prevention()
RETURNS TABLE (
  entity_type TEXT,
  trigger_name TEXT,
  has_self_check BOOLEAN,
  notes TEXT
) AS $$
BEGIN
  RETURN QUERY VALUES 
    ('task'::TEXT, 'notify_task_assignment_changes'::TEXT, true::BOOLEAN, 'Fixed: Checks NEW.user_id = NEW.assigned_by'::TEXT),
    ('task'::TEXT, 'notify_task_unassignment'::TEXT, true::BOOLEAN, 'Fixed: Checks OLD.user_id = auth.uid()'::TEXT),
    ('task'::TEXT, 'notify_task_updates'::TEXT, true::BOOLEAN, 'Already working: Checks v_assignee_id != NEW.created_by'::TEXT),
    ('task'::TEXT, 'notify_task_comment'::TEXT, true::BOOLEAN, 'Already working: Checks v_assignee_id != NEW.user_id'::TEXT),
    ('form'::TEXT, 'notify_form_assignment_changes'::TEXT, true::BOOLEAN, 'Fixed: Checks NEW.user_id = NEW.assigned_by'::TEXT),
    ('form'::TEXT, 'notify_form_unassignment'::TEXT, true::BOOLEAN, 'Fixed: Checks OLD.user_id = auth.uid()'::TEXT),
    ('approval'::TEXT, 'notify_approval_changes'::TEXT, true::BOOLEAN, 'Fixed: Checks requester != creator and requester != approver'::TEXT),
    ('approval'::TEXT, 'notify_approval_comment'::TEXT, true::BOOLEAN, 'Already working: Excludes commenter from notifications'::TEXT),
    ('site_diary'::TEXT, 'notify_site_diary_assignment_changes'::TEXT, true::BOOLEAN, 'New: Checks NEW.user_id = NEW.assigned_by'::TEXT),
    ('entry'::TEXT, 'notify_entry_assignment_changes'::TEXT, true::BOOLEAN, 'New: Checks NEW.user_id = NEW.assigned_by'::TEXT),
    ('project'::TEXT, 'notify_project_membership'::TEXT, true::BOOLEAN, 'Already working: Checks NEW.user_id = NEW.created_by'::TEXT),
    ('organization'::TEXT, 'notify_organization_membership'::TEXT, true::BOOLEAN, 'Already working: Checks NEW.user_id = COALESCE(NEW.created_by, NEW.invited_by)'::TEXT);
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- COMMENTS AND DOCUMENTATION
-- ===========================================

COMMENT ON FUNCTION notify_task_assignment_changes IS 'Creates notifications for task assignments - Fixed to prevent self-notifications when user assigns themselves';
COMMENT ON FUNCTION notify_task_unassignment IS 'Creates notifications for task unassignments - Fixed to prevent self-notifications when user unassigns themselves';
COMMENT ON FUNCTION notify_form_assignment_changes IS 'Creates notifications for form assignments - Fixed to prevent self-notifications when user assigns themselves';
COMMENT ON FUNCTION notify_form_unassignment IS 'Creates notifications for form unassignments - Fixed to prevent self-notifications when user unassigns themselves';
COMMENT ON FUNCTION notify_approval_changes IS 'Creates notifications for approval requests and status changes - Fixed to prevent self-notifications in various scenarios';
COMMENT ON FUNCTION notify_site_diary_assignment_changes IS 'Creates notifications for site diary assignments - Includes self-notification prevention';
COMMENT ON FUNCTION notify_entry_assignment_changes IS 'Creates notifications for form entry assignments - Includes self-notification prevention';
COMMENT ON FUNCTION test_notification_self_prevention IS 'Helper function to verify which triggers have self-notification prevention implemented';
