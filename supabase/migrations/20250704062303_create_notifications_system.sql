-- Migration: Create Notifications System
-- Purpose: Create a comprehensive notification system that allows users to receive system-wide notifications
-- Affected tables: Creates notifications, notification_reads, notification_preferences tables
-- Special considerations: Supports system-wide and targeted notifications, real-time updates, user preferences

-- ========================================
-- STEP 1: Create notification types and enums
-- ========================================

-- Notification types for categorization
CREATE TYPE notification_type AS ENUM (
  'system_announcement',
  'approval_request',
  'approval_status_update', 
  'task_assignment',
  'task_status_update',
  'organization_invitation',
  'project_invitation',
  'form_submission',
  'site_diary_submission',
  'comment_mention',
  'due_date_reminder'
);

-- Priority levels
CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ========================================
-- STEP 2: Create main notifications table
-- ========================================

-- Main notifications table
CREATE TABLE notifications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority notification_priority DEFAULT 'medium',
  
  -- Recipients (system-wide, can target specific users)
  recipient_user_ids UUID[] DEFAULT '{}', -- Empty array means all users
  
  -- Optional context references
  entity_type TEXT, -- 'task', 'approval', 'organization', etc.
  entity_id BIGINT,
  
  -- Metadata for rich notifications
  metadata JSONB DEFAULT '{}',
  action_url TEXT, -- Deep link to relevant page
  
  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ, -- NULL means never expires
  is_active BOOLEAN DEFAULT TRUE,
  
  -- System tracking
  created_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT notifications_check_recipients CHECK (
    array_length(recipient_user_ids, 1) IS NULL OR 
    array_length(recipient_user_ids, 1) > 0
  )
);

-- ========================================
-- STEP 3: Create notification reads tracking table
-- ========================================

-- Track read status per user
CREATE TABLE notification_reads (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  notification_id BIGINT REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  
  -- Prevent duplicate reads
  UNIQUE(notification_id, user_id)
);

-- ========================================
-- STEP 4: Create notification preferences table
-- ========================================

-- User notification preferences
CREATE TABLE notification_preferences (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  
  -- Global preferences
  notifications_enabled BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,
  
  -- Per-type preferences (JSONB for flexibility)
  type_preferences JSONB DEFAULT '{}',
  
  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'UTC',
  
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ========================================
-- STEP 5: Create indexes for performance
-- ========================================

-- Notifications table indexes
CREATE INDEX notifications_recipient_user_ids_idx ON notifications USING GIN(recipient_user_ids);
CREATE INDEX notifications_created_at_idx ON notifications(created_at DESC);
CREATE INDEX notifications_type_idx ON notifications(type);
CREATE INDEX notifications_priority_idx ON notifications(priority);
CREATE INDEX notifications_is_active_idx ON notifications(is_active);
CREATE INDEX notifications_expires_at_idx ON notifications(expires_at);
CREATE INDEX notifications_entity_idx ON notifications(entity_type, entity_id);

-- Notification reads table indexes
CREATE INDEX notification_reads_notification_id_idx ON notification_reads(notification_id);
CREATE INDEX notification_reads_user_id_idx ON notification_reads(user_id);
CREATE INDEX notification_reads_read_at_idx ON notification_reads(read_at DESC);

-- Notification preferences table indexes
CREATE INDEX notification_preferences_user_id_idx ON notification_preferences(user_id);

-- ========================================
-- STEP 6: Add updated_at trigger for notification_preferences
-- ========================================

-- Add updated_at trigger for notification_preferences
CREATE TRIGGER handle_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- STEP 7: Create helper functions
-- ========================================

-- Function to get user notifications with read status
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
  ORDER BY n.created_at DESC
  LIMIT limit_param
  OFFSET offset_param;
END;
$$;

-- Function to get unread notification count for user
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
    );
    
  RETURN COALESCE(unread_count, 0);
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
  notification_id_param BIGINT,
  user_id_param UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert read record (ignore if already exists due to unique constraint)
  INSERT INTO notification_reads (notification_id, user_id)
  VALUES (notification_id_param, user_id_param)
  ON CONFLICT (notification_id, user_id) DO NOTHING;
  
  RETURN TRUE;
END;
$$;

-- Function to mark all notifications as read for user
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

-- Function to create notification (admin/system use)
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
BEGIN
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
    recipient_user_ids_param,
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
-- STEP 8: Enable Row Level Security (RLS)
-- ========================================

-- Enable RLS on all tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- ========================================
-- STEP 9: Create RLS Policies
-- ========================================

-- Notifications policies
-- Users can view notifications targeted to them or system-wide notifications
CREATE POLICY "Users can view their notifications"
ON notifications
FOR SELECT
TO authenticated
USING (
  is_active = TRUE
  AND (expires_at IS NULL OR expires_at > NOW())
  AND (
    array_length(recipient_user_ids, 1) IS NULL -- System-wide
    OR auth.uid() = ANY(recipient_user_ids) -- Targeted to user
  )
);

-- Only system/admin can insert notifications (handled by functions)
CREATE POLICY "System can create notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

-- Only system/admin can update notifications
CREATE POLICY "System can update notifications"
ON notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

-- Notification reads policies
-- Users can only manage their own read status
CREATE POLICY "Users can view their own read status"
ON notification_reads
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can mark their own notifications as read"
ON notification_reads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Notification preferences policies
-- Users can only manage their own preferences
CREATE POLICY "Users can view their own preferences"
ON notification_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON notification_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON notification_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- ========================================
-- STEP 10: Grant necessary permissions
-- ========================================

-- Grant permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON notifications TO authenticated;
GRANT SELECT, INSERT ON notification_reads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON notification_preferences TO authenticated;

-- Grant permissions to service role for functions
GRANT ALL ON notifications TO service_role;
GRANT ALL ON notification_reads TO service_role;
GRANT ALL ON notification_preferences TO service_role;

-- ========================================
-- STEP 11: Create default notification preferences for existing users
-- ========================================

-- Insert default preferences for existing users
INSERT INTO notification_preferences (user_id)
SELECT id FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

-- ========================================
-- STEP 12: Create trigger to auto-create preferences for new users
-- ========================================

-- Function to create default notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Trigger to create default preferences when user is created
CREATE TRIGGER create_default_notification_preferences_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Add comment for documentation
COMMENT ON TABLE notifications IS 'System-wide notifications that can target all users or specific users';
COMMENT ON TABLE notification_reads IS 'Tracks which notifications have been read by which users';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification delivery and settings';
COMMENT ON FUNCTION get_user_notifications IS 'Gets notifications for a user with read status and pagination';
COMMENT ON FUNCTION get_unread_notification_count IS 'Gets count of unread notifications for a user';
COMMENT ON FUNCTION mark_notification_read IS 'Marks a notification as read for a user';
COMMENT ON FUNCTION mark_all_notifications_read IS 'Marks all notifications as read for a user';
COMMENT ON FUNCTION create_notification IS 'Creates a new notification (system/admin use only)';
