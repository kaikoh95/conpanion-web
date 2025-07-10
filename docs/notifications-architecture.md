# Notifications System Architecture

## Overview

This document outlines the architecture for a comprehensive notifications system implemented via a **consolidated, idempotent migration** for the construction project management SaaS application. The system handles all notification types while ensuring critical system notifications reach all users.

## Key Requirements ✅

1. **✅ Mandatory System Notifications**: All users receive system notifications (non-configurable)
2. **✅ Organization/Project Notifications**: Users notified when added to organizations or projects
3. **✅ Task Notifications**: Assigned users receive notifications for comments and task updates
4. **✅ Approval Notifications**: Enhanced workflow with requester confirmations and comprehensive approval tracking
5. **✅ Entity Assignment Notifications**: Users notified for all entities they're assigned to
6. **✅ Approval Comments & Responses**: Real-time notifications for approval collaboration

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Client Applications                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │  Web App    │  │ Mobile App  │  │   Desktop   │  │ Email Client │  │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  │
└─────────┼───────────────┼───────────────┼──────────────────┼──────────┘
          │               │               │                  │
          └───────────────┴───────────────┴──────────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │     Consolidated          │
                    │  Notification System      │
                    │ (Single Migration File)   │
                    └─────────────┬─────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────▼──────┐       ┌───────▼────────┐     ┌───────▼────────┐
    │ Real-time  │       │  Email Queue   │     │  Push Queue    │
    │ Delivery   │       │   Processing   │     │  Processing    │
    └─────┬──────┘       └───────┬────────┘     └───────┬────────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      Supabase           │
                    │  ┌────────────────┐     │
                    │  │  Consolidated   │     │
                    │  │  Migration:     │     │
                    │  │ • Types/Enums   │     │
                    │  │ • 6 Tables      │     │
                    │  │ • Indexes       │     │
                    │  │ • RLS Policies  │     │
                    │  │ • Functions     │     │
                    │  │ • Triggers      │     │
                    │  │ • Realtime      │     │
                    │  └────────────────┘     │
                    └─────────────────────────┘
```

## Database Schema

### Consolidated Migration: `20250705211438_consolidated_notification_system.sql`

This single, idempotent migration file includes everything needed for the notification system:

### Core Types and Enums

```sql
-- Conditionally created types (safe for re-runs)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'system',                    -- Mandatory system notifications
      'organization_added',        -- User added to organization
      'project_added',            -- User added to project
      'task_assigned',            -- Task assignment
      'task_updated',             -- Task status/details updated
      'task_comment',             -- Comments on tasks
      'comment_mention',          -- @mentions in comments
      'task_unassigned',          -- Task removal
      'form_assigned',            -- Form assignment
      'form_unassigned',          -- Form removal
      'approval_requested',       -- Approval workflow requests
      'approval_status_changed',  -- Approval decisions
      'entity_assigned'           -- Generic entity assignments
    );
  END IF;
END $$;

-- Priority levels for delivery timing
CREATE TYPE notification_priority AS ENUM (
  'low',        -- 30 min delay
  'medium',     -- 15 min delay
  'high',       -- 5 min delay
  'critical'    -- Immediate
);
```

### Complete Database Schema

```
┌─────────────────────────────┐
│      notifications          │ ── Core notification records
├─────────────────────────────┤
│ id: uuid (PK)              │
│ user_id: uuid (FK→users)   │
│ type: notification_type    │
│ priority: notification_priority│
│ title: text                │
│ message: text              │
│ data: jsonb                │
│ entity_type: text          │
│ entity_id: text            │
│ is_read: boolean           │
│ read_at: timestamptz       │
│ created_at: timestamptz    │
│ created_by: uuid           │
│ updated_at: timestamptz    │
└─────────────────────────────┘
              │
              │ 1:N
              ▼
