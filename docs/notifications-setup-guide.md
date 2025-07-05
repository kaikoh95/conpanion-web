# Notification System Setup Guide

## Overview

The notification system is now fully implemented with a **consolidated, idempotent migration** that includes:

- **In-app notifications** (real-time via Supabase Realtime)
- **Email notifications** (queued with priority-based delivery)
- **Push notifications** (via Web Push API with Service Worker)
- **Comprehensive approval workflow notifications**
- **Comment and response tracking for approvals**

## Quick Start

### 1. Deploy the Consolidated Migration

The entire notification system is deployed with a single migration file:

```bash
# Apply the consolidated notification system migration
npx supabase db push

# Or reset and regenerate types (if needed)
npm run db:reset
```

**Migration File**: `supabase/migrations/20250705211438_consolidated_notification_system.sql`

This single migration includes:

- ✅ All notification types and enums
- ✅ Complete table schema (6 tables)
- ✅ Optimized indexes for performance
- ✅ Row Level Security policies
- ✅ Notification functions and triggers
- ✅ Real-time configuration

### 2. Configure Environment Variables

Add to your `.env.local`:

```bash
# Email configuration (using existing Resend setup)
RESEND_API_KEY=your-resend-api-key
NEXT_PUBLIC_SITE_URL=https://your-domain.com

# Push notification VAPID keys (generate using script below)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-public-vapid-key
VAPID_PRIVATE_KEY=your-private-vapid-key
```

### 3. Generate VAPID Keys for Push Notifications

```bash
# Generate VAPID keys using the included script
node scripts/generate-vapid-keys.js
```

Add the generated keys to your Supabase Edge Function environment variables.

## How the System Works

### Automated Notification Triggers

The consolidated migration includes **automatic triggers** for:

#### 📋 **Task Notifications**

- Task assignments/unassignments
- Task status updates
- Task comments with @mentions support
- Priority-based delivery

#### 🏢 **Organization & Project Notifications**

- User added to organization
- User added to project
- Role assignments

#### ✅ **Approval Workflow Notifications** (Enhanced)

- **Approval requests**: Notifies requester (confirmation) + all approvers
- **Approval comments**: Notifies requester + other approvers (excluding commenter)
- **Approver responses**: Notifies requester + other approvers when someone responds
- **Status changes**: Final approval/rejection notifications

#### 📝 **Form Notifications**

- Form assignments/unassignments
- Form-related updates

### Real-time Delivery Channels

1. **In-App (Real-time)**

   - Instant delivery via Supabase WebSockets
   - Automatic UI updates
   - Notification bell with unread count

2. **Email (Queued)**

   - Priority-based scheduling:
     - Critical: Immediate
     - High: 5 minutes
     - Medium: 15 minutes
     - Low: 30 minutes

3. **Push Notifications (Immediate)**
   - Works even when app is closed
   - Cross-platform support (web, mobile)

## Database Schema Overview

The consolidated migration creates these tables:

```
notifications              (Core notification records)
├── notification_deliveries    (Delivery tracking by channel)
├── notification_preferences   (User preferences per type)
├── email_queue               (Email delivery queue)
├── push_queue                (Push notification queue)
└── user_devices              (Push notification devices)
```

### Notification Types

```typescript
type NotificationType =
  | 'system' // Mandatory system notifications
  | 'organization_added' // Added to organization
  | 'project_added' // Added to project
  | 'task_assigned' // Task assignment
  | 'task_updated' // Task status changes
  | 'task_comment' // Task comments
  | 'comment_mention' // @mentions in comments
  | 'task_unassigned' // Task removal
  | 'form_assigned' // Form assignment
  | 'form_unassigned' // Form removal
  | 'approval_requested' // Approval workflows
  | 'approval_status_changed' // Approval decisions
  | 'entity_assigned'; // Generic entity assignments
```

## Edge Functions Setup

### Deploy Notification Processing Functions

```bash
# Deploy all notification-related edge functions
npx supabase functions deploy send-email-notification
npx supabase functions deploy send-push-notification
npx supabase functions deploy process-notification-queue
```

### Set Up Cron Job

In your Supabase dashboard:

