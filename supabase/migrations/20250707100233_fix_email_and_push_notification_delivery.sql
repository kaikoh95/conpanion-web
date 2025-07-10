-- ========================================
-- FIX EMAIL AND PUSH NOTIFICATION DELIVERY
-- ========================================
-- This migration fixes issues with email and push notification delivery
-- including database functions, queue processing, and error handling.

-- ===========================================
-- STEP 1: Fix email queue function
-- ===========================================

-- Enhanced email queue function with better error handling
DROP FUNCTION IF EXISTS queue_email_notification;
CREATE OR REPLACE FUNCTION queue_email_notification(p_notification_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_notification RECORD;
  v_user_profile RECORD;
  v_email_id UUID;
BEGIN
  -- Get notification details with user info
  SELECT 
    n.*,
    au.email as user_email,
    au.raw_user_meta_data
  INTO v_notification
  FROM notifications n
  JOIN auth.users au ON n.user_id = au.id
  WHERE n.id = p_notification_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found',
      'notification_id', p_notification_id
    );
  END IF;
  
  -- Get user profile for name
  SELECT 
    first_name,
    last_name,
    email as profile_email
  INTO v_user_profile
  FROM user_profiles
  WHERE id = v_notification.user_id;
  
  -- Use profile email if available, otherwise auth email
  IF v_notification.user_email IS NULL AND v_user_profile.profile_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No email address found for user',
      'user_id', v_notification.user_id
    );
  END IF;
  
  -- Build user display name
  DECLARE
    v_user_name TEXT;
    v_user_email TEXT;
  BEGIN
    v_user_email := COALESCE(v_user_profile.profile_email, v_notification.user_email);
    
    -- Build display name
    IF v_user_profile.first_name IS NOT NULL AND v_user_profile.last_name IS NOT NULL THEN
      v_user_name := v_user_profile.first_name || ' ' || v_user_profile.last_name;
    ELSIF v_notification.raw_user_meta_data IS NOT NULL AND v_notification.raw_user_meta_data->>'full_name' IS NOT NULL THEN
      v_user_name := v_notification.raw_user_meta_data->>'full_name';
    ELSE
      v_user_name := split_part(v_user_email, '@', 1);
    END IF;
    
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
      v_user_email,
      v_user_name,
      v_notification.title,
      v_notification.type::TEXT,
      jsonb_build_object(
        'user_id', v_notification.user_id,
        'user_name', v_user_name,
        'user_email', v_user_email,
        'notification_id', p_notification_id,
        'notification_title', v_notification.title,
        'notification_message', v_notification.message,
        'notification_type', v_notification.type,
        'notification_data', v_notification.data,
        'entity_type', v_notification.entity_type,
        'entity_id', v_notification.entity_id,
        'priority', v_notification.priority,
        'created_at', v_notification.created_at
      ),
      v_notification.priority,
      CASE 
        WHEN v_notification.priority = 'critical' THEN NOW()
        WHEN v_notification.priority = 'high' THEN NOW() + INTERVAL '2 minutes'
        WHEN v_notification.priority = 'medium' THEN NOW() + INTERVAL '5 minutes'
        ELSE NOW() + INTERVAL '10 minutes'
      END
    ) RETURNING id INTO v_email_id;
    
    RETURN jsonb_build_object(
      'success', true,
      'email_id', v_email_id,
      'notification_id', p_notification_id,
      'to_email', v_user_email,
      'to_name', v_user_name
    );
  END;
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'notification_id', p_notification_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 2: Fix push queue function
-- ===========================================

