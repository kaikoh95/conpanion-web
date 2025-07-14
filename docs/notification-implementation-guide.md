# Notification System Implementation Guide

## Getting Started

This guide provides step-by-step instructions for implementing the notification system in your construction project management application.

## Prerequisites

- Supabase project with PostgreSQL database
- NextJS application with Supabase client configured
- Email service account (Resend, SendGrid, etc.)
- Firebase project for push notifications (optional)

## Database Setup

### Step 1: Create Enums and Types

```sql
-- Run this migration first to create necessary types
-- supabase/migrations/001_notification_types.sql

-- Notification types
CREATE TYPE notification_type AS ENUM (
  'system',
  'organization_added',
  'project_added',
  'task_assigned',
  'task_updated',
  'task_comment',
  'comment_mention',
  'task_unassigned',
  'approval_requested',
  'approval_status_changed',
  'entity_assigned'
);

-- Priority levels
CREATE TYPE notification_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

-- Delivery status
CREATE TYPE delivery_status AS ENUM (
  'pending',
  'delivered',
  'failed',
  'retry'
);

-- Email queue status
CREATE TYPE email_status AS ENUM (
  'pending',
  'sending',
  'sent',
  'failed',
  'cancelled'
);
```

### Step 2: Create Core Tables

```sql
-- supabase/migrations/002_notification_tables.sql

-- Main notifications table
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  priority notification_priority DEFAULT 'medium',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  entity_type TEXT,
  entity_id UUID,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery tracking
CREATE TABLE notification_deliveries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status delivery_status NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User preferences
CREATE TABLE notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  email_enabled BOOLEAN DEFAULT true,
  push_enabled BOOLEAN DEFAULT true,
  in_app_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- Email queue
CREATE TABLE email_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_data JSONB DEFAULT '{}',
  priority notification_priority DEFAULT 'medium',
  status email_status DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Push queue
CREATE TABLE push_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  payload JSONB NOT NULL,
  priority notification_priority DEFAULT 'medium',
  status delivery_status DEFAULT 'pending',
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User devices for push notifications
CREATE TABLE user_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  device_name TEXT,
  push_enabled BOOLEAN DEFAULT true,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);
```

### Step 3: Create Indexes

```sql
-- supabase/migrations/003_notification_indexes.sql

-- Performance indexes
CREATE INDEX idx_notifications_user_unread
ON notifications(user_id, is_read)
WHERE is_read = false;

CREATE INDEX idx_notifications_created
ON notifications(created_at DESC);

CREATE INDEX idx_notifications_entity
ON notifications(entity_type, entity_id);

CREATE INDEX idx_notification_deliveries_notification
ON notification_deliveries(notification_id);

CREATE INDEX idx_email_queue_status_scheduled
ON email_queue(status, scheduled_for)
WHERE status = 'pending';

CREATE INDEX idx_push_queue_status
ON push_queue(status, scheduled_for)
WHERE status = 'pending';

CREATE INDEX idx_user_devices_user
ON user_devices(user_id)
WHERE push_enabled = true;
```

### Step 4: Enable Row Level Security

```sql
-- supabase/migrations/004_notification_rls.sql

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Notification policies
CREATE POLICY "Users can view own notifications" ON notifications
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON notifications
FOR INSERT WITH CHECK (true); -- Restricted via functions

-- Delivery policies
CREATE POLICY "Users can view own delivery status" ON notification_deliveries
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM notifications
    WHERE notifications.id = notification_deliveries.notification_id
    AND notifications.user_id = auth.uid()
  )
);

-- Preferences policies
CREATE POLICY "Users can view own preferences" ON notification_preferences
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own preferences" ON notification_preferences
FOR ALL USING (auth.uid() = user_id);

-- Device policies
CREATE POLICY "Users can manage own devices" ON user_devices
FOR ALL USING (auth.uid() = user_id);
```

### Step 5: Create Core Functions

