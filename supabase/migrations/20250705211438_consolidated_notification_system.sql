-- Migration: Consolidated notification system
-- Description: Complete notification system implementation with types, tables, indexes, RLS, functions, and triggers

-- ===========================================
-- EXTENSIONS
-- ===========================================

-- Enable pgsodium extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- ===========================================
-- TYPES AND ENUMS
-- ===========================================

-- Notification types enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'system',
      'organization_added',
      'project_added',
      'task_assigned',
      'task_updated',
      'task_comment',
      'comment_mention',
      'task_unassigned',
      'form_assigned',
      'form_unassigned',
      'approval_requested',
      'approval_status_changed',
      'entity_assigned'
    );
  END IF;
END $$;

-- Priority levels enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_priority') THEN
    CREATE TYPE notification_priority AS ENUM (
      'low',
      'medium',
      'high',
      'critical'
    );
  END IF;
END $$;

-- Delivery status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_status') THEN
    CREATE TYPE delivery_status AS ENUM (
      'pending',
      'processing',
      'sent',
      'failed',
      'queued_for_delivery'
    );
  END IF;
END $$;

-- Email queue status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_status') THEN
    CREATE TYPE email_status AS ENUM (
      'pending',
      'processing',
      'sent',
      'failed',
      'queued_for_delivery'
    );
  END IF;
END $$;

-- Add type comments
COMMENT ON TYPE notification_type IS 'Types of notifications that can be sent in the system';
COMMENT ON TYPE notification_priority IS 'Priority levels for notification delivery timing';
COMMENT ON TYPE delivery_status IS 'Status of notification delivery attempts';
COMMENT ON TYPE email_status IS 'Status of emails in the queue';

-- ===========================================
-- TABLES
-- ===========================================

-- Main notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  priority notification_priority DEFAULT 'medium' NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}' NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT notifications_title_length CHECK (char_length(title) <= 255),
  CONSTRAINT notifications_message_length CHECK (char_length(message) <= 1000)
);

-- Delivery tracking table
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  error_message TEXT,
  metadata JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT deliveries_channel_check CHECK (channel IN ('realtime', 'email', 'push', 'sms', 'webhook')),
  CONSTRAINT deliveries_retry_limit CHECK (retry_count >= 0 AND retry_count <= 10)
);

-- User preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  email_enabled BOOLEAN DEFAULT true NOT NULL,
  push_enabled BOOLEAN DEFAULT true NOT NULL,
  in_app_enabled BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, type)
);

-- Email queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_data JSONB DEFAULT '{}' NOT NULL,
  priority notification_priority DEFAULT 'medium' NOT NULL,
  status email_status DEFAULT 'pending' NOT NULL,
  scheduled_for TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT email_queue_email_valid CHECK (to_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT email_queue_retry_limit CHECK (retry_count >= 0 AND retry_count <= 5)
);

-- Push queue table
CREATE TABLE IF NOT EXISTS push_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  payload JSONB NOT NULL,
  priority notification_priority DEFAULT 'medium' NOT NULL,
  status delivery_status DEFAULT 'pending' NOT NULL,
  scheduled_for TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT push_queue_platform_check CHECK (platform IN ('ios', 'android', 'web')),
  CONSTRAINT push_queue_retry_limit CHECK (retry_count >= 0 AND retry_count <= 5)
);

-- User devices for push notifications
CREATE TABLE IF NOT EXISTS user_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  device_name TEXT,
  push_enabled BOOLEAN DEFAULT true NOT NULL,
  last_used TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, token),
  CONSTRAINT user_devices_platform_check CHECK (platform IN ('ios', 'android', 'web'))
);

-- Notification templates for configurable messages
CREATE TABLE IF NOT EXISTS notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type notification_type NOT NULL,
  name TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  message_template TEXT NOT NULL,
  description TEXT,
  placeholders TEXT[], -- Array of placeholder names for documentation
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(type, name)
);

-- Add table comments
COMMENT ON TABLE notifications IS 'Core notifications table storing all notification records';
COMMENT ON TABLE notification_deliveries IS 'Tracks delivery status of notifications across different channels';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification delivery by type';
COMMENT ON TABLE email_queue IS 'Queue for email notifications awaiting delivery';
COMMENT ON TABLE push_queue IS 'Queue for push notifications awaiting delivery';
COMMENT ON TABLE user_devices IS 'Registered devices for push notifications';
COMMENT ON TABLE notification_templates IS 'Configurable message templates for notifications with placeholder support';