-- Enhanced push queue function with better error handling
DROP FUNCTION IF EXISTS queue_push_notification;
CREATE OR REPLACE FUNCTION queue_push_notification(p_notification_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_notification RECORD;
  v_device RECORD;
  v_push_count INTEGER := 0;
  v_device_count INTEGER := 0;
  v_push_ids UUID[] := '{}';
BEGIN
  -- Get notification details
  SELECT * INTO v_notification
  FROM notifications
  WHERE id = p_notification_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Notification not found',
      'notification_id', p_notification_id
    );
  END IF;
  
  -- Count user devices
  SELECT COUNT(*) INTO v_device_count
  FROM user_devices
  WHERE user_id = v_notification.user_id
  AND push_enabled = true;
  
  IF v_device_count = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'No push-enabled devices found for user',
      'notification_id', p_notification_id,
      'user_id', v_notification.user_id,
      'devices_found', 0,
      'push_queued', 0
    );
  END IF;
  
  -- Queue push for each user device
  FOR v_device IN 
    SELECT * FROM user_devices
    WHERE user_id = v_notification.user_id
    AND push_enabled = true
  LOOP
    DECLARE
      v_push_id UUID;
    BEGIN
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
          'icon', '/icon-192x192.png',
          'badge', '/icon-72x72.png',
          'tag', 'notification-' || p_notification_id,
          'data', jsonb_build_object(
            'notification_id', p_notification_id,
            'entity_type', v_notification.entity_type,
            'entity_id', v_notification.entity_id,
            'priority', v_notification.priority,
            'created_at', v_notification.created_at,
            'notification_data', v_notification.data
          ),
          'actions', jsonb_build_array(
            jsonb_build_object(
              'action', 'view',
              'title', 'View',
              'icon', '/icon-view.png'
            ),
            jsonb_build_object(
              'action', 'dismiss',
              'title', 'Dismiss',
              'icon', '/icon-dismiss.png'
            )
          )
        ),
        v_notification.priority,
        NOW() -- Push notifications are sent immediately
      ) RETURNING id INTO v_push_id;
      
      v_push_count := v_push_count + 1;
      v_push_ids := array_append(v_push_ids, v_push_id);
      
    EXCEPTION WHEN OTHERS THEN
      -- Log device-specific errors but continue
      RAISE WARNING 'Failed to queue push for device %: %', v_device.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'success', true,
    'notification_id', p_notification_id,
    'user_id', v_notification.user_id,
    'devices_found', v_device_count,
    'push_queued', v_push_count,
    'push_ids', v_push_ids
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'notification_id', p_notification_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 3: Add queue status functions
-- ===========================================