```sql
-- supabase/migrations/005_notification_functions.sql

-- Master notification creation function
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_data JSONB DEFAULT '{}',
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_priority notification_priority DEFAULT 'medium',
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_notification_id UUID;
  v_user_preferences RECORD;
BEGIN
  -- Insert the notification
  INSERT INTO notifications (
    user_id, type, title, message, data,
    entity_type, entity_id, priority, created_by
  ) VALUES (
    p_user_id, p_type, p_title, p_message, p_data,
    p_entity_type, p_entity_id, p_priority, COALESCE(p_created_by, auth.uid())
  ) RETURNING id INTO v_notification_id;

  -- Check user preferences
  SELECT * INTO v_user_preferences
  FROM notification_preferences
  WHERE user_id = p_user_id AND type = p_type;

  -- Queue email if enabled or system notification
  IF p_type = 'system' OR COALESCE(v_user_preferences.email_enabled, true) THEN
    PERFORM queue_email_notification(v_notification_id);
  END IF;

  -- Queue push if enabled
  IF COALESCE(v_user_preferences.push_enabled, true) THEN
    PERFORM queue_push_notification(v_notification_id);
  END IF;

  RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;
```

### Step 6: Create Triggers

```sql
-- supabase/migrations/006_notification_triggers.sql

-- Include all trigger functions from the deep dive document
-- (notify_task_changes, notify_task_comment, etc.)

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
```

## Supabase Configuration

### Step 1: Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Email service
RESEND_API_KEY=your-resend-key

# Push notifications
FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
```

### Step 2: Edge Function Secrets

```bash
# Set secrets for edge functions
supabase secrets set RESEND_API_KEY=your-resend-key
supabase secrets set FIREBASE_SERVICE_ACCOUNT='{"type":"service_account",...}'
```

### Step 3: Deploy Edge Functions

```bash
# Deploy email notification function
supabase functions deploy send-email-notification

# Deploy push notification function
supabase functions deploy send-push-notification
```

## Frontend Implementation

### Step 1: Notification Provider

```typescript
// providers/NotificationProvider.tsx
import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useUser } from '@/hooks/useUser';