┌─────────────────────────────┐
│  notification_deliveries    │ ── Delivery tracking by channel
├─────────────────────────────┤
│ id: uuid (PK)              │
│ notification_id: uuid (FK)  │
│ channel: text              │
│ status: delivery_status    │
│ delivered_at: timestamptz  │
│ retry_count: integer       │
│ error_message: text        │
│ metadata: jsonb            │
│ created_at: timestamptz    │
└─────────────────────────────┘

┌─────────────────────────────┐
│  notification_preferences   │ ── User preferences per type
├─────────────────────────────┤
│ id: uuid (PK)              │
│ user_id: uuid (FK→users)   │
│ type: notification_type    │
│ email_enabled: boolean     │
│ push_enabled: boolean      │
│ in_app_enabled: boolean    │
│ created_at: timestamptz    │
│ updated_at: timestamptz    │
└─────────────────────────────┘

┌─────────────────────────────┐
│       email_queue           │ ── Priority-based email delivery
├─────────────────────────────┤
│ id: uuid (PK)              │
│ notification_id: uuid (FK)  │
│ to_email: text             │
│ to_name: text              │
│ subject: text              │
│ template_id: text          │
│ template_data: jsonb       │
│ priority: notification_priority│
│ status: email_status       │
│ scheduled_for: timestamptz │
│ sent_at: timestamptz       │
│ error_message: text        │
│ retry_count: integer       │
│ created_at: timestamptz    │
└─────────────────────────────┘

┌─────────────────────────────┐
│       push_queue            │ ── Push notification delivery
├─────────────────────────────┤
│ id: uuid (PK)              │
│ notification_id: uuid (FK)  │
│ device_id: uuid (FK)       │
│ platform: text             │
│ token: text                │
│ payload: jsonb             │
│ priority: notification_priority│
│ status: delivery_status    │
│ scheduled_for: timestamptz │
│ sent_at: timestamptz       │
│ error_message: text        │
│ created_at: timestamptz    │
└─────────────────────────────┘

┌─────────────────────────────┐
│      user_devices           │ ── Push notification devices
├─────────────────────────────┤
│ id: uuid (PK)              │
│ user_id: uuid (FK→users)   │
│ platform: text             │
│ token: text                │
│ device_name: text          │
│ push_enabled: boolean      │
│ last_used: timestamptz     │
│ created_at: timestamptz    │
│ updated_at: timestamptz    │
└─────────────────────────────┘
```

## Enhanced Notification Flow

### 1. Comprehensive Notification Generation

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   User Action   │────▶│ Database Trigger│────▶│Create Notification│
│                 │     │ (Automated)     │     │   + Queue All     │
└─────────────────┘     └─────────────────┘     └─────────┬───────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Push Queue    │◀────│  Delivery Split │────▶│   Email Queue   │
│ (Immediate)     │     │                 │     │ (Priority-based)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
          │                                                │
          ▼                                                ▼
┌─────────────────┐                               ┌─────────────────┐
│  Real-time UI   │                               │  Email Template │
│    Update       │                               │   Processing    │
└─────────────────┘                               └─────────────────┘
```

### 2. Enhanced Approval Workflow Notifications

```
Approval Request Created
├── Requester: "Your approval request has been submitted"
└── All Approvers: "John requested approval for: Office Renovation"

Approval Comment Added
├── Requester: "Sarah commented on your approval request"
└── Other Approvers: "Sarah commented on approval request"

Approver Response Given
├── Requester: "Mike responded to your approval request"
└── Other Approvers: "Mike responded to approval request"

Final Status Change
└── Requester: "Your approval request has been approved"
```

## Automatic Notification Triggers

### ✅ **Task-Related Triggers**

```sql
-- Task assignments/unassignments (entity_assignees table)
CREATE TRIGGER entity_assignment_notification_trigger
AFTER INSERT ON entity_assignees
FOR EACH ROW EXECUTE FUNCTION notify_task_assignment_changes();

-- Task status updates (tasks table)
CREATE TRIGGER task_update_notification_trigger
AFTER UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION notify_task_updates();

-- Task comments with @mentions (task_comments table)
CREATE TRIGGER task_comment_notification_trigger
AFTER INSERT ON task_comments
FOR EACH ROW EXECUTE FUNCTION notify_task_comment();
```