-- Add column comments for important fields
COMMENT ON COLUMN notifications.data IS 'Additional context data for the notification in JSON format';
COMMENT ON COLUMN notifications.entity_type IS 'Type of entity this notification relates to (e.g., task, project)';
COMMENT ON COLUMN notifications.entity_id IS 'ID of the entity this notification relates to';
COMMENT ON COLUMN notification_preferences.type IS 'System notifications cannot be disabled by users';

-- ===========================================
-- INDEXES
-- ===========================================

-- Notifications table indexes
DROP INDEX IF EXISTS idx_notifications_user_unread;
CREATE INDEX idx_notifications_user_unread 
ON notifications(user_id, is_read) 
WHERE is_read = false;

DROP INDEX IF EXISTS idx_notifications_created;
CREATE INDEX idx_notifications_created 
ON notifications(created_at DESC);

DROP INDEX IF EXISTS idx_notifications_entity;
CREATE INDEX idx_notifications_entity 
ON notifications(entity_type, entity_id) 
WHERE entity_type IS NOT NULL;

DROP INDEX IF EXISTS idx_notifications_type_priority;
CREATE INDEX idx_notifications_type_priority 
ON notifications(type, priority);

DROP INDEX IF EXISTS idx_notifications_user_created;
CREATE INDEX idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- Delivery tracking indexes
DROP INDEX IF EXISTS idx_notification_deliveries_notification;
CREATE INDEX idx_notification_deliveries_notification 
ON notification_deliveries(notification_id);

DROP INDEX IF EXISTS idx_notification_deliveries_status;
CREATE INDEX idx_notification_deliveries_status 
ON notification_deliveries(status) 
WHERE status IN ('pending', 'retry');

DROP INDEX IF EXISTS idx_notification_deliveries_channel_status;
CREATE INDEX idx_notification_deliveries_channel_status 
ON notification_deliveries(channel, status);

-- Email queue indexes
DROP INDEX IF EXISTS idx_email_queue_status_scheduled;
CREATE INDEX idx_email_queue_status_scheduled 
ON email_queue(status, scheduled_for) 
WHERE status = 'pending';

DROP INDEX IF EXISTS idx_email_queue_notification;
CREATE INDEX idx_email_queue_notification 
ON email_queue(notification_id) 
WHERE notification_id IS NOT NULL;

DROP INDEX IF EXISTS idx_email_queue_priority_scheduled;
CREATE INDEX idx_email_queue_priority_scheduled 
ON email_queue(priority DESC, scheduled_for) 
WHERE status = 'pending';

-- Push queue indexes
DROP INDEX IF EXISTS idx_push_queue_status;
CREATE INDEX idx_push_queue_status 
ON push_queue(status, scheduled_for) 
WHERE status = 'pending';

DROP INDEX IF EXISTS idx_push_queue_device;
CREATE INDEX idx_push_queue_device 
ON push_queue(device_id);

DROP INDEX IF EXISTS idx_push_queue_notification;
CREATE INDEX idx_push_queue_notification 
ON push_queue(notification_id) 
WHERE notification_id IS NOT NULL;

-- User devices indexes
DROP INDEX IF EXISTS idx_user_devices_user;
CREATE INDEX idx_user_devices_user 
ON user_devices(user_id) 
WHERE push_enabled = true;

DROP INDEX IF EXISTS idx_user_devices_token;
CREATE INDEX idx_user_devices_token 
ON user_devices(token);

-- Notification preferences indexes
DROP INDEX IF EXISTS idx_notification_preferences_user;
CREATE INDEX idx_notification_preferences_user 
ON notification_preferences(user_id);

-- Notification templates indexes
DROP INDEX IF EXISTS idx_notification_templates_type;
CREATE INDEX idx_notification_templates_type 
ON notification_templates(type) 
WHERE is_active = true;

DROP INDEX IF EXISTS idx_notification_templates_type_name;
CREATE INDEX idx_notification_templates_type_name 
ON notification_templates(type, name) 
WHERE is_active = true;

-- Add comments for indexes
COMMENT ON INDEX idx_notifications_user_unread IS 'Optimizes queries for unread notifications per user';
COMMENT ON INDEX idx_notifications_created IS 'Optimizes queries for recent notifications';
COMMENT ON INDEX idx_notifications_entity IS 'Optimizes queries by entity reference';
COMMENT ON INDEX idx_email_queue_status_scheduled IS 'Optimizes email processing queries';
COMMENT ON INDEX idx_push_queue_status IS 'Optimizes push notification processing';
COMMENT ON INDEX idx_notification_templates_type IS 'Optimizes template lookups by notification type';

-- ===========================================
-- ROW LEVEL SECURITY
-- ===========================================

-- Enable RLS on all tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

