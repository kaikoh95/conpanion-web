-- ===========================================
-- EXCLUDE ACTION PERFORMERS FROM NOTIFICATIONS
-- ===========================================
-- This migration updates notification trigger functions to ensure that users
-- do not receive notifications for actions they perform themselves.

-- Fix task assignment notification trigger
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
    -- Skip notification if user is assigning themselves
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

-- Fix form assignment notification trigger
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
    -- Skip notification if user is assigning themselves
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
        'form_title', v_form.name,
        'project_id', v_form.project_id,
        'project_name', v_form.project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name
      ),
      p_entity_type => 'form',
      p_entity_id => v_form.id::TEXT,
      p_priority => 'high',
      p_created_by => NEW.assigned_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix approval notification trigger
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
    
    -- Notify the requester that their approval request was submitted
    -- This is intentional - requesters should know their request was created
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
    
    -- Notify all approvers (excluding the requester if they're also an approver)
    FOR v_approver IN 
      SELECT * FROM approval_approvers
      WHERE approval_id = NEW.id
      AND approver_id != NEW.requester_id  -- Exclude requester from approver notifications
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
          'role', 'approver'
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'high',
        p_created_by => NEW.requester_id
      );
    END LOOP;
    
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Get approver name if status changed
    IF NEW.user_id IS NOT NULL THEN
      SELECT first_name || ' ' || last_name INTO v_approved_by_name
      FROM user_profiles WHERE id = NEW.user_id;
    END IF;
    
    -- Notify requester of status change (only if they didn't make the change)
    IF NEW.requester_id != NEW.user_id THEN
      PERFORM create_notification(
        p_user_id => NEW.requester_id,
        p_type => 'approval_status_changed',
        p_template_name => 'default',
        p_template_data => ARRAY[NEW.status::text, COALESCE(v_entity_title, 'Unknown Item'), NEW.status::text, COALESCE(v_approved_by_name, 'Someone')],
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'entity_type', NEW.entity_type,
          'entity_id', NEW.entity_id,
          'entity_title', v_entity_title,
          'old_status', OLD.status::text,
          'new_status', NEW.status::text,
          'approved_by', NEW.user_id,
          'approved_by_name', v_approved_by_name
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'high',
        p_created_by => NEW.user_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix approval comment notification trigger
CREATE OR REPLACE FUNCTION notify_approval_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_approval RECORD;
  v_commenter_name TEXT;
  v_requester_id UUID;
  v_approver RECORD;
  v_entity_title TEXT;
BEGIN
  -- Get approval details
  SELECT * INTO v_approval
  FROM approvals
  WHERE id = NEW.approval_id;
  
  -- Get entity title
  IF v_approval.entity_type IS NOT NULL AND v_approval.entity_id IS NOT NULL THEN
    CASE v_approval.entity_type
      WHEN 'tasks' THEN
        SELECT title INTO v_entity_title FROM tasks WHERE id = v_approval.entity_id;
      WHEN 'form' THEN
        SELECT name INTO v_entity_title FROM forms WHERE id = v_approval.entity_id;
      WHEN 'entries' THEN
        SELECT name INTO v_entity_title FROM form_entries WHERE id = v_approval.entity_id;
      WHEN 'site_diary' THEN
        SELECT name INTO v_entity_title FROM site_diaries WHERE id = v_approval.entity_id;
      ELSE
        v_entity_title := 'Unknown Entity';
    END CASE;
  ELSE
    v_entity_title := 'General Approval';
  END IF;
  
  -- Get commenter name
  SELECT first_name || ' ' || last_name INTO v_commenter_name
  FROM user_profiles WHERE id = NEW.user_id;
  
  -- Notify the requester (if not the commenter)
  IF v_approval.requester_id != NEW.user_id THEN
    PERFORM create_notification(
      p_user_id => v_approval.requester_id,
      p_type => 'approval_requested',
      p_template_name => 'comment_notification',
      p_template_data => ARRAY[COALESCE(v_commenter_name, 'Someone'), COALESCE(v_entity_title, 'Unknown Item')],
      p_data => jsonb_build_object(
        'approval_id', NEW.approval_id,
        'comment_id', NEW.id,
        'comment_preview', LEFT(NEW.comment, 100),
        'entity_type', v_approval.entity_type,
        'entity_id', v_approval.entity_id,
        'entity_title', v_entity_title,
        'commenter_id', NEW.user_id,
        'commenter_name', v_commenter_name,
        'role', 'requester'
      ),
      p_entity_type => 'approval_comment',
      p_entity_id => NEW.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.user_id
    );
  END IF;
  
  -- Notify all other approvers (excluding the commenter)
  FOR v_approver IN 
    SELECT * FROM approval_approvers 
    WHERE approval_id = NEW.approval_id
    AND approver_id != NEW.user_id
  LOOP
    PERFORM create_notification(
      p_user_id => v_approver.approver_id,
      p_type => 'approval_requested',
      p_template_name => 'comment_notification',
      p_template_data => ARRAY[COALESCE(v_commenter_name, 'Someone'), COALESCE(v_entity_title, 'Unknown Item')],
      p_data => jsonb_build_object(
        'approval_id', NEW.approval_id,
        'comment_id', NEW.id,
        'comment_preview', LEFT(NEW.comment, 100),
        'entity_type', v_approval.entity_type,
        'entity_id', v_approval.entity_id,
        'entity_title', v_entity_title,
        'commenter_id', NEW.user_id,
        'commenter_name', v_commenter_name,
        'role', 'approver'
      ),
      p_entity_type => 'approval_comment',
      p_entity_id => NEW.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.user_id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix approval response notification trigger
CREATE OR REPLACE FUNCTION notify_approval_response()
RETURNS TRIGGER AS $$
DECLARE
  v_approval RECORD;
  v_approver_name TEXT;
  v_approver RECORD;
  v_entity_title TEXT;
BEGIN
  -- Get approval details
  SELECT * INTO v_approval
  FROM approvals
  WHERE id = NEW.approval_id;
  
  -- Get entity title
  IF v_approval.entity_type IS NOT NULL AND v_approval.entity_id IS NOT NULL THEN
    CASE v_approval.entity_type
      WHEN 'tasks' THEN
        SELECT title INTO v_entity_title FROM tasks WHERE id = v_approval.entity_id;
      WHEN 'form' THEN
        SELECT name INTO v_entity_title FROM forms WHERE id = v_approval.entity_id;
      WHEN 'entries' THEN
        SELECT name INTO v_entity_title FROM form_entries WHERE id = v_approval.entity_id;
      WHEN 'site_diary' THEN
        SELECT name INTO v_entity_title FROM site_diaries WHERE id = v_approval.entity_id;
      ELSE
        v_entity_title := 'Unknown Entity';
    END CASE;
  ELSE
    v_entity_title := 'General Approval';
  END IF;
  
  -- Get approver name
  SELECT first_name || ' ' || last_name INTO v_approver_name
  FROM user_profiles WHERE id = NEW.approver_id;
  
  -- Notify the requester (if not the same person who responded)
  IF v_approval.requester_id != NEW.approver_id THEN
    PERFORM create_notification(
      p_user_id => v_approval.requester_id,
      p_type => 'approval_status_changed',
      p_template_name => 'response_received',
      p_template_data => ARRAY[COALESCE(v_approver_name, 'An approver'), COALESCE(v_entity_title, 'Unknown Item')],
      p_data => jsonb_build_object(
        'approval_id', NEW.approval_id,
        'response_id', NEW.id,
        'response_status', NEW.status,
        'entity_type', v_approval.entity_type,
        'entity_id', v_approval.entity_id,
        'entity_title', v_entity_title,
        'approver_id', NEW.approver_id,
        'approver_name', v_approver_name,
        'comments', NEW.comment,
        'responded_at', NEW.responded_at
      ),
      p_entity_type => 'approval_response',
      p_entity_id => NEW.id::TEXT,
      p_priority => 'high',
      p_created_by => NEW.approver_id
    );
  END IF;
  
  -- Notify other approvers (excluding the one who responded)
  FOR v_approver IN 
    SELECT * FROM approval_approvers 
    WHERE approval_id = NEW.approval_id
    AND approver_id != NEW.approver_id
  LOOP
    PERFORM create_notification(
      p_user_id => v_approver.approver_id,
      p_type => 'approval_requested',
      p_template_name => 'response_notification',
      p_template_data => ARRAY[COALESCE(v_approver_name, 'An approver'), COALESCE(v_entity_title, 'Unknown Item')],
      p_data => jsonb_build_object(
        'approval_id', NEW.approval_id,
        'response_id', NEW.id,
        'response_status', NEW.status,
        'entity_type', v_approval.entity_type,
        'entity_id', v_approval.entity_id,
        'entity_title', v_entity_title,
        'approver_id', NEW.approver_id,
        'approver_name', v_approver_name,
        'comments', NEW.comment,
        'responded_at', NEW.responded_at
      ),
      p_entity_type => 'approval_response',
      p_entity_id => NEW.id::TEXT,
      p_priority => 'medium',
      p_created_by => NEW.approver_id
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also update the core create_notification function to add an additional safeguard
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type notification_type,
  p_template_name TEXT DEFAULT 'default',
  p_template_data TEXT[] DEFAULT '{}'::TEXT[],
  p_data JSONB DEFAULT '{}',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id TEXT DEFAULT NULL,
  p_priority notification_priority DEFAULT 'medium',
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_user_preferences RECORD;
  v_template RECORD;
  v_email_enabled BOOLEAN;
  v_push_enabled BOOLEAN;
  v_in_app_enabled BOOLEAN;
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;
  
  -- Additional safeguard: Don't send notifications to action performers for certain types
  -- (except system notifications and confirmation notifications)
  IF p_created_by IS NOT NULL AND p_user_id = p_created_by AND p_type NOT IN ('system', 'approval_requested') THEN
    -- Skip notification for action performer
    RETURN NULL;
  END IF;
  
  -- Get formatted template content
  SELECT subject, message INTO v_template
  FROM get_notification_template(p_type, p_template_name, p_template_data)
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No template found for type: %', p_type;
  END IF;
  
  -- Insert the notification
  INSERT INTO notifications (
    user_id, type, title, message, data, 
    entity_type, entity_id, priority, created_by
  ) VALUES (
    p_user_id, p_type, v_template.subject, v_template.message, p_data,
    p_entity_type, p_entity_id, p_priority, COALESCE(p_created_by, auth.uid())
  ) RETURNING id INTO v_notification_id;
  
  -- Record realtime delivery
  INSERT INTO notification_deliveries (
    notification_id,
    channel,
    status,
    delivered_at
  ) VALUES (
    v_notification_id,
    'realtime',
    'sent',
    NOW()
  );
  
  -- Check user preferences
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;
  
  -- If no preferences exist, create them with defaults
  IF NOT FOUND THEN
    -- Create default preferences for this type
    INSERT INTO notification_preferences (
      user_id,
      type,
      email_enabled,
      push_enabled,
      in_app_enabled
    ) VALUES (
      p_user_id,
      p_type,
      true,  -- Email enabled by default
      false, -- Push disabled by default (requires device registration)
      true   -- In-app enabled by default
    ) ON CONFLICT (user_id, type) DO NOTHING
    RETURNING email_enabled, push_enabled, in_app_enabled 
    INTO v_email_enabled, v_push_enabled, v_in_app_enabled;
    
    -- If insert failed due to race condition, get the existing preferences
    IF NOT FOUND THEN
      SELECT email_enabled, push_enabled, in_app_enabled 
      INTO v_email_enabled, v_push_enabled, v_in_app_enabled
      FROM notification_preferences
      WHERE user_id = p_user_id AND type = p_type;
    END IF;
  ELSE
    v_email_enabled := v_user_preferences.email_enabled;
    v_push_enabled := v_user_preferences.push_enabled;
    v_in_app_enabled := v_user_preferences.in_app_enabled;
  END IF;
  
  -- Queue email if enabled or system notification (system notifications always send email)
  IF p_type = 'system' OR COALESCE(v_email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;
  
  -- Queue push if enabled and user has devices
  IF COALESCE(v_push_enabled, false) THEN
    -- Only queue if user has registered devices
    IF EXISTS (SELECT 1 FROM user_devices WHERE user_id = p_user_id AND push_enabled = true) THEN
      PERFORM queue_push_notification(v_notification_id);
    END IF;
  END IF;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Migration completed: Updated notification triggers to exclude action performers from receiving notifications about their own actions, improving UX by reducing notification noise