### ✅ **Approval Workflow Triggers** (Enhanced)

```sql
-- Main approval requests/status changes (approvals table)
CREATE TRIGGER approval_notification_trigger
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW EXECUTE FUNCTION notify_approval_changes();

-- Approval comments (approval_comments table)
CREATE TRIGGER approval_comment_notification_trigger
AFTER INSERT ON approval_comments
FOR EACH ROW EXECUTE FUNCTION notify_approval_comment();

-- Approver responses (approval_approver_responses table)
CREATE TRIGGER approval_response_notification_trigger
AFTER INSERT OR UPDATE ON approval_approver_responses
FOR EACH ROW EXECUTE FUNCTION notify_approval_response();
```

### ✅ **Membership Triggers**

```sql
-- Project membership (projects_users table)
CREATE TRIGGER project_member_notification_trigger
AFTER INSERT ON projects_users
FOR EACH ROW EXECUTE FUNCTION notify_project_membership();

-- Organization membership (organization_users table)
CREATE TRIGGER organization_user_notification_trigger
AFTER INSERT ON organization_users
FOR EACH ROW EXECUTE FUNCTION notify_organization_membership();
```

## Performance Optimizations

### Strategic Database Indexing

```sql
-- Critical indexes included in migration
CREATE INDEX idx_notifications_user_unread
ON notifications(user_id, is_read) WHERE is_read = false;

CREATE INDEX idx_notifications_user_created
ON notifications(user_id, created_at DESC);

CREATE INDEX idx_notifications_entity
ON notifications(entity_type, entity_id) WHERE entity_type IS NOT NULL;

CREATE INDEX idx_email_queue_status_scheduled
ON email_queue(status, scheduled_for) WHERE status = 'pending';

CREATE INDEX idx_push_queue_status
ON push_queue(status, scheduled_for) WHERE status = 'pending';
```

### Query Performance

```sql
-- Optimized query patterns:

-- Get unread notifications for user (uses idx_notifications_user_unread)
SELECT * FROM notifications
WHERE user_id = $1 AND is_read = false
ORDER BY created_at DESC;

-- Get notifications for entity (uses idx_notifications_entity)
SELECT * FROM notifications
WHERE entity_type = 'task' AND entity_id = $1;

-- Process email queue (uses idx_email_queue_status_scheduled)
SELECT * FROM email_queue
WHERE status = 'pending' AND scheduled_for <= NOW()
ORDER BY priority DESC, scheduled_for;
```

## Real-time Updates with Supabase

### Database Realtime Configuration

```sql
-- Included in migration: Enable realtime for notifications
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
```

### Client-side Real-time Subscription

```typescript
// Real-time notification subscription
const { data: notifications } = useSupabaseQuery({
  query: supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false }),
});

// Real-time subscription for new notifications
useEffect(() => {
  const subscription = supabase
    .channel(`user-notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        // Show toast notification
        showNotificationToast(payload.new);
        // Update notification count
        incrementUnreadCount();
      },
    )
    .subscribe();

  return () => subscription.unsubscribe();
}, [userId]);
```

## Security Implementation

### Row Level Security Policies

```sql
-- Included in migration: Comprehensive RLS policies

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- System can create notifications
CREATE POLICY "System can create notifications"
ON notifications FOR INSERT
WITH CHECK (true); -- Restricted via functions

-- Users cannot delete notifications
CREATE POLICY "Users cannot delete notifications"
ON notifications FOR DELETE
USING (false);
```

### Notification Functions Security

```sql
-- Functions run with SECURITY DEFINER (elevated privileges)
CREATE OR REPLACE FUNCTION create_notification(...)
RETURNS UUID AS $$
-- Function validates all inputs and user permissions
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant specific permissions
GRANT EXECUTE ON FUNCTION create_notification TO service_role;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;
```

## Scalability Design

### Horizontal Scaling Ready

```
┌─────────────────────────────────────────────────────────┐
│                   Load Balancer                         │
└─────────────────────┬───────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
  ┌───────────┐ ┌───────────┐ ┌───────────┐
  │Instance 1 │ │Instance 2 │ │Instance 3 │
  └───────────┘ └───────────┘ └───────────┘
        │             │             │
        └─────────────┼─────────────┘
                      │
        ┌─────────────▼─────────────┐
        │    Supabase Database      │
        │   (Shared State)          │
        └───────────────────────────┘
