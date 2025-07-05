# Notifications System Architecture

## Overview

This document outlines the architecture for a comprehensive notifications system for the construction project management SaaS application. The system is designed to handle various notification types while ensuring all users receive critical system notifications.

## Key Requirements

1. **Mandatory System Notifications**: All users must receive system notifications (non-configurable)
2. **Organization/Project Notifications**: Users notified when added to organizations or projects
3. **Task Notifications**: Assigned users receive notifications for comments and task updates
4. **Approval Notifications**: Both requesters and approvers receive approval-related notifications
5. **Entity Assignment Notifications**: Users notified for all entities they're assigned to

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
                    │       API Gateway         │
                    │   (NextJS API Routes)     │
                    └─────────────┬─────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
    ┌─────▼──────┐       ┌───────▼────────┐     ┌───────▼────────┐
    │Notification│       │  Notification  │     │  Notification  │
    │  Service   │       │   Generator    │     │   Delivery     │
    └─────┬──────┘       └───────┬────────┘     └───────┬────────┘
          │                      │                       │
          └──────────────────────┼───────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │      Supabase           │
                    │  ┌────────────────┐     │
                    │  │  Notifications  │     │
                    │  │    Tables       │     │
                    │  ├────────────────┤     │
                    │  │   Realtime     │     │
                    │  │   Triggers     │     │
                    │  ├────────────────┤     │
                    │  │  Edge Functions│     │
                    │  └────────────────┘     │
                    └─────────────────────────┘
```

## Database Schema

### Core Tables

```sql
-- Notification Types Enum
CREATE TYPE notification_type AS ENUM (
  'system',
  'organization_added',
  'project_added',
  'task_assigned',
  'task_updated',
  'task_comment',
  'approval_requested',
  'approval_status_changed',
  'entity_assigned'
);

-- Notification Priority Enum
CREATE TYPE notification_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Notification Delivery Status
CREATE TYPE delivery_status AS ENUM (
  'pending',
  'delivered',
  'failed',
  'retry'
);
```

### Database Tables Structure

```
┌─────────────────────────────┐
│      notifications          │
├─────────────────────────────┤
│ id: uuid (PK)              │
│ user_id: uuid (FK)         │
│ type: notification_type    │
│ priority: notification_priority│
│ title: text                │
│ message: text              │
│ data: jsonb                │
│ entity_type: text          │
│ entity_id: uuid            │
│ is_read: boolean           │
│ read_at: timestamp         │
│ created_at: timestamp      │
│ created_by: uuid           │
└─────────────────────────────┘
              │
              │ 1:N
              ▼
┌─────────────────────────────┐
│  notification_deliveries    │
├─────────────────────────────┤
│ id: uuid (PK)              │
│ notification_id: uuid (FK)  │
│ channel: text              │
│ status: delivery_status    │
│ delivered_at: timestamp    │
│ retry_count: integer       │
│ error_message: text        │
│ created_at: timestamp      │
└─────────────────────────────┘

┌─────────────────────────────┐
│  notification_preferences   │
├─────────────────────────────┤
│ id: uuid (PK)              │
│ user_id: uuid (FK)         │
│ type: notification_type    │
│ channel: text              │
│ enabled: boolean           │
│ created_at: timestamp      │
│ updated_at: timestamp      │
└─────────────────────────────┘
```

## Notification Flow

### 1. Notification Generation Flow

```
┌──────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   Trigger    │      │   Validation    │      │  Create Record   │
│   Event      ├─────▶│  & Enrichment   ├─────▶│  in Database     │
└──────────────┘      └─────────────────┘      └────────┬─────────┘
                                                         │
                                                         ▼
┌──────────────┐      ┌─────────────────┐      ┌──────────────────┐
│  Send Push   │◀─────│  Delivery Queue │◀─────│  Trigger Delivery│
│ Notification │      │   Processing    │      │     Service      │
└──────────────┘      └─────────────────┘      └──────────────────┘
```

### 2. Real-time Notification Flow

```
User Action → Database Trigger → Supabase Realtime → Client WebSocket
     │                │                                      │
     ▼                ▼                                      ▼
 [Create Task]  [Insert Notification]              [Update UI Badge]
                      │                                      │
                      ▼                                      ▼
                [Edge Function]                    [Show Notification]
                      │
                      ▼
                [Email Queue]