const NotificationContext = createContext({});

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useUser();
  const supabase = createClient();

  useEffect(() => {
    if (!user) return;

    // Initial load
    loadNotifications();
    loadUnreadCount();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`user-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          handleNewNotification(payload.new);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  const loadNotifications = async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    setNotifications(data || []);
  };

  const loadUnreadCount = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  const handleNewNotification = (notification) => {
    // Add to list
    setNotifications(prev => [notification, ...prev]);
    setUnreadCount(prev => prev + 1);

    // Show toast
    showNotificationToast(notification);

    // Request browser notification permission if needed
    if (Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icon-192x192.png'
      });
    }
  };

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      markAsRead,
      markAllAsRead
    }}>
      {children}
    </NotificationContext.Provider>
  );
}
```

### Step 2: Notification Components

```typescript
// components/NotificationBell.tsx
export function NotificationBell() {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:text-gray-900"
      >
        <Bell className="h-6 w-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-500 rounded-full">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && <NotificationDropdown />}
    </div>
  );
}
```

### Step 3: Push Notification Setup

```typescript
// utils/pushNotifications.ts
export async function registerDevice(userId: string) {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    try {
      // Register service worker
      const registration = await navigator.serviceWorker.register('/sw.js');

      // Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      // Get subscription
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      // Save to database
      await supabase.from('user_devices').upsert({
        user_id: userId,
        platform: 'web',
        token: JSON.stringify(subscription),
        device_name: navigator.userAgent,
      });
    } catch (error) {
      console.error('Failed to register device:', error);
    }
  }
}
```

## Email Templates

### Create Email Templates

```typescript
// supabase/functions/email-templates/task-assigned.html
<h2>Hi {{user_name}},</h2>
<p>You've been assigned a new task:</p>
<div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
  <h3>{{notification_data.task_title}}</h3>
  <p><strong>Project:</strong> {{notification_data.project_name}}</p>
  <p><strong>Assigned by:</strong> {{notification_data.assigner_name}}</p>
  <p><strong>Due date:</strong> {{notification_data.due_date}}</p>
</div>
<p>
  <a href="{{action_url}}" class="button">View Task</a>
</p>
```

## Testing

### Unit Tests

```typescript
// __tests__/notifications.test.ts
import { createTestClient } from '@/utils/test/client';

describe('Notification System', () => {
  it('creates notification on task assignment', async () => {
    const client = createTestClient();

    // Create a task and assign it
    const { data: task } = await client
      .from('tasks')
      .insert({
        title: 'Test Task',
        project_id: 'test-project',
        assignee_id: 'test-user',
      })
      .select()
      .single();

    // Check notification was created
    const { data: notifications } = await client
      .from('notifications')
      .select('*')
      .eq('entity_id', task.id)
      .eq('type', 'task_assigned');

    expect(notifications).toHaveLength(1);
    expect(notifications[0].user_id).toBe('test-user');
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/notification-flow.test.ts
describe('Notification Flow', () => {
  it('delivers notification through all channels', async () => {
    // Create notification
    const notificationId = await createNotification({
      user_id: testUser.id,
      type: 'task_assigned',
      title: 'Test Notification',
      message: 'Test message',
    });

    // Wait for delivery
    await waitFor(async () => {
      const { data: deliveries } = await supabase
        .from('notification_deliveries')
        .select('*')
        .eq('notification_id', notificationId);

      expect(deliveries).toHaveLength(3); // realtime, email, push
      expect(deliveries.every((d) => d.status === 'delivered')).toBe(true);
    });
  });
});
```

## Monitoring

### Setup Monitoring Dashboard

```sql
-- Create materialized view for stats
CREATE MATERIALIZED VIEW notification_stats AS
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  type,
  priority,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (read_at - created_at))) as avg_read_time_seconds,
  COUNT(*) FILTER (WHERE is_read) as read_count
FROM notifications
GROUP BY 1, 2, 3;

-- Refresh every hour
CREATE OR REPLACE FUNCTION refresh_notification_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY notification_stats;
END;
$$ LANGUAGE plpgsql;

-- Schedule refresh
SELECT cron.schedule(
  'refresh-notification-stats',
  '0 * * * *',
  'SELECT refresh_notification_stats()'
);
```

## Best Practices

### 1. Notification Content

```typescript
// ❌ Bad: Generic messages
{
  title: "Update",
  message: "Something changed"
}

// ✅ Good: Specific, actionable messages
{
  title: "New Task Assignment",
  message: "Sarah assigned you to: Fix electrical wiring in Building A",
  data: {
    task_id: "123",
    action_url: "/tasks/123"
  }
}
```

### 2. Priority Guidelines

- **Critical**: System outages, urgent approvals, security alerts
- **High**: Task assignments, approval requests, mentions
- **Medium**: Task updates, comments, general updates
- **Low**: FYI notifications, system tips

### 3. Rate Limiting

```typescript
// Implement rate limiting for notification creation
const rateLimiter = new Map();

function canCreateNotification(userId: string, type: string): boolean {
  const key = `${userId}:${type}`;
  const now = Date.now();
  const limit = getLimit(type); // e.g., 10 per minute

  const timestamps = rateLimiter.get(key) || [];
  const recentTimestamps = timestamps.filter((t) => now - t < 60000);

  if (recentTimestamps.length >= limit) {
    return false;
  }

  recentTimestamps.push(now);
  rateLimiter.set(key, recentTimestamps);
  return true;
}
```

### 4. Cleanup Strategy

```sql
-- Archive old notifications
CREATE OR REPLACE FUNCTION archive_notifications()
RETURNS void AS $$
BEGIN
  -- Move read notifications older than 30 days
  INSERT INTO notifications_archive
  SELECT * FROM notifications
  WHERE is_read = true
  AND created_at < NOW() - INTERVAL '30 days';

  -- Delete from main table
  DELETE FROM notifications
  WHERE is_read = true
  AND created_at < NOW() - INTERVAL '30 days';

  -- Delete unread older than 90 days
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
```

## Troubleshooting

### Common Issues

1. **Notifications not appearing in real-time**

   - Check WebSocket connection
   - Verify realtime is enabled on table
   - Check RLS policies

2. **Emails not sending**

   - Verify API keys are set
   - Check email queue status
   - Review edge function logs

3. **Push notifications failing**
   - Verify device tokens are valid
   - Check Firebase configuration
   - Review platform-specific requirements

### Debug Queries

```sql
-- Check notification creation
SELECT * FROM notifications
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check delivery status
SELECT
  n.type,
  nd.channel,
  nd.status,
  COUNT(*) as count
FROM notifications n
JOIN notification_deliveries nd ON n.id = nd.notification_id
WHERE n.created_at > NOW() - INTERVAL '1 day'
GROUP BY 1, 2, 3;

-- Check failed deliveries
SELECT * FROM notification_deliveries
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 day';
```

## Migration Checklist

- [ ] Create database migrations
- [ ] Deploy edge functions
- [ ] Set environment variables
- [ ] Implement frontend components
- [ ] Set up monitoring
- [ ] Test all notification types
- [ ] Configure rate limits
- [ ] Set up cleanup jobs
- [ ] Document for team

## Summary

This implementation guide provides everything needed to deploy a production-ready notification system. The key is to start with core functionality (in-app notifications) and gradually add channels (email, push) as needed. Monitor performance closely and adjust based on usage patterns.
