-- Migration: Create notification indexes
-- Description: Creates indexes for optimal query performance

-- Notifications table indexes
CREATE INDEX idx_notifications_user_unread 
ON notifications(user_id, is_read) 
WHERE is_read = false;

CREATE INDEX idx_notifications_created 
ON notifications(created_at DESC);

CREATE INDEX idx_notifications_entity 
ON notifications(entity_type, entity_id) 
WHERE entity_type IS NOT NULL;

CREATE INDEX idx_notifications_type_priority 
ON notifications(type, priority);

CREATE INDEX idx_notifications_user_created 
ON notifications(user_id, created_at DESC);

-- Delivery tracking indexes
CREATE INDEX idx_notification_deliveries_notification 
ON notification_deliveries(notification_id);

CREATE INDEX idx_notification_deliveries_status 
ON notification_deliveries(status) 
WHERE status IN ('pending', 'retry');

CREATE INDEX idx_notification_deliveries_channel_status 
ON notification_deliveries(channel, status);

-- Email queue indexes
CREATE INDEX idx_email_queue_status_scheduled 
ON email_queue(status, scheduled_for) 
WHERE status = 'pending';

CREATE INDEX idx_email_queue_notification 
ON email_queue(notification_id) 
WHERE notification_id IS NOT NULL;

CREATE INDEX idx_email_queue_priority_scheduled 
ON email_queue(priority DESC, scheduled_for) 
WHERE status = 'pending';

-- Push queue indexes
CREATE INDEX idx_push_queue_status 
ON push_queue(status, scheduled_for) 
WHERE status = 'pending';

CREATE INDEX idx_push_queue_device 
ON push_queue(device_id);

CREATE INDEX idx_push_queue_notification 
ON push_queue(notification_id) 
WHERE notification_id IS NOT NULL;

-- User devices indexes
CREATE INDEX idx_user_devices_user 
ON user_devices(user_id) 
WHERE push_enabled = true;

CREATE INDEX idx_user_devices_token 
ON user_devices(token);

-- Notification preferences indexes
CREATE INDEX idx_notification_preferences_user 
ON notification_preferences(user_id);

-- Add comments for indexes
COMMENT ON INDEX idx_notifications_user_unread IS 'Optimizes queries for unread notifications per user';
COMMENT ON INDEX idx_notifications_created IS 'Optimizes queries for recent notifications';
COMMENT ON INDEX idx_notifications_entity IS 'Optimizes queries by entity reference';
COMMENT ON INDEX idx_email_queue_status_scheduled IS 'Optimizes email processing queries';
COMMENT ON INDEX idx_push_queue_status IS 'Optimizes push notification processing';