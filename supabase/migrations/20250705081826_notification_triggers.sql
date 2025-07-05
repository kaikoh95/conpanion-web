-- Migration: Create notification triggers
-- Description: Database triggers that create notifications automatically

-- Task assignment trigger (handles entity_assignees changes)
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
      p_title => 'New Task Assignment',
      p_message => format('%s assigned you to: %s', 
        COALESCE(v_assigner_name, 'Someone'), v_task.title),
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

-- Task unassignment trigger (handles entity_assignees deletions)
CREATE OR REPLACE FUNCTION notify_task_unassignment()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_project_name TEXT;
BEGIN
  -- Only handle task unassignments
  IF OLD.entity_type = 'task' THEN
    -- Get task details
    SELECT t.*, p.name as project_name 
    INTO v_task
    FROM tasks t
    LEFT JOIN projects p ON t.project_id = p.id
    WHERE t.id = OLD.entity_id;
    
    -- Notify removed assignee
    PERFORM create_notification(
      p_user_id => OLD.user_id,
      p_type => 'task_unassigned',
      p_title => 'Task Unassigned',
      p_message => format('You were removed from task: %s', v_task.title),
      p_data => jsonb_build_object(
        'task_id', v_task.id,
        'task_title', v_task.title,
        'project_id', v_task.project_id,
        'project_name', v_task.project_name
      ),
      p_entity_type => 'task',
      p_entity_id => v_task.id::TEXT,
      p_priority => 'low'
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Form assignment trigger (handles entity_assignees changes for forms)
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
      p_title => 'New Form Assignment',
      p_message => format('%s assigned you to form: %s', 
        COALESCE(v_assigner_name, 'Someone'), v_form.title),
      p_data => jsonb_build_object(
        'form_id', v_form.id,
        'form_title', v_form.title,
        'project_id', v_form.project_id,
        'project_name', v_form.project_name,
        'assigned_by', NEW.assigned_by,
        'assigner_name', v_assigner_name,
        'due_date', v_form.due_date
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

-- Form unassignment trigger (handles entity_assignees deletions for forms)
CREATE OR REPLACE FUNCTION notify_form_unassignment()
RETURNS TRIGGER AS $$
DECLARE
  v_form RECORD;
  v_project_name TEXT;
BEGIN
  -- Only handle form unassignments
  IF OLD.entity_type = 'form' THEN
    -- Get form details
    SELECT f.*, p.name as project_name 
    INTO v_form
    FROM forms f
    LEFT JOIN projects p ON f.project_id = p.id
    WHERE f.id = OLD.entity_id;
    
    -- Notify removed assignee
    PERFORM create_notification(
      p_user_id => OLD.user_id,
      p_type => 'form_unassigned',
      p_title => 'Form Unassigned',
      p_message => format('You were removed from form: %s', v_form.title),
      p_data => jsonb_build_object(
        'form_id', v_form.id,
        'form_title', v_form.title,
        'project_id', v_form.project_id,
        'project_name', v_form.project_name
      ),
      p_entity_type => 'form',
      p_entity_id => v_form.id::TEXT,
      p_priority => 'low'
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Task status/update trigger (handles task table changes)
CREATE OR REPLACE FUNCTION notify_task_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_project_name TEXT;
  v_updater_name TEXT;
  v_assignee_id UUID;
BEGIN
  -- Get project name
  SELECT name INTO v_project_name 
  FROM projects WHERE id = NEW.project_id;
  
  -- Get updater name
  SELECT first_name || ' ' || last_name INTO v_updater_name 
  FROM user_profiles WHERE id = NEW.created_by;
  
  -- Handle task status changes
  IF TG_OP = 'UPDATE' AND NEW.status_id IS DISTINCT FROM OLD.status_id THEN
    -- Get current assignees and notify them (if not updated by them)
    FOR v_assignee_id IN 
      SELECT user_id 
      FROM entity_assignees 
      WHERE entity_type = 'task' AND entity_id = NEW.id
    LOOP
      -- Skip if assignee is the one who updated the task
      IF v_assignee_id != NEW.created_by THEN
        PERFORM create_notification(
          p_user_id => v_assignee_id,
          p_type => 'task_updated',
          p_title => 'Task Status Updated',
          p_message => format('Task "%s" status was updated', NEW.title),
          p_data => jsonb_build_object(
            'task_id', NEW.id,
            'task_title', NEW.title,
            'old_status_id', OLD.status_id,
            'new_status_id', NEW.status_id,
            'updated_by', NEW.created_by,
            'updater_name', v_updater_name,
            'project_name', v_project_name
          ),
          p_entity_type => 'task',
          p_entity_id => NEW.id::TEXT,
          p_priority => 'medium'
        );
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for entity assignments
CREATE TRIGGER entity_assignment_notification_trigger
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_task_assignment_changes();

CREATE TRIGGER entity_assignment_notification_trigger2
AFTER INSERT ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_form_assignment_changes();

CREATE TRIGGER entity_unassignment_notification_trigger
AFTER DELETE ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_task_unassignment();

CREATE TRIGGER entity_unassignment_notification_trigger2
AFTER DELETE ON entity_assignees
FOR EACH ROW
EXECUTE FUNCTION notify_form_unassignment();

-- Create trigger for task updates
CREATE TRIGGER task_update_notification_trigger
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_updates();

-- Task comment trigger
CREATE OR REPLACE FUNCTION notify_task_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_commenter_name TEXT;
  v_mentioned_users TEXT[];
  v_user_id UUID;
  v_assignee_id UUID;
BEGIN
  -- Get task details
  SELECT t.*, p.name as project_name 
  INTO v_task
  FROM tasks t
  LEFT JOIN projects p ON t.project_id = p.id
  WHERE t.id = NEW.task_id;
  
  -- Get commenter name
  SELECT first_name || ' ' || last_name INTO v_commenter_name
  FROM user_profiles WHERE id = NEW.user_id;
  
  -- Notify all task assignees (if not the commenter)
  FOR v_assignee_id IN 
    SELECT user_id 
    FROM entity_assignees 
    WHERE entity_type = 'task' AND entity_id = NEW.task_id
  LOOP
    -- Skip if assignee is the commenter
    IF v_assignee_id != NEW.user_id THEN
      PERFORM create_notification(
        p_user_id => v_assignee_id,
        p_type => 'task_comment',
        p_title => 'New Comment on Your Task',
        p_message => format('%s commented on "%s"', 
          COALESCE(v_commenter_name, 'Someone'), v_task.title),
        p_data => jsonb_build_object(
          'task_id', NEW.task_id,
          'task_title', v_task.title,
          'comment_id', NEW.id,
          'comment_preview', LEFT(NEW.content, 100),
          'project_name', v_task.project_name,
          'commenter_id', NEW.user_id,
          'commenter_name', v_commenter_name
        ),
        p_entity_type => 'task_comment',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'medium',
        p_created_by => NEW.user_id
      );
    END IF;
  END LOOP;
  
  -- Extract @mentions from comment (format: @[user_id])
  v_mentioned_users := ARRAY(
    SELECT DISTINCT substring(mention from 3 for 36)::TEXT
    FROM unnest(string_to_array(NEW.content, ' ')) AS mention
    WHERE mention LIKE '@[%]'
  );
  
  -- Notify mentioned users
  FOREACH v_user_id IN ARRAY v_mentioned_users LOOP
    -- Skip if user is the commenter
    IF v_user_id::UUID != NEW.user_id THEN
      PERFORM create_notification(
        p_user_id => v_user_id::UUID,
        p_type => 'comment_mention',
        p_title => 'You were mentioned in a comment',
        p_message => format('%s mentioned you in "%s"', 
          COALESCE(v_commenter_name, 'Someone'), v_task.title),
        p_data => jsonb_build_object(
          'task_id', NEW.task_id,
          'task_title', v_task.title,
          'comment_id', NEW.id,
          'comment_preview', LEFT(NEW.content, 100),
          'project_name', v_task.project_name,
          'commenter_id', NEW.user_id,
          'commenter_name', v_commenter_name
        ),
        p_entity_type => 'task_comment',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'high',
        p_created_by => NEW.user_id
      );
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for task comments
CREATE TRIGGER task_comment_notification_trigger
AFTER INSERT ON task_comments
FOR EACH ROW
EXECUTE FUNCTION notify_task_comment();

-- Project membership trigger
CREATE OR REPLACE FUNCTION notify_project_membership()
RETURNS TRIGGER AS $$
DECLARE
  v_project_name TEXT;
  v_added_by_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Skip notification if user is adding themselves (during signup)
    IF NEW.user_id = NEW.created_by THEN
      RETURN NEW;
    END IF;
    
    -- Get project name
    SELECT name INTO v_project_name
    FROM projects WHERE id = NEW.project_id;
    
    -- Get added by name
    SELECT first_name || ' ' || last_name INTO v_added_by_name
    FROM user_profiles WHERE id = NEW.created_by;
    
    PERFORM create_notification(
      p_user_id => NEW.user_id,
      p_type => 'project_added',
      p_title => 'Added to Project',
      p_message => format('You have been added to project: %s', v_project_name),
      p_data => jsonb_build_object(
        'project_id', NEW.project_id,
        'project_name', v_project_name,
        'role', NEW.role,
        'added_by', NEW.created_by,
        'added_by_name', v_added_by_name
      ),
      p_entity_type => 'project',
      p_entity_id => NEW.project_id::TEXT,
      p_priority => 'high',
      p_created_by => NEW.created_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for project members
CREATE TRIGGER project_member_notification_trigger
AFTER INSERT ON projects_users
FOR EACH ROW
EXECUTE FUNCTION notify_project_membership();

-- Organization membership trigger
CREATE OR REPLACE FUNCTION notify_organization_membership()
RETURNS TRIGGER AS $$
DECLARE
  v_org_name TEXT;
  v_added_by_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Skip notification if user is adding themselves (during signup)
    IF NEW.user_id = COALESCE(NEW.created_by, NEW.invited_by) THEN
      RETURN NEW;
    END IF;
    
    -- Get organization name
    SELECT name INTO v_org_name
    FROM organizations WHERE id = NEW.organization_id;
    
    -- Get added by name (check both created_by and invited_by)
    SELECT first_name || ' ' || last_name INTO v_added_by_name
    FROM user_profiles WHERE id = COALESCE(NEW.created_by, NEW.invited_by);
    
    PERFORM create_notification(
      p_user_id => NEW.user_id,
      p_type => 'organization_added',
      p_title => 'Added to Organization',
      p_message => format('You have been added to %s', v_org_name),
      p_data => jsonb_build_object(
        'organization_id', NEW.organization_id,
        'organization_name', v_org_name,
        'role', NEW.role,
        'added_by', COALESCE(NEW.created_by, NEW.invited_by),
        'added_by_name', v_added_by_name
      ),
      p_entity_type => 'organization',
      p_entity_id => NEW.organization_id::TEXT,
      p_priority => 'high',
      p_created_by => COALESCE(NEW.created_by, NEW.invited_by)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for organization users
CREATE TRIGGER organization_user_notification_trigger
AFTER INSERT ON organization_users
FOR EACH ROW
EXECUTE FUNCTION notify_organization_membership();

-- Approval request trigger
CREATE OR REPLACE FUNCTION notify_approval_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_approver RECORD;
  v_requester_name TEXT;
  v_approved_by_name TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get requester name
    SELECT first_name || ' ' || last_name INTO v_requester_name
    FROM user_profiles WHERE id = NEW.requested_by;
    
    -- Notify all approvers
    FOR v_approver IN 
      SELECT * FROM approval_reviewers 
      WHERE approval_id = NEW.id
    LOOP
      PERFORM create_notification(
        p_user_id => v_approver.user_id,
        p_type => 'approval_requested',
        p_title => 'Approval Required',
        p_message => format('%s requested approval for: %s', 
          COALESCE(v_requester_name, 'Someone'), NEW.title),
        p_data => jsonb_build_object(
          'approval_id', NEW.id,
          'approval_type', NEW.form_type,
          'amount', NEW.amount,
          'due_date', NEW.due_date,
          'requested_by', NEW.requested_by,
          'requester_name', v_requester_name,
          'description', NEW.description
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => CASE 
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '1 day' THEN 'critical'
          WHEN NEW.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'high'
          ELSE 'medium'
        END,
        p_created_by => NEW.requested_by
      );
    END LOOP;
    
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Get approver name if status changed
    IF NEW.approved_by IS NOT NULL THEN
      SELECT first_name || ' ' || last_name INTO v_approved_by_name
      FROM user_profiles WHERE id = NEW.approved_by;
    END IF;
    
    -- Notify requester of status change
    PERFORM create_notification(
      p_user_id => NEW.requested_by,
      p_type => 'approval_status_changed',
      p_title => format('Approval %s', INITCAP(NEW.status)),
      p_message => format('Your approval request "%s" has been %s', 
        NEW.title, NEW.status),
      p_data => jsonb_build_object(
        'approval_id', NEW.id,
        'old_status', OLD.status,
        'new_status', NEW.status,
        'approved_by', NEW.approved_by,
        'approved_by_name', v_approved_by_name,
        'comments', NEW.notes
      ),
      p_entity_type => 'approval',
      p_entity_id => NEW.id::TEXT,
      p_priority => 'high',
      p_created_by => NEW.approved_by
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for approvals
CREATE TRIGGER approval_notification_trigger
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION notify_approval_changes();

-- Enable realtime for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Add comments
COMMENT ON TRIGGER entity_assignment_notification_trigger ON entity_assignees IS 'Creates notifications for task assignments';
COMMENT ON TRIGGER entity_assignment_notification_trigger2 ON entity_assignees IS 'Creates notifications for form assignments';
COMMENT ON TRIGGER entity_unassignment_notification_trigger ON entity_assignees IS 'Creates notifications for task unassignments';
COMMENT ON TRIGGER entity_unassignment_notification_trigger2 ON entity_assignees IS 'Creates notifications for form unassignments';
COMMENT ON TRIGGER task_update_notification_trigger ON tasks IS 'Creates notifications for task status changes';
COMMENT ON TRIGGER task_comment_notification_trigger ON task_comments IS 'Creates notifications for new comments and mentions';
COMMENT ON TRIGGER project_member_notification_trigger ON projects_users IS 'Creates notifications when users are added to projects';
COMMENT ON TRIGGER organization_user_notification_trigger ON organization_users IS 'Creates notifications when users are added to organizations';
COMMENT ON TRIGGER approval_notification_trigger ON approvals IS 'Creates notifications for approval requests and status changes';