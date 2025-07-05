-- Migration: Enable Row Level Security
-- Description: Sets up RLS policies for notification tables

-- Enable RLS on all tables
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_queue ENABLE ROW LEVEL SECURITY;

-- Notifications table policies
CREATE POLICY "Users can view own notifications" 
ON notifications FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" 
ON notifications FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can create notifications" 
ON notifications FOR INSERT 
WITH CHECK (true); -- Will be restricted via functions

CREATE POLICY "Users cannot delete notifications" 
ON notifications FOR DELETE 
USING (false);

-- Notification deliveries policies
CREATE POLICY "Users can view own delivery status" 
ON notification_deliveries FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM notifications 
    WHERE notifications.id = notification_deliveries.notification_id 
    AND notifications.user_id = auth.uid()
  )
);

CREATE POLICY "System manages deliveries" 
ON notification_deliveries FOR ALL 
USING (auth.uid() = auth.uid()) -- Only via service role
WITH CHECK (auth.uid() = auth.uid());

-- Notification preferences policies
CREATE POLICY "Users can view own preferences" 
ON notification_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own preferences" 
ON notification_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" 
ON notification_preferences FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own preferences" 
ON notification_preferences FOR DELETE 
USING (auth.uid() = user_id);

-- User devices policies
CREATE POLICY "Users can view own devices" 
ON user_devices FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can register own devices" 
ON user_devices FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices" 
ON user_devices FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove own devices" 
ON user_devices FOR DELETE 
USING (auth.uid() = user_id);

-- Email and push queue policies (restricted to service role)
CREATE POLICY "Email queue restricted to service role" 
ON email_queue FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Push queue restricted to service role" 
ON push_queue FOR ALL 
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Grant necessary permissions to authenticated users
GRANT SELECT, UPDATE ON notifications TO authenticated;
GRANT SELECT ON notification_deliveries TO authenticated;
GRANT ALL ON notification_preferences TO authenticated;
GRANT ALL ON user_devices TO authenticated;

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