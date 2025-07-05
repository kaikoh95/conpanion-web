-- Migration: Fix Notification Preferences Not Working
-- Purpose: Update notification functions to respect user preferences when creating and retrieving notifications
-- The issue: Users can toggle notification settings but they don't actually disable notifications
-- This fix ensures notifications respect user preferences for global toggles and type-specific settings

-- ========================================
-- STEP 1: Create helper function to check if user should receive notification
-- ========================================

-- Function to check if a user should receive a specific type of notification
CREATE OR REPLACE FUNCTION should_user_receive_notification(
  user_id_param UUID,
  notification_type_param notification_type
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_prefs RECORD;
  type_enabled BOOLEAN;
  current_time TIME;
  start_time TIME;
  end_time TIME;
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs 
  FROM notification_preferences 
  WHERE user_id = user_id_param;
  
  -- If no preferences found, create default and return true
  IF user_prefs IS NULL THEN
    INSERT INTO notification_preferences (user_id)
    VALUES (user_id_param)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN TRUE;
  END IF;
  
  -- Check if notifications are globally disabled
  IF user_prefs.notifications_enabled = FALSE THEN
    RETURN FALSE;
  END IF;
  
  -- Check type-specific preferences
  -- Extract the preference for this specific type from type_preferences JSONB
  type_enabled := COALESCE(
    (user_prefs.type_preferences ->> notification_type_param::text)::boolean,
    TRUE  -- Default to enabled if not specified
  );
  
  -- Check quiet hours if enabled
  IF user_prefs.quiet_hours_enabled = TRUE 
     AND user_prefs.quiet_hours_start IS NOT NULL 
     AND user_prefs.quiet_hours_end IS NOT NULL THEN
    
    -- Get current time in UTC (timezone conversion handled in UI)
    SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::TIME INTO current_time;
    SELECT user_prefs.quiet_hours_start INTO start_time;
    SELECT user_prefs.quiet_hours_end INTO end_time;
    
    -- Check if current time is within quiet hours
    -- Handle cases where quiet hours span midnight
    IF start_time <= end_time THEN
      -- Normal case: e.g., 09:00 to 17:00
      IF current_time >= start_time AND current_time <= end_time THEN
        RETURN FALSE;
      END IF;
    ELSE
      -- Spans midnight: e.g., 22:00 to 07:00 next day
      IF current_time >= start_time OR current_time <= end_time THEN
        RETURN FALSE;
      END IF;
    END IF;
  END IF;
  
  RETURN type_enabled;
END;
$$;

-- ========================================
-- STEP 2: Update get_user_notifications to respect preferences
-- ========================================

-- Update function to get user notifications with read status, now respecting preferences
CREATE OR REPLACE FUNCTION get_user_notifications(
  user_id_param UUID,
  limit_param INTEGER DEFAULT 20,
  offset_param INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT,
  type notification_type,
  title TEXT,
  message TEXT,
  priority notification_priority,
  entity_type TEXT,
  entity_id BIGINT,
  metadata JSONB,
  action_url TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_read BOOLEAN,
  read_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    n.id,
    n.type,
    n.title,
    n.message,
    n.priority,
    n.entity_type,
    n.entity_id,
    n.metadata,
    n.action_url,
    n.created_at,
    n.expires_at,
    (nr.notification_id IS NOT NULL) AS is_read,
    nr.read_at
  FROM notifications n
  LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
  WHERE 
    n.is_active = TRUE
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND (
      array_length(n.recipient_user_ids, 1) IS NULL -- All users
      OR user_id_param = ANY(n.recipient_user_ids) -- Specific user
    )
    -- NEW: Check if user should receive this notification type
    AND should_user_receive_notification(user_id_param, n.type) = TRUE
  ORDER BY n.created_at DESC
  LIMIT limit_param
  OFFSET offset_param;
END;
$$;

-- ========================================
-- STEP 3: Update get_unread_notification_count to respect preferences
-- ========================================

-- Update function to get unread notification count, now respecting preferences
CREATE OR REPLACE FUNCTION get_unread_notification_count(user_id_param UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  unread_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO unread_count
  FROM notifications n
  LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
  WHERE 
    n.is_active = TRUE
    AND (n.expires_at IS NULL OR n.expires_at > NOW())
    AND nr.notification_id IS NULL -- Not read
    AND (
      array_length(n.recipient_user_ids, 1) IS NULL -- All users
      OR user_id_param = ANY(n.recipient_user_ids) -- Specific user
    )
    -- NEW: Check if user should receive this notification type
    AND should_user_receive_notification(user_id_param, n.type) = TRUE;
    
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- ========================================
-- STEP 4: Update create_notification to filter recipients by preferences
-- ========================================

-- Update function to create notification, now filtering recipients based on preferences
CREATE OR REPLACE FUNCTION create_notification(
  type_param notification_type,
  title_param TEXT,
  message_param TEXT,
  priority_param notification_priority DEFAULT 'medium',
  recipient_user_ids_param UUID[] DEFAULT '{}',
  entity_type_param TEXT DEFAULT NULL,
  entity_id_param BIGINT DEFAULT NULL,
  metadata_param JSONB DEFAULT '{}',
  action_url_param TEXT DEFAULT NULL,
  expires_at_param TIMESTAMPTZ DEFAULT NULL,
  created_by_param UUID DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id BIGINT;
  filtered_recipients UUID[] := '{}';
  recipient_user UUID;
BEGIN
  -- If specific recipients are provided, filter them based on preferences
  IF array_length(recipient_user_ids_param, 1) > 0 THEN
    -- Filter recipients based on their notification preferences
    FOREACH recipient_user IN ARRAY recipient_user_ids_param
    LOOP
      IF should_user_receive_notification(recipient_user, type_param) = TRUE THEN
        filtered_recipients := array_append(filtered_recipients, recipient_user);
      END IF;
    END LOOP;
    
    -- If no recipients remain after filtering, don't create the notification
    IF array_length(filtered_recipients, 1) IS NULL OR array_length(filtered_recipients, 1) = 0 THEN
      -- Return a special ID to indicate notification was not created due to preferences
      RETURN -1;
    END IF;
  ELSE
    -- For system-wide notifications (empty recipient array), keep as is
    -- Individual user preferences will be checked when retrieving notifications
    filtered_recipients := recipient_user_ids_param;
  END IF;

  INSERT INTO notifications (
    type,
    title,
    message,
    priority,
    recipient_user_ids,
    entity_type,
    entity_id,
    metadata,
    action_url,
    expires_at,
    created_by
  )
  VALUES (
    type_param,
    title_param,
    message_param,
    priority_param,
    filtered_recipients,
    entity_type_param,
    entity_id_param,
    metadata_param,
    action_url_param,
    expires_at_param,
    created_by_param
  )
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- ========================================
-- STEP 5: Update mark_all_notifications_read to respect preferences
-- ========================================

-- Update function to mark all notifications as read, now respecting preferences
CREATE OR REPLACE FUNCTION mark_all_notifications_read(user_id_param UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  WITH unread_notifications AS (
    SELECT n.id
    FROM notifications n
    LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = user_id_param
    WHERE 
      n.is_active = TRUE
      AND (n.expires_at IS NULL OR n.expires_at > NOW())
      AND nr.notification_id IS NULL -- Not read
      AND (
        array_length(n.recipient_user_ids, 1) IS NULL -- All users
        OR user_id_param = ANY(n.recipient_user_ids) -- Specific user
      )
      -- NEW: Check if user should receive this notification type
      AND should_user_receive_notification(user_id_param, n.type) = TRUE
  ),
  inserted_reads AS (
    INSERT INTO notification_reads (notification_id, user_id)
    SELECT id, user_id_param FROM unread_notifications
    ON CONFLICT (notification_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::INTEGER INTO affected_count FROM inserted_reads;
  
  RETURN COALESCE(affected_count, 0);
END;
$$;

-- ========================================
-- STEP 6: Add comments for documentation
-- ========================================

COMMENT ON FUNCTION should_user_receive_notification IS 'Checks if a user should receive a specific type of notification based on their preferences, quiet hours, and global settings';
COMMENT ON FUNCTION get_user_notifications IS 'Gets notifications for a user with read status, pagination, and preference filtering';
COMMENT ON FUNCTION get_unread_notification_count IS 'Gets count of unread notifications for a user, respecting their preferences';
COMMENT ON FUNCTION create_notification IS 'Creates a new notification, filtering recipients based on their preferences';
COMMENT ON FUNCTION mark_all_notifications_read IS 'Marks all notifications as read for a user, respecting their preferences';

-- ========================================
-- STEP 7: Create index for better performance
-- ========================================

-- Add index on type_preferences for faster JSONB lookups
CREATE INDEX IF NOT EXISTS notification_preferences_type_preferences_gin_idx 
ON notification_preferences USING GIN(type_preferences);