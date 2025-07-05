-- Migration: Create notification functions
-- Description: Core functions for the notification system

-- Function to queue email notification
CREATE OR REPLACE FUNCTION queue_email_notification(p_notification_id UUID)
RETURNS VOID AS $$
DECLARE
  v_notification RECORD;
  v_user_email TEXT;
  v_user_name TEXT;
BEGIN
  -- Get notification and user details
  SELECT 
    n.*,
    u.email,
    p.first_name || ' ' || p.last_name as full_name
  INTO v_notification
  FROM notifications n
  JOIN auth.users u ON n.user_id = u.id
  LEFT JOIN user_profiles p ON p.id = u.id
  WHERE n.id = p_notification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found: %', p_notification_id;
  END IF;
  
  -- Only queue if user has email
  IF v_notification.email IS NOT NULL THEN
    -- Insert into email queue
    INSERT INTO email_queue (
      notification_id,
      to_email,
      to_name,
      subject,
      template_id,
      template_data,
      priority,
      scheduled_for
    ) VALUES (
      p_notification_id,
      v_notification.email,
      v_notification.full_name,
      v_notification.title,
      v_notification.type || '_template',
      jsonb_build_object(
        'user_name', v_notification.full_name,
        'notification_title', v_notification.title,
        'notification_message', v_notification.message,
        'notification_data', v_notification.data,
        'action_url', '/notifications/' || p_notification_id
      ),
      v_notification.priority,
      CASE 
        WHEN v_notification.priority = 'critical' THEN NOW()
        WHEN v_notification.priority = 'high' THEN NOW() + INTERVAL '5 minutes'
        WHEN v_notification.priority = 'medium' THEN NOW() + INTERVAL '15 minutes'
        ELSE NOW() + INTERVAL '30 minutes'
      END
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to queue push notification
CREATE OR REPLACE FUNCTION queue_push_notification(p_notification_id UUID)
RETURNS VOID AS $$
DECLARE
  v_notification RECORD;
  v_device RECORD;
BEGIN
  -- Get notification details
  SELECT * INTO v_notification
  FROM notifications
  WHERE id = p_notification_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found: %', p_notification_id;
  END IF;
  
  -- Queue push for each user device
  FOR v_device IN 
    SELECT * FROM user_devices
    WHERE user_id = v_notification.user_id
    AND push_enabled = true
  LOOP
    INSERT INTO push_queue (
      notification_id,
      device_id,
      platform,
      token,
      payload,
      priority,
      scheduled_for
    ) VALUES (
      p_notification_id,
      v_device.id,
      v_device.platform,
      v_device.token,
      jsonb_build_object(
        'title', v_notification.title,
        'body', v_notification.message,
        'data', v_notification.data,
        'badge', 1,
        'sound', 'default',
        'click_action', '/notifications/' || p_notification_id
      ),
      v_notification.priority,
      NOW() -- Push notifications are sent immediately
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Master notification creation function
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT '{}',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_priority notification_priority DEFAULT 'medium',
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_user_preferences RECORD;
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
  END IF;
  
  IF p_title IS NULL OR p_title = '' THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  
  IF p_message IS NULL OR p_message = '' THEN
    RAISE EXCEPTION 'Message is required';
  END IF;
  
  -- Insert the notification
  INSERT INTO notifications (
    user_id, type, title, message, data, 
    entity_type, entity_id, priority, created_by
  ) VALUES (
    p_user_id, p_type, p_title, p_message, p_data,
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
    'delivered',
    NOW()
  );
  
  -- Check user preferences
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;
  
  -- Queue email if enabled or system notification
  IF p_type = 'system' OR COALESCE(v_user_preferences.email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;
  
  -- Queue push if enabled
  IF COALESCE(v_user_preferences.push_enabled, true) THEN
    PERFORM queue_push_notification(v_notification_id);
  END IF;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE notifications
  SET 
    is_read = true,
    read_at = NOW(),
    updated_at = NOW()
  WHERE id = p_notification_id
  AND user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notification not found or unauthorized';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_notifications_read()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET 
    is_read = true,
    read_at = NOW(),
    updated_at = NOW()
  WHERE user_id = auth.uid()
  AND is_read = false;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM notifications
  WHERE user_id = auth.uid()
  AND is_read = false;
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_notification TO service_role;
GRANT EXECUTE ON FUNCTION queue_email_notification TO service_role;
GRANT EXECUTE ON FUNCTION queue_push_notification TO service_role;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;

-- Add function comments
COMMENT ON FUNCTION create_notification IS 'Creates a notification and queues delivery to configured channels';
COMMENT ON FUNCTION queue_email_notification IS 'Queues an email for delivery based on notification';
COMMENT ON FUNCTION queue_push_notification IS 'Queues push notifications for all user devices';
COMMENT ON FUNCTION mark_notification_read IS 'Marks a single notification as read';
COMMENT ON FUNCTION mark_all_notifications_read IS 'Marks all notifications as read for the current user';
COMMENT ON FUNCTION get_unread_notification_count IS 'Returns the count of unread notifications for the current user';