```

## Notification Types and Triggers

### 1. System Notifications
- **Trigger**: System events, maintenance, updates
- **Priority**: Critical
- **Channels**: In-app (mandatory), Email (mandatory)

### 2. Organization/Project Notifications
- **Trigger**: User added to organization/project
- **Priority**: High
- **Channels**: In-app, Email, Push

### 3. Task Notifications
- **Triggers**:
  - Task assigned to user
  - Task status changed
  - Task details updated
  - New comment on task
- **Priority**: Medium to High
- **Channels**: In-app, Email, Push

### 4. Approval Notifications
- **Triggers**:
  - Approval requested
  - Approval status changed (approved/rejected)
  - Approval reminder
- **Priority**: High
- **Channels**: In-app, Email, Push

### 5. Entity Assignment Notifications
- **Triggers**:
  - Assigned to any entity (project, task, document, etc.)
  - Removed from entity
- **Priority**: Medium
- **Channels**: In-app, Email

## Implementation Components

### 1. Notification Service (NextJS API)

```typescript
interface NotificationService {
  // Core methods
  createNotification(params: CreateNotificationParams): Promise<Notification>
  markAsRead(notificationId: string, userId: string): Promise<void>
  markAllAsRead(userId: string): Promise<void>
  getUnreadCount(userId: string): Promise<number>
  