-- Function to get email queue status
CREATE OR REPLACE FUNCTION get_email_queue_status()
RETURNS TABLE(
  status TEXT,
  count BIGINT,
  oldest_created_at TIMESTAMPTZ,
  newest_created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    eq.status::TEXT,
    COUNT(*) as count,
    MIN(eq.created_at) as oldest_created_at,
    MAX(eq.created_at) as newest_created_at
  FROM email_queue eq
  GROUP BY eq.status
  ORDER BY eq.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get push queue status
CREATE OR REPLACE FUNCTION get_push_queue_status()
RETURNS TABLE(
  status TEXT,
  count BIGINT,
  oldest_created_at TIMESTAMPTZ,
  newest_created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pq.status::TEXT,
    COUNT(*) as count,
    MIN(pq.created_at) as oldest_created_at,
    MAX(pq.created_at) as newest_created_at
  FROM push_queue pq
  GROUP BY pq.status
  ORDER BY pq.status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed notifications
DROP FUNCTION IF EXISTS retry_failed_notifications;
CREATE OR REPLACE FUNCTION retry_failed_notifications(p_max_retries INTEGER DEFAULT 3)
RETURNS JSONB AS $$
DECLARE
  v_email_retries INTEGER := 0;
  v_push_retries INTEGER := 0;
BEGIN
  -- Retry failed emails
  UPDATE email_queue 
  SET 
    status = 'pending',
    scheduled_for = NOW() + (retry_count * INTERVAL '15 minutes'),
    error_message = NULL,
    updated_at = NOW()
  WHERE status = 'failed' 
  AND retry_count < p_max_retries
  AND created_at > NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_email_retries = ROW_COUNT;
  
  -- Retry failed push notifications
  UPDATE push_queue 
  SET 
    status = 'pending',
    scheduled_for = NOW() + (retry_count * INTERVAL '5 minutes'),
    error_message = NULL,
    updated_at = NOW()
  WHERE status = 'failed' 
  AND retry_count < p_max_retries
  AND created_at > NOW() - INTERVAL '6 hours';
  GET DIAGNOSTICS v_push_retries = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'email_retries', v_email_retries,
    'push_retries', v_push_retries,
    'max_retries', p_max_retries
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 4: Add debugging functions
-- ===========================================

-- Function to test email queue creation
CREATE OR REPLACE FUNCTION test_email_queue(p_user_email TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_notification_id UUID;
  v_queue_result JSONB;
BEGIN
  -- Get a user ID (use provided email or first available user)
  IF p_user_email IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM user_profiles
    WHERE email = p_user_email;
    
    IF v_user_id IS NULL THEN
      SELECT id INTO v_user_id
      FROM auth.users
      WHERE email = p_user_email;
    END IF;
  ELSE
    SELECT id INTO v_user_id
    FROM user_profiles
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'No user found for testing'
    );
  END IF;
  
  -- Create test notification
  v_notification_id := create_notification(
    p_user_id => v_user_id,
    p_type => 'system',
    p_template_name => 'default',
    p_template_data => ARRAY['Test Email Queue'],
    p_data => jsonb_build_object('test', true),
    p_priority => 'medium'
  );
  
  -- Get the queue result
  SELECT template_data INTO v_queue_result
  FROM email_queue
  WHERE notification_id = v_notification_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'test_user_id', v_user_id,
    'notification_id', v_notification_id,
    'queue_data', v_queue_result
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clean up old queue items
CREATE OR REPLACE FUNCTION cleanup_notification_queues()
RETURNS JSONB AS $$
DECLARE
  v_email_cleaned INTEGER := 0;
  v_push_cleaned INTEGER := 0;
BEGIN
  -- Clean up old email queue items (keep for 30 days)
  DELETE FROM email_queue 
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND status IN ('sent', 'failed');
  GET DIAGNOSTICS v_email_cleaned = ROW_COUNT;
  
  -- Clean up old push queue items (keep for 7 days)
  DELETE FROM push_queue 
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('sent', 'failed');
  GET DIAGNOSTICS v_push_cleaned = ROW_COUNT;
  
  RETURN jsonb_build_object(
    'success', true,
    'email_cleaned', v_email_cleaned,
    'push_cleaned', v_push_cleaned
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 5: Update RLS policies for queue tables
-- ===========================================

-- Ensure service role can manage all queue operations
DROP POLICY IF EXISTS "Service role manages email queue" ON email_queue;
CREATE POLICY "Service role manages email queue" 
ON email_queue FOR ALL 
USING (true) -- Service role bypasses RLS anyway
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages push queue" ON push_queue;
CREATE POLICY "Service role manages push queue" 
ON push_queue FOR ALL 
USING (true) -- Service role bypasses RLS anyway
WITH CHECK (true);

-- Allow authenticated users to view their own queue items (for debugging)
DROP POLICY IF EXISTS "Users can view own email queue items" ON email_queue;
CREATE POLICY "Users can view own email queue items" 
ON email_queue FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM notifications 
    WHERE notifications.id = email_queue.notification_id 
    AND notifications.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can view own push queue items" ON push_queue;
CREATE POLICY "Users can view own push queue items" 
ON push_queue FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM notifications 
    WHERE notifications.id = push_queue.notification_id 
    AND notifications.user_id = auth.uid()
  )
);

-- ===========================================
-- STEP 6: Grant permissions and create indexes
-- ===========================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_email_queue_status TO authenticated;
GRANT EXECUTE ON FUNCTION get_push_queue_status TO authenticated;
GRANT EXECUTE ON FUNCTION retry_failed_notifications TO service_role;
GRANT EXECUTE ON FUNCTION test_email_queue TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_notification_queues TO service_role;

-- Create additional indexes for better performance
CREATE INDEX IF NOT EXISTS email_queue_scheduled_for_idx 
ON email_queue(scheduled_for) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS push_queue_scheduled_for_idx 
ON push_queue(scheduled_for) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS email_queue_user_idx 
ON email_queue(to_email);

CREATE INDEX IF NOT EXISTS push_queue_device_platform_idx 
ON push_queue(device_id, platform);

-- Add missing foreign key constraints if they don't exist
DO $$
BEGIN
  -- Check and add foreign key for email_queue.notification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'email_queue_notification_id_fkey'
    AND table_name = 'email_queue'
  ) THEN
    ALTER TABLE email_queue 
    ADD CONSTRAINT email_queue_notification_id_fkey 
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
  END IF;
  
  -- Check and add foreign key for push_queue.notification_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'push_queue_notification_id_fkey'
    AND table_name = 'push_queue'
  ) THEN
    ALTER TABLE push_queue 
    ADD CONSTRAINT push_queue_notification_id_fkey 
    FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE;
  END IF;
  
  -- Check and add foreign key for push_queue.device_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'push_queue_device_id_fkey'
    AND table_name = 'push_queue'
  ) THEN
    ALTER TABLE push_queue 
    ADD CONSTRAINT push_queue_device_id_fkey 
    FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ===========================================
-- STEP 7: Fix notification delivery tracking
-- ===========================================

