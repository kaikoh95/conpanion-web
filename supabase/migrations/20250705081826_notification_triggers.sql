-- Migration: Create notification triggers
-- Description: Database triggers that create notifications automatically

-- Task assignment trigger
CREATE OR REPLACE FUNCTION notify_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_project_name TEXT;
  v_assigner_name TEXT;
  v_notification_id UUID;
  v_old_assignee_name TEXT;
  v_new_assignee_name TEXT;
BEGIN
  -- Handle task assignment changes
  IF TG_OP = 'UPDATE' AND 
     NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    
    -- Get project name
    SELECT name INTO v_project_name 
    FROM projects WHERE id = NEW.project_id;
    
    -- Get assigner name
    SELECT first_name || ' ' || last_name INTO v_assigner_name 
    FROM user_profiles WHERE id = NEW.updated_by;
    
    -- Notify new assignee
    IF NEW.assignee_id IS NOT NULL THEN
      v_notification_id := create_notification(
        p_user_id => NEW.assignee_id,
        p_type => 'task_assigned',
        p_title => 'New Task Assignment',
        p_message => format('%s assigned you to: %s', 
          COALESCE(v_assigner_name, 'Someone'), NEW.title),
        p_data => jsonb_build_object(
          'task_id', NEW.id,
          'task_title', NEW.title,
          'project_id', NEW.project_id,
          'project_name', v_project_name,
          'assigned_by', NEW.updated_by,
          'assigner_name', v_assigner_name,
          'due_date', NEW.due_date,
          'priority', NEW.priority
        ),
        p_entity_type => 'task',
        p_entity_id => NEW.id,
        p_priority => CASE 
          WHEN NEW.priority = 'urgent' THEN 'high'
          WHEN NEW.priority = 'high' THEN 'high'
          ELSE 'medium'
        END,
        p_created_by => NEW.updated_by
      );
    END IF;
    
    -- Notify old assignee if they were removed
    IF OLD.assignee_id IS NOT NULL AND NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
      -- Get new assignee name
      IF NEW.assignee_id IS NOT NULL THEN
        SELECT first_name || ' ' || last_name INTO v_new_assignee_name 
        FROM user_profiles WHERE id = NEW.assignee_id;
      END IF;
      
      PERFORM create_notification(
        p_user_id => OLD.assignee_id,
        p_type => 'task_unassigned',
        p_title => 'Task Reassigned',
        p_message => format('You were removed from task: %s', NEW.title),
        p_data => jsonb_build_object(
          'task_id', NEW.id,
          'task_title', NEW.title,
          'project_id', NEW.project_id,
          'project_name', v_project_name,
          'new_assignee', NEW.assignee_id,
          'new_assignee_name', v_new_assignee_name
        ),
        p_entity_type => 'task',
        p_entity_id => NEW.id,
        p_priority => 'low',
        p_created_by => NEW.updated_by
      );
    END IF;
  END IF;
  
  -- Handle task status changes
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify assignee of status change (if not changed by them)
    IF NEW.assignee_id IS NOT NULL AND NEW.assignee_id != NEW.updated_by THEN
      -- Get updater name
      SELECT first_name || ' ' || last_name INTO v_assigner_name 
      FROM user_profiles WHERE id = NEW.updated_by;
      
      PERFORM create_notification(
        p_user_id => NEW.assignee_id,
        p_type => 'task_updated',
        p_title => 'Task Status Updated',
        p_message => format('Task "%s" status changed from %s to %s', 
          NEW.title, OLD.status, NEW.status),
        p_data => jsonb_build_object(
          'task_id', NEW.id,
          'task_title', NEW.title,
          'old_status', OLD.status,
          'new_status', NEW.status,
          'updated_by', NEW.updated_by,
          'updater_name', v_assigner_name
        ),
        p_entity_type => 'task',
        p_entity_id => NEW.id,
        p_priority => 'medium'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for task changes
CREATE TRIGGER task_notification_trigger
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_changes();

-- Task comment trigger
CREATE OR REPLACE FUNCTION notify_task_comment()
RETURNS TRIGGER AS $$
DECLARE
  v_task RECORD;
  v_commenter_name TEXT;
  v_mentioned_users TEXT[];
  v_user_id UUID;
BEGIN
  -- Get task details
  SELECT t.*, p.name as project_name 
  INTO v_task
  FROM tasks t
  JOIN projects p ON t.project_id = p.id
  WHERE t.id = NEW.task_id;
  
  -- Get commenter name
  SELECT first_name || ' ' || last_name INTO v_commenter_name
  FROM user_profiles WHERE id = NEW.user_id;
  
  -- Notify task assignee (if not the commenter)
  IF v_task.assignee_id IS NOT NULL AND v_task.assignee_id != NEW.user_id THEN
    PERFORM create_notification(
      p_user_id => v_task.assignee_id,
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
      p_entity_id => NEW.id,
      p_priority => 'medium',
      p_created_by => NEW.user_id
    );
  END IF;
  
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
        p_entity_id => NEW.id,
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
      p_entity_id => NEW.project_id,
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
    -- Get organization name
    SELECT name INTO v_org_name
    FROM organizations WHERE id = NEW.organization_id;
    
    -- Get added by name
    SELECT first_name || ' ' || last_name INTO v_added_by_name
    FROM user_profiles WHERE id = NEW.created_by;
    
    PERFORM create_notification(
      p_user_id => NEW.user_id,
      p_type => 'organization_added',
      p_title => 'Added to Organization',
      p_message => format('You have been added to %s', v_org_name),
      p_data => jsonb_build_object(
        'organization_id', NEW.organization_id,
        'organization_name', v_org_name,
        'role', NEW.role,
        'added_by', NEW.created_by,
        'added_by_name', v_added_by_name
      ),
      p_entity_type => 'organization',
      p_entity_id => NEW.organization_id,
      p_priority => 'high',
      p_created_by => NEW.created_by
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
        p_entity_id => NEW.id,
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
      p_entity_id => NEW.id,
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

-- Add comment
COMMENT ON TRIGGER task_notification_trigger ON tasks IS 'Creates notifications for task assignment and status changes';
COMMENT ON TRIGGER task_comment_notification_trigger ON task_comments IS 'Creates notifications for new comments and mentions';
COMMENT ON TRIGGER project_member_notification_trigger ON projects_users IS 'Creates notifications when users are added to projects';
COMMENT ON TRIGGER organization_user_notification_trigger ON organization_users IS 'Creates notifications when users are added to organizations';
COMMENT ON TRIGGER approval_notification_trigger ON approvals IS 'Creates notifications for approval requests and status changes';