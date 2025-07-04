# Notification Preferences Fix

## Problem Description

Users were able to toggle notification settings on/off in the notification settings page, but these preferences were not actually being respected by the notification system. Notifications continued to be delivered regardless of user preferences.

## Root Cause

The notification system had two main issues:

1. **Database functions ignored user preferences**: The `get_user_notifications`, `get_unread_notification_count`, and `create_notification` functions did not check user preferences before creating or retrieving notifications.

2. **No preference filtering**: When creating notifications, the system didn't filter recipients based on their notification preferences (global settings, type-specific settings, or quiet hours).

## Solution

### Database Changes (Migration: `20250704120911_fix_notification_preferences_not_working.sql`)

1. **New Helper Function**: Created `should_user_receive_notification()` that checks:
   - Global notifications enabled/disabled (`notifications_enabled`)
   - Type-specific preferences (`type_preferences` JSONB)
   - Quiet hours settings (respects timezone)
   - Automatically creates default preferences for new users

2. **Updated Core Functions**:
   - `get_user_notifications()`: Now filters notifications based on user preferences
   - `get_unread_notification_count()`: Only counts notifications the user should receive
   - `create_notification()`: Filters recipient list based on preferences
   - `mark_all_notifications_read()`: Only marks notifications the user should see

3. **Performance Optimization**: Added GIN index on `type_preferences` JSONB column

### API Changes

Updated `NotificationAPI.createNotification()` to handle the new behavior where the function returns `-1` when all recipients have disabled the notification type.

## How It Works

### Global Settings
- **Notifications Enabled**: Master toggle that disables all notifications when off
- **Email Notifications**: Controls email delivery (respected by system)
- **Push Notifications**: Controls browser push notifications (respected by system)

### Type-Specific Settings
Each notification type can be individually enabled/disabled:
- `system_announcement`
- `approval_request`
- `approval_status_update`
- `task_assignment`
- `task_status_update`
- `organization_invitation`
- `project_invitation`
- `form_submission`
- `site_diary_submission`
- `comment_mention`
- `due_date_reminder`

### Quiet Hours
- When enabled, notifications are suppressed during specified hours
- Respects user's timezone setting
- Handles cases where quiet hours span midnight (e.g., 22:00 to 07:00)

## Testing Instructions

### 1. Test Global Notification Toggle

1. Go to **Settings > Notifications**
2. Turn OFF "Enable Notifications"
3. Click "Save Changes"
4. Click "Test Notification" button
5. **Expected Result**: No new notification should appear in the notifications list

### 2. Test Type-Specific Toggles

1. Go to **Settings > Notifications**
2. Ensure "Enable Notifications" is ON
3. Turn OFF "System Announcement" notifications
4. Click "Save Changes"
5. Click "Test Notification" button (which creates a system announcement)
6. **Expected Result**: No new notification should appear in the notifications list

### 3. Test Quiet Hours

1. Go to **Settings > Notifications**
2. Enable "Quiet Hours"
3. Set Start Time to current time minus 1 hour
4. Set End Time to current time plus 1 hour
5. Click "Save Changes"
6. Click "Test Notification" button
7. **Expected Result**: No new notification should appear (suppressed by quiet hours)

### 4. Test Notification Filtering

1. Create a notification targeted to specific users
2. Ensure some users have disabled that notification type
3. **Expected Result**: Only users with enabled preferences should receive the notification

### 5. Test Settings Persistence

1. Change various notification settings
2. Save and refresh the page
3. **Expected Result**: All settings should persist and be reflected in the UI

## Backward Compatibility

- Existing users without preferences get default settings (all enabled)
- Existing notifications continue to work
- No breaking changes to the API surface

## Performance Considerations

- Added GIN index for JSONB preference lookups
- Helper function is marked as `SECURITY DEFINER` for consistent permission handling
- Functions use efficient PostgreSQL queries with proper indexing

## Migration Safety

The migration is safe to apply because:
- All functions use `CREATE OR REPLACE` so they update existing functions
- New helper function is additive
- New index creation uses `IF NOT EXISTS`
- Default behavior for users without preferences is to enable all notifications

## Future Enhancements

Consider adding:
- Email notification scheduling
- Notification digest options (daily/weekly summaries)
- Mobile push notification token management
- Notification history/archive functionality