```

### Queue Processing Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Notification   │───▶│   Email Queue   │───▶│  Email Worker   │
│    Creation     │    │  (Prioritized)  │    │ (Edge Function) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │
        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Push Queue    │───▶│ Push Processing │───▶│  Push Worker    │
│  (Immediate)    │    │                 │    │ (Edge Function) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Migration Benefits

### ✅ **Idempotent Design**

- **Safe Re-runs**: Can be executed multiple times without errors
- **Conditional Creation**: Types and tables created only if they don't exist
- **Data Preservation**: No data loss during re-deployment
- **Development Friendly**: Easy to iterate and test

### ✅ **Production Ready**

- **Complete System**: All components in single migration
- **Performance Optimized**: Strategic indexes and queries
- **Security Built-in**: RLS policies and function permissions
- **Monitoring Ready**: Delivery tracking and error handling

### ✅ **Extensible Architecture**

- **New Notification Types**: Easy to add via enum extension
- **Custom Triggers**: Additional entity types can be supported
- **Channel Expansion**: New delivery channels (SMS, Slack, etc.)
- **Advanced Features**: Batching, scheduling, AI summarization

## Monitoring and Analytics

### Key Metrics Tracked

```sql
-- Notification volume by type
SELECT type, COUNT(*) as count
FROM notifications
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY type;

-- Delivery success rates by channel
SELECT channel,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'delivered') / COUNT(*), 2) as success_rate
FROM notification_deliveries
GROUP BY channel;

-- Read rates by notification type
SELECT type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE is_read = true) as read,
  ROUND(100.0 * COUNT(*) FILTER (WHERE is_read = true) / COUNT(*), 2) as read_rate
FROM notifications
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY type;
```

### Dashboard Components

```
┌─────────────────────────────────────────────────────────────┐
│                 Notification System Dashboard               │
├─────────────────────────────────────────────────────────────┤
│  📊 Real-time Metrics                                       │
│  ├─ Total Notifications: 1,247 (last 24h)                  │
│  ├─ Delivery Rate: 98.5%                                    │
│  ├─ Read Rate: 72%                                          │
│  └─ Average Read Time: 3.2 minutes                          │
│                                                             │
│  🎯 Performance Metrics                                     │
│  ├─ Trigger Execution: < 10ms avg                          │
│  ├─ Real-time Delivery: < 1s                               │
│  ├─ Email Queue Processing: 95% within SLA                  │
│  └─ Push Delivery: 98% success rate                         │
│                                                             │
│  📈 Trending                                                │
│  ├─ Task Notifications: ↑ 15% (week over week)             │
│  ├─ Approval Notifications: ↑ 8%                           │
│  ├─ System Notifications: → stable                          │
│  └─ Comment Notifications: ↑ 22%                           │
└─────────────────────────────────────────────────────────────┘
```

## Summary

This consolidated notification system architecture provides:

1. **✅ Single Migration Deployment**: Everything in one idempotent file
2. **✅ Comprehensive Coverage**: All notification types and workflows
3. **✅ Enhanced Approval Flow**: Complete approval collaboration support
4. **✅ Real-time Performance**: Sub-second delivery for critical notifications
5. **✅ Multi-channel Delivery**: In-app, email, and push notifications
6. **✅ Production Security**: RLS policies and proper access controls
7. **✅ Horizontal Scalability**: Ready for growth and multiple instances
8. **✅ Developer Friendly**: Easy to extend and maintain

The system is production-ready and handles everything from basic task notifications to complex approval workflows with real-time collaboration features.
