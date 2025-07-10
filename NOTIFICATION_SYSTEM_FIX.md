# Notification System Fix Documentation

## Problem Statement

Users were not receiving notifications for all notification types because of missing notification preferences in the database. The system had the following issues:

1. **Missing Preferences**: Not all users had notification preferences for every notification type
2. **Silent Failures**: When preferences were missing, notifications failed silently
3. **Incomplete Initialization**: The trigger to create default preferences wasn't working for all users
4. **No Recovery Mechanism**: No way to fix missing preferences after user creation

## Root Cause Analysis

### 1. Notification Preference Check Issue

The original `create_notification` function checked for user preferences:

```sql
-- Check user preferences
SELECT * INTO v_user_preferences
FROM notification_preferences
WHERE user_id = p_user_id AND type = p_type;

-- Queue email if enabled or system notification (default: enabled)
IF p_type = 'system' OR COALESCE(v_user_preferences.email_enabled, true) THEN
  PERFORM queue_email_notification(v_notification_id);
END IF;
```

**Issue**: If no preference record existed, `v_user_preferences` would be NULL, and the COALESCE would default to `true`. However, this wasn't consistent and could fail in edge cases.

### 2. Trigger Timing Issue

The trigger `create_default_preferences_on_profile_trigger` was supposed to create preferences when a user profile was created, but:
- It might have been added after some users already existed
- It could fail silently if there were permission issues
- Race conditions during user creation could bypass it

### 3. Notification Types

The system supports 13 notification types:
- `system`
- `organization_added`
- `project_added`
- `task_assigned`
- `task_updated`
- `task_comment`
- `comment_mention`
- `task_unassigned`
- `form_assigned`
- `form_unassigned`
- `approval_requested`
- `approval_status_changed`
- `entity_assigned`

Each user needs a preference record for EACH type to ensure proper notification delivery.

## Solution Implemented

### 1. Enhanced `create_notification` Function

The updated function now:
- **Creates missing preferences on-demand** when a notification is sent
- **Handles race conditions** with proper conflict resolution
- **Ensures consistent defaults** (email=true, push=false, in-app=true)

```sql
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
```

### 2. Batch Fix for Existing Users

The migration includes a comprehensive fix that:
- **Processes all existing users** in the system
- **Creates missing preferences** for each notification type
- **Reports progress** and any errors
- **Validates completeness** after execution

### 3. New Helper Functions

#### `ensure_all_notification_preferences(user_id)`
- Creates all missing notification preferences for a specific user
- Returns count of created preferences and their types
- Handles conflicts gracefully

#### `validate_notification_preferences()`
- Returns list of users with missing preferences
- Shows which notification types are missing
- Useful for ongoing monitoring

#### `get_notification_preference_summary()`
- Provides system-wide statistics
- Shows total users vs users with complete preferences
- Calculates average preferences per user

#### `fix_user_notification_preferences(email)`
- Fixes preferences for a specific user by email
- Useful for customer support scenarios
- Returns detailed results

### 4. Enhanced Trigger

The improved trigger:
- **Logs any failures** instead of failing silently
- **Uses the new ensure function** for consistency
- **Reports created preferences** for monitoring

## Verification

### Check System Status

```sql
-- Get overall summary
SELECT * FROM get_notification_preference_summary();

-- Find users with missing preferences
SELECT * FROM validate_notification_preferences();

-- Fix a specific user
SELECT fix_user_notification_preferences('user@example.com');
```

### Expected Results

After applying the migration:
- All users should have 13 notification preferences each
- `users_with_missing_preferences` should be 0
- `avg_preferences_per_user` should be exactly 13.00

## User Experience Impact

### Before Fix
- Users might not receive some notification types
- Inconsistent notification delivery
- No way for users to know preferences were missing

### After Fix
- All users receive all applicable notifications
- Consistent email delivery for all notification types
- Automatic preference creation for edge cases
- Better monitoring and support tools

## Default Notification Settings

When preferences are created (either for new or existing users):
- **Email**: Enabled by default ✅
- **Push**: Disabled by default ❌ (requires device registration)
- **In-App**: Enabled by default ✅

Users can customize these settings in their notification preferences page.

## Edge Function Integration

The system includes edge functions for email delivery:
- `send-email-notification`: Processes email queue and sends via Resend
- `process-notification-queue`: Orchestrates notification processing

These functions read from the `email_queue` table which is populated based on user preferences.

## Monitoring and Maintenance

### Regular Checks

1. **Weekly validation**: Run `validate_notification_preferences()` to catch any issues
2. **New user monitoring**: Check logs for preference creation failures
3. **Support queries**: Use `fix_user_notification_preferences()` for user complaints

### Database Queries

```sql
-- Check users created in last 7 days have preferences
SELECT 
  up.id,
  up.email,
  up.created_at,
  COUNT(np.type) as preference_count
FROM user_profiles up
LEFT JOIN notification_preferences np ON np.user_id = up.id
WHERE up.created_at > NOW() - INTERVAL '7 days'
GROUP BY up.id, up.email, up.created_at
HAVING COUNT(np.type) < 13;
```

## Future Improvements

1. **Preference Templates**: Allow admins to define default preference templates
2. **Bulk Preference Updates**: UI for users to enable/disable all notifications at once
3. **Notification Categories**: Group related notifications for easier management
4. **Preference Inheritance**: Organization-level default preferences
5. **Notification Digest**: Option to receive daily/weekly summaries instead of individual emails

## Summary

This fix ensures:
- ✅ All users have complete notification preferences
- ✅ Missing preferences are created automatically
- ✅ Consistent notification delivery for all types
- ✅ Better monitoring and support tools
- ✅ Future-proof system that handles edge cases

The migration is safe to run multiple times and will only create missing preferences without affecting existing ones.