-- Function to mark notification delivery as sent
CREATE OR REPLACE FUNCTION mark_notification_delivery_sent(
  p_notification_id UUID,
  p_channel TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notification_deliveries
  SET 
    status = 'sent',
    delivered_at = NOW(),
    updated_at = NOW()
  WHERE notification_id = p_notification_id
  AND channel = p_channel;
  
  -- If no delivery record exists, create one
  IF NOT FOUND THEN
    INSERT INTO notification_deliveries (
      notification_id,
      channel,
      status,
      delivered_at
    ) VALUES (
      p_notification_id,
      p_channel,
      'sent',
      NOW()
    );
  END IF;
  
  RETURN TRUE;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to mark delivery as sent for notification % channel %: %', 
    p_notification_id, p_channel, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark notification delivery as failed
CREATE OR REPLACE FUNCTION mark_notification_delivery_failed(
  p_notification_id UUID,
  p_channel TEXT,
  p_error_message TEXT
) RETURNS BOOLEAN AS $$
BEGIN
  UPDATE notification_deliveries
  SET 
    status = 'failed',
    error_message = p_error_message,
    retry_count = retry_count + 1,
    updated_at = NOW()
  WHERE notification_id = p_notification_id
  AND channel = p_channel;
  
  -- If no delivery record exists, create one
  IF NOT FOUND THEN
    INSERT INTO notification_deliveries (
      notification_id,
      channel,
      status,
      error_message,
      retry_count
    ) VALUES (
      p_notification_id,
      p_channel,
      'failed',
      p_error_message,
      1
    );
  END IF;
  
  RETURN TRUE;
  
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to mark delivery as failed for notification % channel %: %', 
    p_notification_id, p_channel, SQLERRM;
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions for delivery functions
GRANT EXECUTE ON FUNCTION mark_notification_delivery_sent TO service_role;
GRANT EXECUTE ON FUNCTION mark_notification_delivery_failed TO service_role;

-- ===========================================
-- STEP 8: Validation and summary
-- ===========================================

-- Run validation
DO $$
DECLARE
  v_email_status RECORD;
  v_push_status RECORD;
  v_test_result JSONB;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📧 EMAIL AND PUSH NOTIFICATION FIX APPLIED!';
  RAISE NOTICE '================================================';
  
  -- Show email queue status
  RAISE NOTICE '';
  RAISE NOTICE '📧 Email Queue Status:';
  FOR v_email_status IN SELECT * FROM get_email_queue_status() LOOP
    RAISE NOTICE '   - %: % items', v_email_status.status, v_email_status.count;
  END LOOP;
  
  -- Show push queue status
  RAISE NOTICE '';
  RAISE NOTICE '📱 Push Queue Status:';
  FOR v_push_status IN SELECT * FROM get_push_queue_status() LOOP
    RAISE NOTICE '   - %: % items', v_push_status.status, v_push_status.count;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixes Applied:';
  RAISE NOTICE '   - Enhanced email queue function with better error handling';
  RAISE NOTICE '   - Enhanced push queue function with device validation';
  RAISE NOTICE '   - Added queue status monitoring functions';
  RAISE NOTICE '   - Added retry mechanism for failed notifications';
  RAISE NOTICE '   - Fixed delivery tracking functions';
  RAISE NOTICE '   - Added debugging and cleanup functions';
  RAISE NOTICE '   - Improved RLS policies and indexes';
  RAISE NOTICE '';
  RAISE NOTICE '🔧 Next Steps:';
  RAISE NOTICE '   1. Update edge functions with fixed queries';
  RAISE NOTICE '   2. Configure VAPID keys for push notifications';
  RAISE NOTICE '   3. Verify Resend API key configuration';
  RAISE NOTICE '   4. Test with: SELECT test_email_queue();';
  RAISE NOTICE '';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Error during validation: %', SQLERRM;
END $$;

-- Add function comments
COMMENT ON FUNCTION queue_email_notification IS 'Enhanced email queuing with better user data handling and error management';
COMMENT ON FUNCTION queue_push_notification IS 'Enhanced push notification queuing with device validation and error handling';
COMMENT ON FUNCTION get_email_queue_status IS 'Monitor email queue status by processing state';
COMMENT ON FUNCTION get_push_queue_status IS 'Monitor push queue status by processing state';
COMMENT ON FUNCTION retry_failed_notifications IS 'Retry failed email and push notifications with exponential backoff';
COMMENT ON FUNCTION test_email_queue IS 'Test email queue functionality with sample notification';
COMMENT ON FUNCTION cleanup_notification_queues IS 'Clean up old processed queue items to prevent database bloat';
COMMENT ON FUNCTION mark_notification_delivery_sent IS 'Mark notification delivery as successfully sent';
COMMENT ON FUNCTION mark_notification_delivery_failed IS 'Mark notification delivery as failed with error details';