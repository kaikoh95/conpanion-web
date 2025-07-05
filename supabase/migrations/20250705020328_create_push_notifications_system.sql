-- Migration: Create Push Notifications System
-- Purpose: Create push notification subscriptions and delivery tracking system
-- Affected tables: Creates push_subscriptions table and related functions
-- Special considerations: Integrates with existing notification system

-- ========================================
-- STEP 1: Create push subscriptions table
-- ========================================

CREATE TABLE push_subscriptions (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, endpoint)
);

-- ========================================
-- STEP 2: Create indexes for performance
-- ========================================

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);
CREATE INDEX push_subscriptions_is_active_idx ON push_subscriptions(is_active);
CREATE INDEX push_subscriptions_created_at_idx ON push_subscriptions(created_at DESC);

-- ========================================
-- STEP 3: Add updated_at trigger
-- ========================================

CREATE TRIGGER handle_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- STEP 4: Update notification preferences table
-- ========================================

-- Add new fields to existing notification_preferences table
ALTER TABLE notification_preferences 
ADD COLUMN email_delivery_preference TEXT DEFAULT 'immediate' CHECK (email_delivery_preference IN ('immediate', 'digest', 'disabled')),
ADD COLUMN push_delivery_preference TEXT DEFAULT 'immediate' CHECK (push_delivery_preference IN ('immediate', 'disabled'));

-- ========================================
-- STEP 5: Create push subscription management functions
-- ========================================

-- Function to create or update push subscription
CREATE OR REPLACE FUNCTION upsert_push_subscription(
  user_id_param UUID,
  endpoint_param TEXT,
  p256dh_param TEXT,
  auth_param TEXT,
  user_agent_param TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  subscription_id BIGINT;
BEGIN
  -- Deactivate existing subscriptions for this user and endpoint
  UPDATE push_subscriptions 
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = user_id_param AND endpoint = endpoint_param;
  
  -- Insert new subscription
  INSERT INTO push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    is_active
  )
  VALUES (
    user_id_param,
    endpoint_param,
    p256dh_param,
    auth_param,
    user_agent_param,
    TRUE
  )
  ON CONFLICT (user_id, endpoint) 
  DO UPDATE SET 
    p256dh = EXCLUDED.p256dh,
    auth = EXCLUDED.auth,
    user_agent = EXCLUDED.user_agent,
    is_active = TRUE,
    updated_at = NOW()
  RETURNING id INTO subscription_id;
  
  RETURN subscription_id;
END;
$$;

