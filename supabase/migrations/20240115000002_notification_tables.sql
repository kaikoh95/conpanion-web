-- Migration: Create notification tables
-- Description: Creates all tables needed for the notification system

-- Main notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  priority notification_priority DEFAULT 'medium' NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}' NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN DEFAULT false NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT notifications_title_length CHECK (char_length(title) <= 255),
  CONSTRAINT notifications_message_length CHECK (char_length(message) <= 1000)
);

-- Delivery tracking table
CREATE TABLE notification_deliveries (
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
CREATE TABLE notification_preferences (
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
CREATE TABLE email_queue (
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
  CONSTRAINT email_queue_email_valid CHECK (to_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT email_queue_retry_limit CHECK (retry_count >= 0 AND retry_count <= 5)
);

-- Push queue table
CREATE TABLE push_queue (
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
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CONSTRAINT push_queue_platform_check CHECK (platform IN ('ios', 'android', 'web'))
);

-- User devices for push notifications
CREATE TABLE user_devices (
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

-- Add table comments
COMMENT ON TABLE notifications IS 'Core notifications table storing all notification records';
COMMENT ON TABLE notification_deliveries IS 'Tracks delivery status of notifications across different channels';
COMMENT ON TABLE notification_preferences IS 'User preferences for notification delivery by type';
COMMENT ON TABLE email_queue IS 'Queue for email notifications awaiting delivery';
COMMENT ON TABLE push_queue IS 'Queue for push notifications awaiting delivery';
COMMENT ON TABLE user_devices IS 'Registered devices for push notifications';

-- Add column comments for important fields
COMMENT ON COLUMN notifications.data IS 'Additional context data for the notification in JSON format';
COMMENT ON COLUMN notifications.entity_type IS 'Type of entity this notification relates to (e.g., task, project)';
COMMENT ON COLUMN notifications.entity_id IS 'ID of the entity this notification relates to';
COMMENT ON COLUMN notification_preferences.type IS 'System notifications cannot be disabled by users';