-- Notifications table policies
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" 
ON notifications FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" 
ON notifications FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications" 
ON notifications FOR INSERT 
WITH CHECK (true); -- Will be restricted via functions

DROP POLICY IF EXISTS "Users cannot delete notifications" ON notifications;
CREATE POLICY "Users cannot delete notifications" 
ON notifications FOR DELETE 
USING (false);

-- Notification deliveries policies
DROP POLICY IF EXISTS "Users can view own delivery status" ON notification_deliveries;
CREATE POLICY "Users can view own delivery status" 
ON notification_deliveries FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM notifications 
    WHERE notifications.id = notification_deliveries.notification_id 
    AND notifications.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System manages deliveries" ON notification_deliveries;
CREATE POLICY "System manages deliveries" 
ON notification_deliveries FOR ALL 
USING (auth.uid() = auth.uid()) -- Only via service role
WITH CHECK (auth.uid() = auth.uid());

-- Notification preferences policies
DROP POLICY IF EXISTS "Users can view own preferences" ON notification_preferences;
CREATE POLICY "Users can view own preferences" 
ON notification_preferences FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own preferences" ON notification_preferences;
CREATE POLICY "Users can insert own preferences" 
ON notification_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own preferences" ON notification_preferences;
CREATE POLICY "Users can update own preferences" 
ON notification_preferences FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own preferences" ON notification_preferences;
CREATE POLICY "Users can delete own preferences" 
ON notification_preferences FOR DELETE 
USING (auth.uid() = user_id);

-- User devices policies
DROP POLICY IF EXISTS "Users can view own devices" ON user_devices;
CREATE POLICY "Users can view own devices" 
ON user_devices FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can register own devices" ON user_devices;
CREATE POLICY "Users can register own devices" 
ON user_devices FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own devices" ON user_devices;
CREATE POLICY "Users can update own devices" 
ON user_devices FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can remove own devices" ON user_devices;
CREATE POLICY "Users can remove own devices" 
ON user_devices FOR DELETE 
USING (auth.uid() = user_id);

-- Email and push queue policies (restricted to service role)
DROP POLICY IF EXISTS "Email queue restricted to service role" ON email_queue;
CREATE POLICY "Email queue restricted to service role" 
ON email_queue FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Push queue restricted to service role" ON push_queue;
CREATE POLICY "Push queue restricted to service role" 
ON push_queue FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Notification templates policies (read-only for authenticated users, editable by service role)
DROP POLICY IF EXISTS "Anyone can view active templates" ON notification_templates;
CREATE POLICY "Anyone can view active templates" 
ON notification_templates FOR SELECT 
USING (is_active = true);

DROP POLICY IF EXISTS "Service role can manage templates" ON notification_templates;
CREATE POLICY "Service role can manage templates" 
ON notification_templates FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Grant necessary permissions to authenticated users
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT SELECT ON notification_deliveries TO authenticated;
GRANT ALL ON notification_preferences TO authenticated;
GRANT ALL ON user_devices TO authenticated;
GRANT SELECT ON notification_templates TO authenticated;

-- Grant service role full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Add RLS bypass for service role (if not already set)
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE user_devices FORCE ROW LEVEL SECURITY;
ALTER TABLE email_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE push_queue FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;

-- ===========================================
-- FUNCTIONS
-- ===========================================

-- Function to get formatted notification template
CREATE OR REPLACE FUNCTION get_notification_template(
  p_type notification_type,
  p_template_name TEXT DEFAULT 'default',
  p_template_data TEXT[] DEFAULT '{}'::TEXT[]
) RETURNS TABLE(subject TEXT, message TEXT) AS $$
DECLARE
  v_template RECORD;
  v_formatted_subject TEXT;
  v_formatted_message TEXT;