-- Function to get user's active push subscriptions
CREATE OR REPLACE FUNCTION get_user_push_subscriptions(user_id_param UUID)
RETURNS TABLE (
  id BIGINT,
  endpoint TEXT,
  p256dh TEXT,
  auth TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ps.id,
    ps.endpoint,
    ps.p256dh,
    ps.auth,
    ps.user_agent,
    ps.created_at
  FROM push_subscriptions ps
  WHERE ps.user_id = user_id_param AND ps.is_active = TRUE
  ORDER BY ps.created_at DESC;
END;
$$;

-- Function to deactivate push subscription
CREATE OR REPLACE FUNCTION deactivate_push_subscription(
  user_id_param UUID,
  endpoint_param TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE push_subscriptions 
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = user_id_param AND endpoint = endpoint_param;
  
  RETURN FOUND;
END;
$$;

-- Function to deactivate all push subscriptions for user
CREATE OR REPLACE FUNCTION deactivate_all_push_subscriptions(user_id_param UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  UPDATE push_subscriptions 
  SET is_active = FALSE, updated_at = NOW()
  WHERE user_id = user_id_param AND is_active = TRUE;
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

-- Function to cleanup expired push subscriptions
CREATE OR REPLACE FUNCTION cleanup_expired_push_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Mark subscriptions as inactive if they haven't been updated in 90 days
  UPDATE push_subscriptions 
  SET is_active = FALSE, updated_at = NOW()
  WHERE is_active = TRUE 
    AND updated_at < NOW() - INTERVAL '90 days';
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$;

-- Function to get push subscription statistics
CREATE OR REPLACE FUNCTION get_push_subscription_stats()
RETURNS TABLE (
  total_subscriptions BIGINT,
  active_subscriptions BIGINT,
  inactive_subscriptions BIGINT,
  unique_users BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_subscriptions,
    COUNT(CASE WHEN is_active = TRUE THEN 1 END)::BIGINT as active_subscriptions,
    COUNT(CASE WHEN is_active = FALSE THEN 1 END)::BIGINT as inactive_subscriptions,
    COUNT(DISTINCT user_id)::BIGINT as unique_users
  FROM push_subscriptions;
END;
$$;

-- ========================================
-- STEP 6: Enable Row Level Security (RLS)
-- ========================================

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ========================================
-- STEP 7: Create RLS Policies
-- ========================================

-- Users can only view their own push subscriptions
CREATE POLICY "Users can view their own push subscriptions"
ON push_subscriptions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can only insert their own push subscriptions
CREATE POLICY "Users can insert their own push subscriptions"
ON push_subscriptions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can only update their own push subscriptions
CREATE POLICY "Users can update their own push subscriptions"
ON push_subscriptions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- ========================================
-- STEP 8: Grant necessary permissions
-- ========================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE ON push_subscriptions TO authenticated;

-- Grant permissions to service role for functions
GRANT ALL ON push_subscriptions TO service_role;

-- ========================================
-- STEP 9: Create enhanced notification function with delivery preferences
-- ========================================

-- Enhanced function to check if user should receive notification via specific channel
CREATE OR REPLACE FUNCTION should_user_receive_notification_via_channel(
  user_id_param UUID,
  notification_type_param notification_type,
  channel_param TEXT -- 'email', 'push', 'in_app'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_prefs RECORD;
  type_pref BOOLEAN;
  current_time TIME;
  user_timezone TEXT;
BEGIN
  -- Get user preferences
  SELECT * INTO user_prefs
  FROM notification_preferences
  WHERE user_id = user_id_param;
  
  -- If no preferences found, use defaults
  IF NOT FOUND THEN
    RETURN CASE 
      WHEN channel_param = 'email' THEN TRUE
      WHEN channel_param = 'push' THEN TRUE
      WHEN channel_param = 'in_app' THEN TRUE
      ELSE FALSE
    END;
  END IF;
  
  -- Check if notifications are globally enabled
  IF NOT COALESCE(user_prefs.notifications_enabled, TRUE) THEN
    RETURN FALSE;
  END IF;
  
  -- Check channel-specific settings
  IF channel_param = 'email' THEN
    IF NOT COALESCE(user_prefs.email_notifications, TRUE) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(user_prefs.email_delivery_preference, 'immediate') = 'disabled' THEN
      RETURN FALSE;
    END IF;
  ELSIF channel_param = 'push' THEN
    IF NOT COALESCE(user_prefs.push_notifications, TRUE) THEN
      RETURN FALSE;
    END IF;
    IF COALESCE(user_prefs.push_delivery_preference, 'immediate') = 'disabled' THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Check type-specific preferences
  IF user_prefs.type_preferences IS NOT NULL THEN
    SELECT (user_prefs.type_preferences->notification_type_param::TEXT)::BOOLEAN INTO type_pref;
    IF type_pref IS NOT NULL AND NOT type_pref THEN
      RETURN FALSE;
    END IF;
  END IF;
  
  -- Check quiet hours (only for push notifications)
  IF channel_param = 'push' AND COALESCE(user_prefs.quiet_hours_enabled, FALSE) THEN
    user_timezone := COALESCE(user_prefs.timezone, 'UTC');
    current_time := (NOW() AT TIME ZONE user_timezone)::TIME;
    
    IF user_prefs.quiet_hours_start IS NOT NULL AND user_prefs.quiet_hours_end IS NOT NULL THEN
      -- Handle quiet hours that span midnight
      IF user_prefs.quiet_hours_start > user_prefs.quiet_hours_end THEN
        IF current_time >= user_prefs.quiet_hours_start OR current_time <= user_prefs.quiet_hours_end THEN
          RETURN FALSE;
        END IF;
      ELSE
        -- Normal quiet hours within the same day
        IF current_time >= user_prefs.quiet_hours_start AND current_time <= user_prefs.quiet_hours_end THEN
          RETURN FALSE;
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN TRUE;
END;
$$;

-- ========================================
-- STEP 10: Add comments for documentation
-- ========================================

COMMENT ON TABLE push_subscriptions IS 'Stores browser push notification subscriptions for users';
COMMENT ON FUNCTION upsert_push_subscription IS 'Creates or updates a push notification subscription for a user';
COMMENT ON FUNCTION get_user_push_subscriptions IS 'Gets all active push subscriptions for a user';
COMMENT ON FUNCTION deactivate_push_subscription IS 'Deactivates a specific push subscription';
COMMENT ON FUNCTION deactivate_all_push_subscriptions IS 'Deactivates all push subscriptions for a user';
COMMENT ON FUNCTION cleanup_expired_push_subscriptions IS 'Cleanup function for expired push subscriptions';
COMMENT ON FUNCTION get_push_subscription_stats IS 'Gets statistics about push subscriptions';
COMMENT ON FUNCTION should_user_receive_notification_via_channel IS 'Checks if user should receive notification via specific channel based on preferences';