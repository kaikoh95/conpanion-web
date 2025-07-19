-- Migration: Fix entity_type inconsistency between frontend and backend
-- Description: Frontend consistently uses 'task' (singular) for entity_type, but some notification 
-- functions still expect 'tasks' (plural). This migration updates all notification functions to 
-- use the consistent 'task' singular form.

-- Fix notify_approval_changes function
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
      WHEN 'task' THEN
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
    
    -- Notify all approvers
    FOR v_approver IN 
      SELECT * FROM approval_approvers
      WHERE approval_id = NEW.id
    LOOP
      PERFORM create_notification(
        p_user_id => v_approver.approver_id,
        p_type => 'approval_requested',
        p_template_name => 'requester_confirmation',
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
    
    -- Notify requester of status change
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
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Fix notify_approval_comment function
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
      WHEN 'task' THEN
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

-- Fix notify_approval_response function
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
      WHEN 'task' THEN
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
  
  -- Notify the requester
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

-- Add a comment explaining the fix
COMMENT ON FUNCTION notify_approval_changes IS 'Fixed entity_type to use task (singular) instead of tasks (plural)';
COMMENT ON FUNCTION notify_approval_comment IS 'Fixed entity_type to use task (singular) instead of tasks (plural)';
COMMENT ON FUNCTION notify_approval_response IS 'Fixed entity_type to use task (singular) instead of tasks (plural)';