1. Go to Edge Functions
2. Create a new cron job:
   - **Function**: `process-notification-queue`
   - **Schedule**: `*/5 * * * *` (every 5 minutes)
   - **Description**: "Process notification email and push queues"

## User Interface Components

### Notification Bell Component

```typescript
// Real-time notification subscription
const { unreadCount } = useNotifications()

// Shows unread count and opens notification center
<NotificationBell count={unreadCount} />
```

### Notification Preferences

Users can configure preferences at `/protected/settings/notifications`:

- ✅ **Per-type preferences**: Enable/disable by notification type
- ✅ **Per-channel preferences**: Choose email, push, in-app delivery
- ✅ **System notifications**: Always enabled (non-configurable)

### Notification Center

Access all notifications at `/protected/notifications`:

- ✅ **Real-time updates**: New notifications appear instantly
- ✅ **Mark as read**: Individual or bulk actions
- ✅ **Rich context**: Links to related entities
- ✅ **Filtering**: By type, read status, date

## Testing the System

### 1. Test Task Notifications

```bash
# Create a task and assign it to another user
# Expected: Assignee gets instant notification + email/push (if enabled)
```

### 2. Test Approval Workflow

```bash
# Create an approval request
# Expected:
#   - Requester: "Approval request submitted"
#   - Approvers: "Approval required"
```

```bash
# Add a comment to the approval
# Expected:
#   - Requester: "New comment on your approval request"
#   - Other approvers: "New comment on approval request"
```

```bash
# Approver responds with approval/rejection
# Expected:
#   - Requester: "Approval response received"
#   - Other approvers: "Approver response update"
```

### 3. Test Real-time Features

1. Open app in two browser windows (different users)
2. Trigger a notification from one window
3. Verify instant delivery in the other window

### 4. Test Email Delivery

1. Enable email notifications in user preferences
2. Trigger a notification
3. Check Resend dashboard for delivery status

### 5. Test Push Notifications

1. Enable browser notifications
2. Close the browser tab
3. Trigger a notification from another account
4. Verify push notification appears

## Migration Benefits

### ✅ **Idempotent Design**

- Safe to run multiple times
- No data loss on re-deployment
- Handles existing installations

### ✅ **Performance Optimized**

- Strategic database indexes
- Efficient query patterns
- Real-time subscriptions

### ✅ **Comprehensive Coverage**

- All notification types included
- Complete approval workflow
- Comment and response tracking

### ✅ **Production Ready**

- Row Level Security
- Proper error handling
- Monitoring capabilities

## Troubleshooting

### Migration Issues

```bash
# If migration fails, check for:
ERROR: column "type" does not exist
# Solution: The consolidated migration handles this automatically

# To debug, check migration status:
npx supabase db diff
```

### Real-time Issues

```bash
# Check if realtime is enabled for notifications table:
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
# Should include 'notifications' table
```

### Notification Not Triggering

```bash
# Check if triggers are active:
SELECT * FROM information_schema.triggers
WHERE event_object_table IN ('tasks', 'approvals', 'entity_assignees');
```

### Performance Issues

```bash
# Check index usage:
EXPLAIN ANALYZE SELECT * FROM notifications
WHERE user_id = 'user-id' AND is_read = false;
# Should use idx_notifications_user_unread
```

## Security Features

### ✅ **Row Level Security**

- Users only see their own notifications
- Service role for system operations
- Secure policy definitions

### ✅ **Data Privacy**

- Notification preferences respected
- Secure device registration
- Encrypted push payloads

### ✅ **Audit Trail**

- Complete delivery tracking
- Error logging and monitoring
- User action history

## Monitoring and Analytics

Track these metrics in your Supabase dashboard:

1. **Notification Volume**: Daily/weekly notification counts
2. **Delivery Rates**: Success rates by channel
3. **Read Rates**: User engagement metrics
4. **Error Rates**: Failed deliveries and retries
5. **Performance**: Trigger execution times

## Next Steps

1. **Customize Email Templates**: Update templates in edge functions
2. **Add More Triggers**: Extend for additional entity types
3. **Implement Batching**: Group similar notifications
4. **Add Analytics**: Track user engagement
5. **Mobile Push**: Extend to mobile apps with FCM/APNS

The notification system is now fully deployed and ready for production use! 🚀
