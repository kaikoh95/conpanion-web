-- ========================================
-- FIX NOTIFICATION PREFERENCES FOR ALL USERS
-- ========================================
-- This migration ensures all users have notification preferences for all notification types
-- and improves the notification system to handle missing preferences gracefully.

-- ===========================================
-- STEP 1: Create improved notification function that handles missing preferences
-- ===========================================

-- Enhanced create_notification function that creates missing preferences on-demand
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
  v_email_enabled BOOLEAN;
  v_push_enabled BOOLEAN;
  v_in_app_enabled BOOLEAN;
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
    'sent',
    NOW()
  );
  
  -- Check user preferences
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;
  
  -- If no preferences exist, create them with defaults
  IF NOT FOUND THEN
    -- Create default preferences for this type
    INSERT INTO notification_preferences (
      user_id,
      type,
      email_enabled,
      push_enabled,
      in_app_enabled
    ) VALUES (
      p_user_id,
      p_type,
      true,  -- Email enabled by default
      false, -- Push disabled by default (requires device registration)
      true   -- In-app enabled by default
    ) ON CONFLICT (user_id, type) DO NOTHING
    RETURNING email_enabled, push_enabled, in_app_enabled 
    INTO v_email_enabled, v_push_enabled, v_in_app_enabled;
    
    -- If insert failed due to race condition, get the existing preferences
    IF NOT FOUND THEN
      SELECT email_enabled, push_enabled, in_app_enabled 
      INTO v_email_enabled, v_push_enabled, v_in_app_enabled
      FROM notification_preferences
      WHERE user_id = p_user_id AND type = p_type;
    END IF;
  ELSE
    v_email_enabled := v_user_preferences.email_enabled;
    v_push_enabled := v_user_preferences.push_enabled;
    v_in_app_enabled := v_user_preferences.in_app_enabled;
  END IF;
  
  -- Queue email if enabled or system notification (system notifications always send email)
  IF p_type = 'system' OR COALESCE(v_email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;
  
  -- Queue push if enabled and user has devices
  IF COALESCE(v_push_enabled, false) THEN
    -- Only queue if user has registered devices
    IF EXISTS (SELECT 1 FROM user_devices WHERE user_id = p_user_id AND push_enabled = true) THEN
      PERFORM queue_push_notification(v_notification_id);
    END IF;
  END IF;
  
  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 2: Create function to ensure all preferences exist for a user
-- ===========================================

-- Function to ensure a user has all notification type preferences
CREATE OR REPLACE FUNCTION ensure_all_notification_preferences(p_user_id UUID)
RETURNS TABLE(
  created_count INTEGER,
  notification_types TEXT[]
) AS $$
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
  ]::notification_type[];
  v_type notification_type;
  v_created_count INTEGER := 0;
  v_created_types TEXT[] := '{}';
BEGIN
  -- Create preferences for each notification type if they don't exist
  FOREACH v_type IN ARRAY v_notification_types LOOP
    BEGIN
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
      );
      
      v_created_count := v_created_count + 1;
      v_created_types := array_append(v_created_types, v_type::TEXT);
      
    EXCEPTION WHEN unique_violation THEN
      -- Preference already exists, skip
      NULL;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_created_count, v_created_types;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 3: Fix existing users - ensure all have complete preferences
-- ===========================================

-- Create missing preferences for all existing users
DO $$
DECLARE
  v_user RECORD;
  v_total_users INTEGER := 0;
  v_users_fixed INTEGER := 0;
  v_preferences_created INTEGER := 0;
  v_result RECORD;
BEGIN
  -- Count total users
  SELECT COUNT(*) INTO v_total_users FROM user_profiles;
  
  RAISE NOTICE 'Starting notification preference fix for % users...', v_total_users;
  
  -- Process each user
  FOR v_user IN 
    SELECT id, email 
    FROM user_profiles 
    ORDER BY created_at
  LOOP
    -- Ensure all preferences exist for this user
    SELECT * INTO v_result
    FROM ensure_all_notification_preferences(v_user.id);
    
    IF v_result.created_count > 0 THEN
      v_users_fixed := v_users_fixed + 1;
      v_preferences_created := v_preferences_created + v_result.created_count;
      
      RAISE NOTICE 'Created % preferences for user % (%)', 
        v_result.created_count, 
        v_user.id, 
        v_user.email;
    END IF;
  END LOOP;
  
  RAISE NOTICE '✅ Notification preference fix completed!';
  RAISE NOTICE '   Total users processed: %', v_total_users;
  RAISE NOTICE '   Users with missing preferences: %', v_users_fixed;
  RAISE NOTICE '   Total preferences created: %', v_preferences_created;
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '❌ Error during preference fix: %', SQLERRM;
  RAISE NOTICE '   Processed % users before error', v_users_fixed;