  // Bulk operations
  createBulkNotifications(notifications: CreateNotificationParams[]): Promise<void>
  deleteOldNotifications(days: number): Promise<void>
}
```

### 2. Notification Generator

```typescript
interface NotificationGenerator {
  // Event handlers
  onUserAddedToOrganization(userId: string, orgId: string): Promise<void>
  onUserAddedToProject(userId: string, projectId: string): Promise<void>
  onTaskAssigned(taskId: string, assigneeId: string): Promise<void>
  onTaskUpdated(taskId: string, updatedFields: string[]): Promise<void>
  onTaskComment(taskId: string, commenterId: string): Promise<void>
  onApprovalRequested(approvalId: string, approverId: string): Promise<void>
  onApprovalStatusChanged(approvalId: string, status: string): Promise<void>
}
```

### 3. Delivery Channels

```
┌─────────────────────────────────────────────────────────┐
│                   Delivery Manager                       │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  In-App     │  │   Email     │  │    Push     │    │
│  │  Channel    │  │  Channel    │  │   Channel   │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                         │
│  - Channel Selection Logic                              │
│  - Retry Mechanism                                      │
│  - Delivery Tracking                                    │
└─────────────────────────────────────────────────────────┘
```

## Real-time Updates with Supabase

### 1. Database Triggers

```sql
-- Trigger for new notifications
CREATE OR REPLACE FUNCTION notify_new_notification()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'new_notification',
    json_build_object(
      'user_id', NEW.user_id,
      'notification_id', NEW.id,
      'type', NEW.type,
      'priority', NEW.priority
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_notification_created
AFTER INSERT ON notifications
FOR EACH ROW
EXECUTE FUNCTION notify_new_notification();
```

### 2. Client-side Subscription

```typescript
// Real-time subscription setup
const subscription = supabase
  .channel('notifications')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${userId}`
    },
    (payload) => {
      // Handle new notification
      handleNewNotification(payload.new)
    }
  )
  .subscribe()
```

## Notification UI Components

### 1. Notification Center

```
┌─────────────────────────────────────┐
│  🔔 Notifications (3)               │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │ 🔴 System Maintenance       │   │
│  │ Scheduled for tonight 10 PM │   │
│  │ 5 minutes ago               │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ 📋 New Task Assignment      │   │
│  │ "Fix electrical wiring"     │   │
│  │ 1 hour ago                  │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ ✅ Approval Request         │   │
│  │ Budget approval needed      │   │
│  │ 2 hours ago                 │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 2. Notification Badge System

```
┌─────────┐
│  🔔 3   │  <- Unread count badge
└─────────┘
```

## Performance Considerations

### 1. Database Indexing

```sql
-- Indexes for performance
CREATE INDEX idx_notifications_user_unread 
ON notifications(user_id, is_read) 
WHERE is_read = false;

CREATE INDEX idx_notifications_created 
ON notifications(created_at DESC);

CREATE INDEX idx_notifications_entity 
ON notifications(entity_type, entity_id);
```

### 2. Caching Strategy

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │     │    Redis    │     │  Database   │
│   Cache     │◀───▶│    Cache    │◀───▶│ (Supabase)  │
└─────────────┘     └─────────────┘     └─────────────┘
     │                     │                     │
     └─────────────────────┴─────────────────────┘
                    Notification Data Flow
```

### 3. Batch Processing

- Group notifications for the same user within a time window
- Batch email deliveries to reduce API calls
- Implement rate limiting for notification generation

## Security Considerations

### 1. Row Level Security (RLS)

```sql
-- Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

-- Only system can create notifications
CREATE POLICY "System creates notifications" ON notifications
FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);
```

### 2. Data Privacy

- Encrypt sensitive notification data
- Implement data retention policies
- Audit trail for notification access

## Scalability Design

### 1. Horizontal Scaling

```
                Load Balancer
                     │
        ┌────────────┼────────────┐
        │            │            │
   Instance 1   Instance 2   Instance 3
        │            │            │
        └────────────┼────────────┘
                     │
              Shared Database
```

### 2. Queue System for Heavy Loads

```
Producer → Message Queue → Workers → Delivery
   │           (SQS)         │          │
   │                         │          │
   └─────── Monitoring ──────┴──────────┘
```

## Monitoring and Analytics

### 1. Key Metrics to Track

- Notification delivery rate
- Read rate by notification type
- Average time to read
- Delivery channel effectiveness
- System notification engagement

### 2. Dashboard Components

```
┌─────────────────────────────────────────────────┐
│              Notification Analytics              │
├─────────────────────────────────────────────────┤
│  Delivery Rate: 98.5%    Read Rate: 72%        │
│                                                 │
│  [Delivery Chart]        [Engagement Chart]    │
│  ████████████████        ████████░░░░░░░░      │
│                                                 │
│  Top Notification Types:                        │
│  1. Task Updates (45%)                          │
│  2. Approvals (30%)                             │
│  3. Comments (25%)                              │
└─────────────────────────────────────────────────┘
```

## Error Handling and Recovery

### 1. Retry Mechanism

```typescript
interface RetryConfig {
  maxRetries: 3
  backoffMultiplier: 2
  initialDelay: 1000 // ms
  maxDelay: 30000 // ms
}
```

### 2. Fallback Strategies

- If push fails → Send email
- If email fails → Log for manual review
- If real-time fails → Poll for updates

## Future Enhancements

1. **Smart Notifications**
   - AI-powered notification bundling
   - Predictive notification scheduling
   - Context-aware delivery timing

2. **Advanced Preferences**
   - Notification schedules (quiet hours)
   - Channel preferences by notification type
   - Notification grouping rules

3. **Integration Capabilities**
   - Slack/Teams integration
   - SMS notifications for critical alerts
   - Webhook support for custom integrations

## Summary

This notification system architecture provides:

1. **Reliability**: Multiple delivery channels with fallback mechanisms
2. **Scalability**: Designed to handle growth with horizontal scaling
3. **Performance**: Optimized with caching and indexing strategies
4. **Real-time**: Leverages Supabase's real-time capabilities
5. **Flexibility**: Extensible design for future enhancements
6. **Security**: RLS policies and data privacy considerations

The system ensures all users receive mandatory system notifications while providing a rich notification experience for project collaboration and task management in the construction industry.