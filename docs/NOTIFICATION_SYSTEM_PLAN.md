# Notification System Implementation Plan

## Overview

Create a comprehensive notification system that allows users to receive system-wide notifications that transcend organization and project boundaries. This system will handle various types of notifications including approvals, invitations, task assignments, and system announcements.

## System Architecture

### 1. Database Schema Design

#### Core Tables

- **notifications** - Main notification storage
- **notification_types** - Predefined notification categories
- **notification_preferences** - User notification settings
- **notification_reads** - Track read status per user

#### Schema Details

```sql
-- Notification types for categorization
CREATE TYPE notification_type AS ENUM (
  'system_announcement',
  'approval_request',
  'approval_status_update',
  'task_assignment',
  'task_status_update',
  'organization_invitation',
  'project_invitation',
  'form_submission',
  'site_diary_submission',
  'comment_mention',
  'due_date_reminder'
);

-- Priority levels
CREATE TYPE notification_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- Main notifications table
CREATE TABLE notifications (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  priority notification_priority DEFAULT 'medium',

  -- Recipients (system-wide, can target specific users)
  recipient_user_ids UUID[] DEFAULT '{}', -- Empty array means all users

  -- Optional context references
  entity_type TEXT, -- 'task', 'approval', 'organization', etc.
  entity_id BIGINT,

  -- Metadata for rich notifications
  metadata JSONB DEFAULT '{}',
  action_url TEXT, -- Deep link to relevant page

  -- Lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ, -- NULL means never expires
  is_active BOOLEAN DEFAULT TRUE,

  -- System tracking
  created_by UUID REFERENCES auth.users(id),

  -- Indexes
  CONSTRAINT notifications_check_recipients CHECK (
    array_length(recipient_user_ids, 1) IS NULL OR
    array_length(recipient_user_ids, 1) > 0
  )
);

-- Track read status per user
CREATE TABLE notification_reads (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  notification_id BIGINT REFERENCES notifications(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  -- Prevent duplicate reads
  UNIQUE(notification_id, user_id)
);

-- User notification preferences
CREATE TABLE notification_preferences (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Global preferences
  notifications_enabled BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN DEFAULT TRUE,
  push_notifications BOOLEAN DEFAULT TRUE,

  -- Per-type preferences (JSONB for flexibility)
  type_preferences JSONB DEFAULT '{}',

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT FALSE,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  timezone TEXT DEFAULT 'UTC',

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
```

### 2. API Layer

#### NotificationAPI Class

- `getNotifications(userId, limit, offset)` - Get user notifications with pagination
- `getUnreadCount(userId)` - Get count of unread notifications
- `markAsRead(notificationId, userId)` - Mark single notification as read
- `markAllAsRead(userId)` - Mark all notifications as read
- `createNotification(data)` - Create new notification (admin/system only)
- `updatePreferences(userId, preferences)` - Update user notification preferences
- `getPreferences(userId)` - Get user notification preferences

### 3. Real-time Updates

#### Supabase Realtime Integration

- Subscribe to notification changes for current user
- Live updates for unread count
- Real-time notification delivery

### 4. Frontend Components

#### Core Components

- **NotificationDropdown** - Main notification center in TopBar
- **NotificationItem** - Individual notification display
- **NotificationPreferences** - Settings management
- **NotificationBadge** - Unread count indicator

#### Component Structure

```
components/notifications/
├── NotificationDropdown.tsx      # Main dropdown in TopBar
├── NotificationItem.tsx          # Individual notification
├── NotificationList.tsx          # List of notifications
├── NotificationBadge.tsx         # Unread count badge
├── NotificationPreferences.tsx   # Settings panel
├── NotificationEmpty.tsx         # Empty state
└── types.ts                      # TypeScript definitions
```

### 5. Context and State Management

#### NotificationContext

- Global notification state
- Unread count management
- Real-time subscription handling
- Preference management

### 6. Integration Points

#### Automatic Notification Triggers

- **Approvals**: When approval is requested, approved, or declined
- **Tasks**: When assigned, status changed, or due date approaching
- **Invitations**: When invited to organization or project
- **Forms**: When form submission requires attention
- **System**: Maintenance announcements, feature updates

## Implementation Phases

### Phase 1: Core Infrastructure

1. Database schema and migrations
2. Basic API layer
3. Type definitions
4. Database functions and RLS policies

### Phase 2: Frontend Foundation

1. NotificationContext and provider
2. Basic notification components
3. Integration with TopBar
4. Notification preferences page

### Phase 3: Real-time Features

1. Supabase realtime subscription
2. Live notification delivery
3. Unread count updates
4. Push notification foundation

### Phase 4: Integration & Automation

1. Integrate with existing features (approvals, tasks, etc.)
2. Automatic notification triggers
3. Email notification service
4. Advanced filtering and search

### Phase 5: Advanced Features

1. Notification templates
2. Batch operations
3. Analytics and insights
4. Mobile app notifications

## Technical Considerations

### Performance

- Use database indexes on user_id, created_at, is_active
- Implement pagination for notification lists
- Cache unread counts where possible
- Use Supabase RLS for security

### Security

- Row Level Security on all notification tables
- User can only see their own notifications
- Admin-only creation of system-wide notifications
- Validate notification recipients

### Scalability

- Consider notification archiving for old notifications
- Implement soft deletes for audit trails
- Use JSONB for flexible metadata storage
- Plan for notification templates and batching

## Success Metrics

- User engagement with notifications
- Reduction in missed important updates
- User satisfaction with notification relevance
- Performance metrics (load times, real-time delivery)

## Future Enhancements

- Mobile push notifications
- SMS notifications for critical alerts
- AI-powered notification prioritization
- Integration with external services (Slack, Teams)
- Advanced notification scheduling
- Notification analytics dashboard