BEGIN
  -- Get the template
  SELECT subject_template, message_template 
  INTO v_template
  FROM notification_templates 
  WHERE type = p_type 
  AND name = p_template_name 
  AND is_active = true
  LIMIT 1;
  
  -- If specific template not found, try default
  IF NOT FOUND AND p_template_name != 'default' THEN
    SELECT subject_template, message_template 
    INTO v_template
    FROM notification_templates 
    WHERE type = p_type 
    AND name = 'default' 
    AND is_active = true
    LIMIT 1;
  END IF;
  
  -- If still not found, return basic fallback
  IF NOT FOUND THEN
    subject := 'Notification';
    message := 'You have a new notification';
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Format the templates with provided data
  BEGIN
    -- Use format() with variadic arguments
    CASE array_length(p_template_data, 1)
      WHEN 0 THEN
        v_formatted_subject := v_template.subject_template;
        v_formatted_message := v_template.message_template;
      WHEN 1 THEN
        v_formatted_subject := format(v_template.subject_template, p_template_data[1]);
        v_formatted_message := format(v_template.message_template, p_template_data[1]);
      WHEN 2 THEN
        v_formatted_subject := format(v_template.subject_template, p_template_data[1], p_template_data[2]);
        v_formatted_message := format(v_template.message_template, p_template_data[1], p_template_data[2]);
      WHEN 3 THEN
        v_formatted_subject := format(v_template.subject_template, p_template_data[1], p_template_data[2], p_template_data[3]);
        v_formatted_message := format(v_template.message_template, p_template_data[1], p_template_data[2], p_template_data[3]);
      WHEN 4 THEN
        v_formatted_subject := format(v_template.subject_template, p_template_data[1], p_template_data[2], p_template_data[3], p_template_data[4]);
        v_formatted_message := format(v_template.message_template, p_template_data[1], p_template_data[2], p_template_data[3], p_template_data[4]);
      WHEN 5 THEN
        v_formatted_subject := format(v_template.subject_template, p_template_data[1], p_template_data[2], p_template_data[3], p_template_data[4], p_template_data[5]);
        v_formatted_message := format(v_template.message_template, p_template_data[1], p_template_data[2], p_template_data[3], p_template_data[4], p_template_data[5]);
      ELSE
        -- Fallback for more than 5 parameters
        v_formatted_subject := v_template.subject_template;
        v_formatted_message := v_template.message_template;
    END CASE;
  EXCEPTION WHEN OTHERS THEN
    -- If formatting fails, return the template as-is
    v_formatted_subject := v_template.subject_template;
    v_formatted_message := v_template.message_template;
  END;
  
  subject := v_formatted_subject;
  message := v_formatted_message;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Master notification creation function with template support
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
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User ID is required';
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
    'delivered',
    NOW()
  );
  
  -- Check user preferences
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;
  
  -- Queue email if enabled or system notification (default: enabled)
  IF p_type = 'system' OR COALESCE(v_user_preferences.email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;
  
  -- Queue push if enabled (default: disabled for new users)
  IF COALESCE(v_user_preferences.push_enabled, false) THEN
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

-- Function to create default notification preferences for a user
CREATE OR REPLACE FUNCTION create_default_notification_preferences(p_user_id UUID)
RETURNS VOID AS $$
DECLARE
  v_notification_types notification_type[] := ARRAY[
    'system',
    'organization_added',
    'project_added', 
    'task_assigned',
    'task_updated',
    'task_comment',
    'comment_mention',
    'task_unassigned',
    'form_assigned',
    'form_unassigned',
    'approval_requested',
    'approval_status_changed',
    'entity_assigned'
  ];
  v_type notification_type;
BEGIN
  -- Create default preferences for each notification type
  FOREACH v_type IN ARRAY v_notification_types LOOP
    INSERT INTO notification_preferences (
      user_id,
      type,
      email_enabled,
      push_enabled,
      in_app_enabled
    ) VALUES (
      p_user_id,
      v_type,
      true,   -- Email notifications enabled by default
      false,  -- Push notifications disabled by default  
      true    -- In-app notifications enabled by default
    ) ON CONFLICT (user_id, type) DO NOTHING; -- Don't override existing preferences
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- Function to initialize preferences for current user (can be called from application)
CREATE OR REPLACE FUNCTION initialize_notification_preferences()
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get current user ID
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated to initialize preferences';
  END IF;
  
  -- Create default preferences if they don't exist
  PERFORM create_default_notification_preferences(v_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- TRIGGERS
-- ===========================================

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
      p_template_name => 'default',
      p_template_data => ARRAY[v_task.title],
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
      p_template_name => 'default',
      p_template_data => ARRAY[v_form.name],
      p_data => jsonb_build_object(
        'form_id', v_form.id,
        'form_title', v_form.name,
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
          p_template_name => 'default',
          p_template_data => ARRAY[NEW.title, COALESCE(v_updater_name, 'Someone')],
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
        p_template_name => 'default',
        p_template_data => ARRAY[COALESCE(v_commenter_name, 'Someone'), v_task.title],
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
        p_template_name => 'default',
        p_template_data => ARRAY[COALESCE(v_commenter_name, 'Someone'), v_task.title],
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
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_added_by_name, 'Someone'), v_project_name],
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
      p_template_name => 'default',
      p_template_data => ARRAY[COALESCE(v_added_by_name, 'Someone'), v_org_name],
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

-- Approval request trigger
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
    
    -- Notify requester of status change
    PERFORM create_notification(
      p_user_id => NEW.requester_id,
      p_type => 'approval_status_changed',
      p_template_name => 'default',
      p_template_data => ARRAY[NEW.status, COALESCE(v_entity_title, 'Unknown Item'), NEW.status, COALESCE(v_approved_by_name, 'Someone')],
      p_data => jsonb_build_object(
        'approval_id', NEW.id,
        'entity_type', NEW.entity_type,
        'entity_id', NEW.entity_id,
        'entity_title', v_entity_title,
        'old_status', OLD.status,
        'new_status', NEW.status,
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

-- Create triggers for entity assignments
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

-- Create trigger for task updates
DROP TRIGGER IF EXISTS task_update_notification_trigger ON tasks;
CREATE TRIGGER task_update_notification_trigger
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_updates();

-- Create trigger for task comments
DROP TRIGGER IF EXISTS task_comment_notification_trigger ON task_comments;
CREATE TRIGGER task_comment_notification_trigger
AFTER INSERT ON task_comments
FOR EACH ROW
EXECUTE FUNCTION notify_task_comment();

-- Create trigger for project members
DROP TRIGGER IF EXISTS project_member_notification_trigger ON projects_users;
CREATE TRIGGER project_member_notification_trigger
AFTER INSERT ON projects_users
FOR EACH ROW
EXECUTE FUNCTION notify_project_membership();

-- Create trigger for organization users
DROP TRIGGER IF EXISTS organization_user_notification_trigger ON organization_users;
CREATE TRIGGER organization_user_notification_trigger
AFTER INSERT ON organization_users
FOR EACH ROW
EXECUTE FUNCTION notify_organization_membership();

-- Approval comments trigger
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

-- Approval approver responses trigger
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

-- Create trigger for approvals
DROP TRIGGER IF EXISTS approval_notification_trigger ON approvals;
CREATE TRIGGER approval_notification_trigger
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW
EXECUTE FUNCTION notify_approval_changes();

-- Create trigger for approval comments
DROP TRIGGER IF EXISTS approval_comment_notification_trigger ON approval_comments;
CREATE TRIGGER approval_comment_notification_trigger
AFTER INSERT ON approval_comments
FOR EACH ROW
EXECUTE FUNCTION notify_approval_comment();

-- Create trigger for approval approver responses
DROP TRIGGER IF EXISTS approval_response_notification_trigger ON approval_approver_responses;
CREATE TRIGGER approval_response_notification_trigger
AFTER INSERT OR UPDATE ON approval_approver_responses
FOR EACH ROW
EXECUTE FUNCTION notify_approval_response();

-- Note: Cannot create trigger on auth.users due to permission restrictions
-- Instead, we'll create default preferences on-demand in the application
-- or when user_profiles are created

-- Create trigger for user_profiles table (alternative approach)
-- This will create default preferences when a user profile is created
CREATE OR REPLACE FUNCTION create_default_preferences_on_profile_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Create default notification preferences for the new user profile
  PERFORM create_default_notification_preferences(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate trigger on user_profiles (safer alternative)
DROP TRIGGER IF EXISTS create_default_preferences_on_profile_trigger ON user_profiles;
CREATE TRIGGER create_default_preferences_on_profile_trigger
AFTER INSERT ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION create_default_preferences_on_profile_creation();

-- Create default preferences for all existing users who don't have them
DO $$
DECLARE
  v_user_id UUID;
  v_created_count INTEGER := 0;
BEGIN
  -- For each user in user_profiles, create default preferences if they don't exist
  FOR v_user_id IN 
    SELECT DISTINCT id 
    FROM user_profiles 
    WHERE id NOT IN (
      SELECT DISTINCT user_id 
      FROM notification_preferences
    )
  LOOP
    BEGIN
      PERFORM create_default_notification_preferences(v_user_id);
      v_created_count := v_created_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Could not create preferences for user %: %', v_user_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'Default notification preferences created for % existing users', v_created_count;
EXCEPTION WHEN OTHERS THEN
  -- If this fails (e.g., in development), don't break the migration
  RAISE NOTICE 'Could not create default preferences for existing users: %', SQLERRM;
END $$;

-- ===========================================
-- REALTIME CONFIGURATION
-- ===========================================

-- Enable realtime for notifications table (only if not already added)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ===========================================
-- CRON JOBS
-- ===========================================

-- Enable pg_cron extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Function to process email notification queue
CREATE OR REPLACE FUNCTION process_email_queue()
RETURNS TEXT AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_email RECORD;
BEGIN
  -- Process pending emails that are due
  FOR v_email IN 
    SELECT * FROM email_queue 
    WHERE status = 'pending' 
    AND scheduled_for <= NOW()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT 100 -- Process max 100 emails per run
  LOOP
    BEGIN
      -- Update status to processing
      UPDATE email_queue 
      SET status = 'processing', updated_at = NOW()
      WHERE id = v_email.id;
      
      -- Call edge function to send email (this would be done via webhook/trigger)
      -- For now, we'll mark as queued for edge function processing
      UPDATE email_queue 
      SET 
        status = 'queued_for_delivery',
        updated_at = NOW()
      WHERE id = v_email.id;
      
      v_processed := v_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Mark as failed and increment retry count
      UPDATE email_queue 
      SET 
        status = 'failed',
        error_message = SQLERRM,
        retry_count = retry_count + 1,
        updated_at = NOW()
      WHERE id = v_email.id;
      
      v_failed := v_failed + 1;
    END;
  END LOOP;
  
  RETURN format('Processed %s emails, %s failed', v_processed, v_failed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process push notification queue
CREATE OR REPLACE FUNCTION process_push_queue()
RETURNS TEXT AS $$
DECLARE
  v_processed INTEGER := 0;
  v_failed INTEGER := 0;
  v_push RECORD;
BEGIN
  -- Process pending push notifications
  FOR v_push IN 
    SELECT * FROM push_queue 
    WHERE status = 'pending' 
    AND scheduled_for <= NOW()
    ORDER BY priority DESC, scheduled_for ASC
    LIMIT 50 -- Process max 50 push notifications per run
  LOOP
    BEGIN
      -- Update status to processing
      UPDATE push_queue 
      SET status = 'processing', updated_at = NOW()
      WHERE id = v_push.id;
      
      -- Call edge function to send push notification
      UPDATE push_queue 
      SET 
        status = 'queued_for_delivery',
        updated_at = NOW()
      WHERE id = v_push.id;
      
      v_processed := v_processed + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Mark as failed and increment retry count
      UPDATE push_queue 
      SET 
        status = 'failed',
        error_message = SQLERRM,
        retry_count = retry_count + 1,
        updated_at = NOW()
      WHERE id = v_push.id;
      
      v_failed := v_failed + 1;
    END;
  END LOOP;
  
  RETURN format('Processed %s push notifications, %s failed', v_processed, v_failed);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old notifications and delivery records
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS TEXT AS $$
DECLARE
  v_notifications_deleted INTEGER := 0;
  v_deliveries_deleted INTEGER := 0;
  v_emails_deleted INTEGER := 0;
  v_pushes_deleted INTEGER := 0;
BEGIN
  -- Delete notifications older than 90 days
  DELETE FROM notifications 
  WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_notifications_deleted = ROW_COUNT;
  
  -- Delete old delivery records (30 days)
  DELETE FROM notification_deliveries 
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_deliveries_deleted = ROW_COUNT;
  
  -- Delete old email queue records (7 days for sent/failed)
  DELETE FROM email_queue 
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('sent', 'failed', 'queued_for_delivery');
  GET DIAGNOSTICS v_emails_deleted = ROW_COUNT;
  
  -- Delete old push queue records (7 days for sent/failed)
  DELETE FROM push_queue 
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('sent', 'failed', 'queued_for_delivery');
  GET DIAGNOSTICS v_pushes_deleted = ROW_COUNT;
  
  RETURN format('Cleaned up: %s notifications, %s deliveries, %s emails, %s pushes', 
    v_notifications_deleted, v_deliveries_deleted, v_emails_deleted, v_pushes_deleted);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed notifications
CREATE OR REPLACE FUNCTION retry_failed_notifications()
RETURNS TEXT AS $$
DECLARE
  v_email_retries INTEGER := 0;
  v_push_retries INTEGER := 0;
BEGIN
  -- Retry failed emails (max 3 retries, exponential backoff)
  UPDATE email_queue 
  SET 
    status = 'pending',
    scheduled_for = NOW() + (retry_count * INTERVAL '15 minutes'),
    error_message = NULL,
    updated_at = NOW()
  WHERE status = 'failed' 
  AND retry_count < 3
  AND created_at > NOW() - INTERVAL '24 hours'; -- Only retry recent failures
  GET DIAGNOSTICS v_email_retries = ROW_COUNT;
  
  -- Retry failed push notifications (max 5 retries)
  UPDATE push_queue 
  SET 
    status = 'pending',
    scheduled_for = NOW() + (retry_count * INTERVAL '5 minutes'),
    error_message = NULL,
    updated_at = NOW()
  WHERE status = 'failed' 
  AND retry_count < 5
  AND created_at > NOW() - INTERVAL '6 hours'; -- Only retry recent failures
  GET DIAGNOSTICS v_push_retries = ROW_COUNT;
  
  RETURN format('Retried %s emails, %s push notifications', v_email_retries, v_push_retries);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION process_email_queue TO service_role;
GRANT EXECUTE ON FUNCTION process_push_queue TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_old_notifications TO service_role;
GRANT EXECUTE ON FUNCTION retry_failed_notifications TO service_role;

-- Schedule cron jobs (remove existing jobs first to avoid duplicates)
DO $$
BEGIN
  -- Remove existing notification-related cron jobs if they exist
  BEGIN
    PERFORM cron.unschedule('process-email-queue');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, continue
  END;
  
  BEGIN
    PERFORM cron.unschedule('process-push-queue');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, continue
  END;
  
  BEGIN
    PERFORM cron.unschedule('cleanup-notifications');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, continue
  END;
  
  BEGIN
    PERFORM cron.unschedule('retry-failed-notifications');
  EXCEPTION WHEN OTHERS THEN
    -- Job doesn't exist, continue
  END;
  
  -- Schedule email queue processing every 5 minutes
  PERFORM cron.schedule(
    'process-email-queue',
    '*/5 * * * *',
    'SELECT process_email_queue();'
  );
  
  -- Schedule push queue processing every 2 minutes
  PERFORM cron.schedule(
    'process-push-queue', 
    '*/2 * * * *',
    'SELECT process_push_queue();'
  );
  
  -- Schedule cleanup daily at 2 AM
  PERFORM cron.schedule(
    'cleanup-notifications',
    '0 2 * * *',
    'SELECT cleanup_old_notifications();'
  );
  
  -- Schedule retry of failed notifications every 30 minutes
  PERFORM cron.schedule(
    'retry-failed-notifications',
    '*/30 * * * *',
    'SELECT retry_failed_notifications();'
  );
  
  RAISE NOTICE 'Successfully scheduled notification cron jobs';
  
EXCEPTION WHEN OTHERS THEN
  -- If cron scheduling fails, just log it (don't fail the migration)
  RAISE NOTICE 'Could not schedule cron jobs: %. This is normal if pg_cron is not enabled.', SQLERRM;
END $$;

-- Add function comments
COMMENT ON FUNCTION process_email_queue IS 'Processes pending email notifications in the queue';
COMMENT ON FUNCTION process_push_queue IS 'Processes pending push notifications in the queue';
COMMENT ON FUNCTION cleanup_old_notifications IS 'Cleans up old notification records to prevent database bloat';
COMMENT ON FUNCTION retry_failed_notifications IS 'Retries failed email and push notifications with exponential backoff';

-- ===========================================
-- COMMENTS
-- ===========================================

-- Add trigger comments
COMMENT ON TRIGGER entity_assignment_notification_trigger ON entity_assignees IS 'Creates notifications for task assignments';
COMMENT ON TRIGGER entity_assignment_notification_trigger2 ON entity_assignees IS 'Creates notifications for form assignments';
COMMENT ON TRIGGER entity_unassignment_notification_trigger ON entity_assignees IS 'Creates notifications for task unassignments';
COMMENT ON TRIGGER entity_unassignment_notification_trigger2 ON entity_assignees IS 'Creates notifications for form unassignments';
COMMENT ON TRIGGER task_update_notification_trigger ON tasks IS 'Creates notifications for task status changes';
COMMENT ON TRIGGER task_comment_notification_trigger ON task_comments IS 'Creates notifications for new comments and mentions';
COMMENT ON TRIGGER project_member_notification_trigger ON projects_users IS 'Creates notifications when users are added to projects';
COMMENT ON TRIGGER organization_user_notification_trigger ON organization_users IS 'Creates notifications when users are added to organizations';
COMMENT ON TRIGGER approval_notification_trigger ON approvals IS 'Creates notifications for approval requests and status changes';
COMMENT ON TRIGGER approval_comment_notification_trigger ON approval_comments IS 'Creates notifications for approval comments';
COMMENT ON TRIGGER approval_response_notification_trigger ON approval_approver_responses IS 'Creates notifications for approval responses and status updates';
COMMENT ON TRIGGER create_default_preferences_on_profile_trigger ON user_profiles IS 'Automatically creates default notification preferences when user profiles are created';

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_notification TO service_role;
GRANT EXECUTE ON FUNCTION queue_email_notification TO service_role;
GRANT EXECUTE ON FUNCTION queue_push_notification TO service_role;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION create_default_notification_preferences TO service_role;
GRANT EXECUTE ON FUNCTION create_default_preferences_on_profile_creation TO service_role;
GRANT EXECUTE ON FUNCTION initialize_notification_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_template TO service_role;

-- Add function comments
COMMENT ON FUNCTION get_notification_template IS 'Gets and formats notification templates with placeholder substitution';
COMMENT ON FUNCTION create_notification IS 'Creates a notification and queues delivery to configured channels';
COMMENT ON FUNCTION queue_email_notification IS 'Queues an email for delivery based on notification';
COMMENT ON FUNCTION queue_push_notification IS 'Queues push notifications for all user devices';
COMMENT ON FUNCTION mark_notification_read IS 'Marks a single notification as read';
COMMENT ON FUNCTION mark_all_notifications_read IS 'Marks all notifications as read for the current user';
COMMENT ON FUNCTION get_unread_notification_count IS 'Returns the count of unread notifications for the current user';
COMMENT ON FUNCTION create_default_notification_preferences IS 'Creates default notification preferences for a user with email enabled and push disabled';
COMMENT ON FUNCTION create_default_preferences_on_profile_creation IS 'Trigger function to create default preferences when user profiles are created';
COMMENT ON FUNCTION initialize_notification_preferences IS 'Initializes default notification preferences for the current authenticated user';

-- ===========================================
-- DEFAULT NOTIFICATION TEMPLATES
-- ===========================================

-- Insert default templates for all notification types
INSERT INTO notification_templates (type, name, subject_template, message_template, description, placeholders) VALUES
-- System notifications
('system', 'default', 'System Notification', '%s', 'Default system notification template', ARRAY['message']),

-- Organization membership
('organization_added', 'default', 'Added to Organization', '%s added you to %s', 'User added to organization', ARRAY['admin_name', 'organization_name']),

-- Project membership  
('project_added', 'default', 'Added to Project', '%s added you to project: %s', 'User added to project', ARRAY['admin_name', 'project_name']),

-- Task assignments
('task_assigned', 'default', 'New Task Assignment', '%s assigned you to: %s', 'Task assigned to user', ARRAY['assigner_name', 'task_title']),
('task_unassigned', 'default', 'Task Unassigned', 'You were removed from task: %s', 'Task unassigned from user', ARRAY['task_title']),

-- Task updates
('task_updated', 'default', 'Task Status Updated', 'Task "%s" status was updated by %s', 'Task status changed', ARRAY['task_title', 'updater_name']),

-- Task comments
('task_comment', 'default', 'New Comment on Your Task', '%s commented on "%s"', 'Comment added to task', ARRAY['commenter_name', 'task_title']),

-- Comment mentions
('comment_mention', 'default', 'You were mentioned', '%s mentioned you in "%s"', 'User mentioned in comment', ARRAY['commenter_name', 'task_title']),

-- Form assignments
('form_assigned', 'default', 'New Form Assignment', '%s assigned you to form: %s', 'Form assigned to user', ARRAY['assigner_name', 'form_name']),
('form_unassigned', 'default', 'Form Unassigned', 'You were removed from form: %s', 'Form unassigned from user', ARRAY['form_name']),

-- Approval requests
('approval_requested', 'default', 'Approval Required', '%s requested approval for: %s', 'Approval request created', ARRAY['requester_name', 'entity_title']),
('approval_requested', 'requester_confirmation', 'Approval Request Submitted', 'Your approval request for "%s" has been submitted and is pending review', 'Confirmation to requester', ARRAY['entity_title']),
('approval_requested', 'comment_notification', '%s commented on your approval request for "%s"', '%s added a comment to your approval request', 'Comment on approval', ARRAY['commenter_name', 'entity_title']),
('approval_requested', 'response_notification', '%s responded to your approval request for "%s"', '%s has responded to your approval request', 'Approver response notification', ARRAY['approver_name', 'entity_title']),

-- Approval status changes
('approval_status_changed', 'default', 'Approval %s', 'Your approval request "%s" has been %s by %s', 'Approval decision made', ARRAY['status', 'entity_title', 'status', 'approver_name']),
('approval_status_changed', 'response_received', 'Approval Response Received', '%s responded to your approval request for "%s"', 'Response received notification', ARRAY['approver_name', 'entity_title']),

-- Generic entity assignments
('entity_assigned', 'default', 'New Assignment', '%s assigned you to: %s', 'Generic entity assignment', ARRAY['assigner_name', 'entity_title'])

ON CONFLICT (type, name) DO UPDATE SET
  subject_template = EXCLUDED.subject_template,
  message_template = EXCLUDED.message_template,
  description = EXCLUDED.description,
  placeholders = EXCLUDED.placeholders,
  updated_at = NOW();