END $$;

-- ===========================================
-- STEP 4: Create validation function
-- ===========================================

-- Function to validate notification preferences completeness
CREATE OR REPLACE FUNCTION validate_notification_preferences()
RETURNS TABLE(
  user_id UUID,
  email TEXT,
  missing_types TEXT[],
  preference_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH expected_types AS (
    SELECT unnest(ARRAY[
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
    ]::notification_type[]) AS type
  ),
  user_preferences AS (
    SELECT 
      up.id,
      up.email,
      array_agg(np.type::TEXT ORDER BY np.type) AS existing_types,
      COUNT(np.type) AS pref_count
    FROM user_profiles up
    LEFT JOIN notification_preferences np ON np.user_id = up.id
    GROUP BY up.id, up.email
  )
  SELECT 
    up.id,
    up.email,
    array_agg(et.type::TEXT ORDER BY et.type) AS missing_types,
    up.pref_count
  FROM user_preferences up
  CROSS JOIN expected_types et
  WHERE NOT (et.type::TEXT = ANY(COALESCE(up.existing_types, '{}')))
  GROUP BY up.id, up.email, up.pref_count
  HAVING COUNT(*) > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 5: Enhanced trigger for new user profiles
-- ===========================================

-- Enhanced function that logs any issues
CREATE OR REPLACE FUNCTION create_default_preferences_on_profile_creation()
RETURNS TRIGGER AS $$
DECLARE
  v_result RECORD;
BEGIN
  -- Create default notification preferences for the new user profile
  BEGIN
    SELECT * INTO v_result
    FROM ensure_all_notification_preferences(NEW.id);
    
    IF v_result.created_count > 0 THEN
      RAISE NOTICE 'Created % notification preferences for new user %', 
        v_result.created_count, NEW.id;
    END IF;
    
  EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the user creation
    RAISE WARNING 'Failed to create notification preferences for user %: %', 
      NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger to ensure it's active
DROP TRIGGER IF EXISTS create_default_preferences_on_profile_trigger ON user_profiles;
CREATE TRIGGER create_default_preferences_on_profile_trigger
AFTER INSERT ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION create_default_preferences_on_profile_creation();

-- ===========================================
-- STEP 6: Add helper functions for admins
-- ===========================================

-- Function to get notification preference summary
CREATE OR REPLACE FUNCTION get_notification_preference_summary()
RETURNS TABLE(
  total_users BIGINT,
  users_with_complete_preferences BIGINT,
  users_with_missing_preferences BIGINT,
  total_preferences BIGINT,
  avg_preferences_per_user NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH user_counts AS (
    SELECT 
      COUNT(DISTINCT up.id) AS total_users,
      COUNT(DISTINCT CASE 
        WHEN np_count.pref_count = 13 THEN up.id 
      END) AS complete_users,
      COUNT(DISTINCT CASE 
        WHEN np_count.pref_count < 13 OR np_count.pref_count IS NULL THEN up.id 
      END) AS incomplete_users
    FROM user_profiles up
    LEFT JOIN (
      SELECT user_id, COUNT(*) as pref_count
      FROM notification_preferences
      GROUP BY user_id
    ) np_count ON np_count.user_id = up.id
  ),
  pref_stats AS (
    SELECT 
      COUNT(*) as total_prefs,
      AVG(pref_count) as avg_prefs
    FROM (
      SELECT user_id, COUNT(*) as pref_count
      FROM notification_preferences
      GROUP BY user_id
    ) counts
  )
  SELECT 
    uc.total_users,
    uc.complete_users,
    uc.incomplete_users,
    ps.total_prefs,
    ROUND(ps.avg_prefs, 2)
  FROM user_counts uc, pref_stats ps;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to fix a specific user's preferences
CREATE OR REPLACE FUNCTION fix_user_notification_preferences(p_user_email TEXT)
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_result RECORD;
BEGIN
  -- Get user ID from email
  SELECT id INTO v_user_id
  FROM user_profiles
  WHERE email = p_user_email;
  
  IF v_user_id IS NULL THEN
    RETURN format('User not found with email: %s', p_user_email);
  END IF;
  
  -- Fix their preferences
  SELECT * INTO v_result
  FROM ensure_all_notification_preferences(v_user_id);
  
  IF v_result.created_count > 0 THEN
    RETURN format('Created %s missing preferences for user %s: %s', 
      v_result.created_count, 
      p_user_email,
      array_to_string(v_result.notification_types, ', '));
  ELSE
    RETURN format('User %s already has all notification preferences', p_user_email);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- STEP 7: Validation and summary
-- ===========================================

-- Run validation and show summary
DO $$
DECLARE
  v_summary RECORD;
  v_invalid_user RECORD;
  v_invalid_count INTEGER := 0;
BEGIN
  -- Get summary
  SELECT * INTO v_summary
  FROM get_notification_preference_summary();
  
  RAISE NOTICE '';
  RAISE NOTICE '📊 NOTIFICATION PREFERENCE SUMMARY:';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Total users: %', v_summary.total_users;
  RAISE NOTICE 'Users with complete preferences: %', v_summary.users_with_complete_preferences;
  RAISE NOTICE 'Users with missing preferences: %', v_summary.users_with_missing_preferences;
  RAISE NOTICE 'Total preferences in system: %', v_summary.total_preferences;
  RAISE NOTICE 'Average preferences per user: %', v_summary.avg_preferences_per_user;
  RAISE NOTICE '';
  
  -- If there are still users with missing preferences, list them
  IF v_summary.users_with_missing_preferences > 0 THEN
    RAISE NOTICE '⚠️  Users still missing preferences:';
    FOR v_invalid_user IN 
      SELECT * FROM validate_notification_preferences() 
      LIMIT 10
    LOOP
      v_invalid_count := v_invalid_count + 1;
      RAISE NOTICE '   - % (%) - missing: %', 
        v_invalid_user.email, 
        v_invalid_user.user_id,
        array_to_string(v_invalid_user.missing_types, ', ');
    END LOOP;
    
    IF v_invalid_count < v_summary.users_with_missing_preferences THEN
      RAISE NOTICE '   ... and % more users', 
        v_summary.users_with_missing_preferences - v_invalid_count;
    END IF;
  ELSE
    RAISE NOTICE '✅ All users have complete notification preferences!';
  END IF;
  
END $$;

-- ===========================================
-- STEP 8: Grant permissions
-- ===========================================

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION ensure_all_notification_preferences TO service_role;
GRANT EXECUTE ON FUNCTION validate_notification_preferences TO authenticated;
GRANT EXECUTE ON FUNCTION get_notification_preference_summary TO authenticated;
GRANT EXECUTE ON FUNCTION fix_user_notification_preferences TO service_role;

-- Add function comments
COMMENT ON FUNCTION ensure_all_notification_preferences IS 'Ensures a user has preferences for all notification types';
COMMENT ON FUNCTION validate_notification_preferences IS 'Validates which users are missing notification preferences';
COMMENT ON FUNCTION get_notification_preference_summary IS 'Returns summary statistics about notification preferences';
COMMENT ON FUNCTION fix_user_notification_preferences IS 'Fixes notification preferences for a specific user by email';

-- ===========================================
-- CLEANUP: Remove old function if exists
-- ===========================================

-- The old create_default_notification_preferences is still useful, keep it

-- Final success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Notification preference fix migration completed successfully!';
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '1. Monitor the notification_preferences table for completeness';
  RAISE NOTICE '2. Use validate_notification_preferences() to check for issues';
  RAISE NOTICE '3. Use fix_user_notification_preferences(email) for individual fixes';
  RAISE NOTICE '';
END $$;