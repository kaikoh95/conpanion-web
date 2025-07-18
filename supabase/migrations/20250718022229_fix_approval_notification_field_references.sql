-- ===========================================
-- FIX APPROVAL NOTIFICATION FIELD REFERENCES
-- ===========================================
-- This migration fixes the approval notification trigger functions to use the correct
-- field names from the approvals table schema (requester_id, user_id, action_taken_by)
-- instead of the non-existent created_by field.

-- Fix approval notification trigger
CREATE OR REPLACE FUNCTION notify_approval_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_approver RECORD;
  v_requester_name TEXT;
  v_approved_by_name TEXT;
  v_entity_title TEXT;
  v_changed_by UUID;
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
      p_created_by => NEW.requester_id  -- Use requester_id as the creator
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
        p_created_by => NEW.requester_id  -- Use requester_id as the creator
      );
    END LOOP;
    
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    -- Determine who made the change (action_taken_by or user_id)
    v_changed_by := COALESCE(NEW.action_taken_by, NEW.user_id);
    
    -- Get approver name if status changed (try action_taken_by first, then user_id)
    IF NEW.action_taken_by IS NOT NULL THEN
      SELECT first_name || ' ' || last_name INTO v_approved_by_name
      FROM user_profiles WHERE id = NEW.action_taken_by;
    ELSIF NEW.user_id IS NOT NULL THEN
      SELECT first_name || ' ' || last_name INTO v_approved_by_name
      FROM user_profiles WHERE id = NEW.user_id;
    END IF;
    
    -- Notify requester of status change (only if they didn't make the change)
    IF NEW.requester_id != v_changed_by THEN
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
          'approved_by', v_changed_by,
          'approved_by_name', v_approved_by_name
        ),
        p_entity_type => 'approval',
        p_entity_id => NEW.id::TEXT,
        p_priority => 'high',
        p_created_by => v_changed_by
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Migration completed: Fixed approval notification triggers to use correct field names (requester_id, user_id, action_taken_by) instead of non-existent created_by field
