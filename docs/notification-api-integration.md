# Notification System API & Integration Guide

## API Endpoints Design

### REST API Endpoints

```typescript
// Base URL: /api/notifications

GET    /api/notifications                 // Get user's notifications
GET    /api/notifications/:id            // Get specific notification
POST   /api/notifications/mark-read/:id  // Mark notification as read
POST   /api/notifications/mark-all-read  // Mark all as read
GET    /api/notifications/unread-count   // Get unread count
GET    /api/notifications/preferences    // Get notification preferences
PUT    /api/notifications/preferences    // Update preferences
DELETE /api/notifications/:id            // Delete notification
```

### GraphQL Schema (Alternative)

```graphql
type Query {
  notifications(
    limit: Int = 20
    offset: Int = 0
    filter: NotificationFilter
  ): NotificationConnection!

  notification(id: ID!): Notification

  unreadNotificationCount: Int!

  notificationPreferences: [NotificationPreference!]!
}

type Mutation {
  markNotificationAsRead(id: ID!): Notification!
  markAllNotificationsAsRead: Boolean!
  updateNotificationPreferences(
    preferences: [NotificationPreferenceInput!]!
  ): [NotificationPreference!]!
  deleteNotification(id: ID!): Boolean!
}

type Subscription {
  notificationReceived(userId: ID!): Notification!
}
```

## Integration Points

### 1. Task Management Integration

```typescript
// Task Service Integration
interface TaskNotificationHooks {
  onTaskCreated: (task: Task) => Promise<void>;
  onTaskAssigned: (task: Task, assigneeId: string) => Promise<void>;
  onTaskUpdated: (task: Task, updatedFields: string[]) => Promise<void>;
  onTaskCommented: (task: Task, comment: Comment) => Promise<void>;
  onTaskStatusChanged: (task: Task, oldStatus: string, newStatus: string) => Promise<void>;
}

// Implementation Example
export const taskNotificationHooks: TaskNotificationHooks = {
  async onTaskAssigned(task: Task, assigneeId: string) {
    await notificationService.createNotification({
      userId: assigneeId,
      type: 'task_assigned',
      title: 'New Task Assignment',
      message: `You've been assigned to: ${task.title}`,
      data: {
        taskId: task.id,
        projectId: task.projectId,
        assignedBy: task.updatedBy,
      },
      entityType: 'task',
      entityId: task.id,
      priority: task.priority === 'urgent' ? 'high' : 'medium',
    });
  },
};
```

### 2. Organization/Project Integration

```typescript
// Organization Service Integration
interface OrgNotificationHooks {
  onUserAddedToOrganization: (userId: string, orgId: string, addedBy: string) => Promise<void>;
  onUserRemovedFromOrganization: (userId: string, orgId: string) => Promise<void>;
  onOrganizationRoleChanged: (userId: string, orgId: string, newRole: string) => Promise<void>;
}

// Project Service Integration
interface ProjectNotificationHooks {
  onUserAddedToProject: (userId: string, projectId: string, role: string) => Promise<void>;
  onProjectMilestoneReached: (projectId: string, milestone: Milestone) => Promise<void>;
  onProjectDeadlineApproaching: (project: Project, daysUntilDeadline: number) => Promise<void>;
}
```

### 3. Approval System Integration

```typescript
// Approval Service Integration
interface ApprovalNotificationHooks {
  onApprovalRequested: (approval: Approval) => Promise<void>;
  onApprovalStatusChanged: (approval: Approval, newStatus: string) => Promise<void>;
  onApprovalReminder: (approval: Approval) => Promise<void>;
}

// Implementation
export const approvalNotificationHooks: ApprovalNotificationHooks = {
  async onApprovalRequested(approval: Approval) {
    // Notify all approvers
    const notifications = approval.approvers.map((approverId) => ({
      userId: approverId,
      type: 'approval_requested' as const,
      title: 'Approval Required',
      message: `${approval.requestorName} requested approval for: ${approval.title}`,
      data: {
        approvalId: approval.id,
        requestorId: approval.requestorId,
        dueDate: approval.dueDate,
      },
      entityType: 'approval',
      entityId: approval.id,
      priority: 'high' as const,
    }));

    await notificationService.createBulkNotifications(notifications);
  },
};
```

## WebSocket Integration for Real-time Updates

```typescript
// Client-side WebSocket Connection
class NotificationWebSocket {
  private socket: WebSocket;
  private reconnectAttempts = 0;

  constructor(private userId: string) {
    this.connect();
  }

  private connect() {
    this.socket = new WebSocket(`wss://api.example.com/ws/notifications/${this.userId}`);

    this.socket.onmessage = (event) => {
      const notification = JSON.parse(event.data);
      this.handleNotification(notification);
    };

    this.socket.onclose = () => {
      this.handleReconnect();
    };
  }

  private handleNotification(notification: Notification) {
    // Update UI
    updateNotificationBadge();
    showNotificationToast(notification);

    // Update local state
    notificationStore.addNotification(notification);
  }

  private handleReconnect() {
    if (this.reconnectAttempts < 5) {
      setTimeout(
        () => {
          this.reconnectAttempts++;
          this.connect();
        },
        Math.pow(2, this.reconnectAttempts) * 1000,
      );
    }
  }
}
```

## Supabase Edge Functions

### 1. Email Notification Function

```typescript
// supabase/functions/send-email-notification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { notificationId } = await req.json();

  // Fetch notification details
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: notification } = await supabase
    .from('notifications')
    .select('*, users!user_id(*)')
    .eq('id', notificationId)
    .single();

  // Send email using your preferred service
  const emailResponse = await sendEmail({
    to: notification.users.email,
    subject: notification.title,
    html: generateEmailTemplate(notification),
    category: notification.type,
  });

  // Update delivery status
  await supabase.from('notification_deliveries').insert({
    notification_id: notificationId,
    channel: 'email',
    status: emailResponse.success ? 'delivered' : 'failed',
    delivered_at: new Date().toISOString(),
    error_message: emailResponse.error,
  });

  return new Response(JSON.stringify({ success: true }));
});
```

### 2. Push Notification Function

```typescript
// supabase/functions/send-push-notification/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

serve(async (req) => {
  const { notificationId, deviceTokens } = await req.json();

  // Send to FCM/APNS
  const results = await Promise.allSettled(
    deviceTokens.map((token) => sendPushNotification(token, notification)),
  );

  // Process results and update delivery status
  const deliveries = results.map((result, index) => ({
    notification_id: notificationId,
    channel: 'push',
    status: result.status === 'fulfilled' ? 'delivered' : 'failed',
    device_token: deviceTokens[index],
    error_message: result.status === 'rejected' ? result.reason : null,
  }));

  await supabase.from('notification_deliveries').insert(deliveries);

  return new Response(
    JSON.stringify({
      success: true,
      delivered: results.filter((r) => r.status === 'fulfilled').length,
    }),
  );
});
```

## Database Triggers

### 1. Auto-notification on Task Assignment

```sql
CREATE OR REPLACE FUNCTION notify_task_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if assignee changed
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id AND NEW.assignee_id IS NOT NULL THEN
    -- Create notification
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      data,
      entity_type,
      entity_id,
      priority,
      created_by
    ) VALUES (
      NEW.assignee_id,
      'task_assigned',
      'New Task Assignment',
      'You have been assigned to task: ' || NEW.title,
      jsonb_build_object(
        'task_id', NEW.id,
        'project_id', NEW.project_id,
        'assigned_by', NEW.updated_by
      ),
      'task',
      NEW.id,
      CASE WHEN NEW.priority = 'urgent' THEN 'high' ELSE 'medium' END,
      NEW.updated_by
    );

    -- Trigger email function
    PERFORM net.http_post(
      url := 'https://your-project.supabase.co/functions/v1/send-email-notification',
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_key')),
      body := jsonb_build_object('notification_id', lastval())
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_task_assignment
AFTER UPDATE ON tasks
FOR EACH ROW
EXECUTE FUNCTION notify_task_assignment();
```

### 2. Notification Cleanup Job

```sql
-- Function to archive old notifications
CREATE OR REPLACE FUNCTION archive_old_notifications()
RETURNS void AS $$
BEGIN
  -- Move notifications older than 30 days to archive
  INSERT INTO notifications_archive
  SELECT * FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND is_read = true;

  -- Delete archived notifications from main table
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
  AND is_read = true;

  -- Delete unread notifications older than 90 days
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule as a cron job
SELECT cron.schedule(
  'archive-notifications',
  '0 2 * * *', -- Run at 2 AM daily
  'SELECT archive_old_notifications()'
);
```

## React Hook for Notifications

```typescript
// hooks/useNotifications.ts
import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useNotifications(userId: string) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Fetch initial notifications
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
          setUnreadCount((prev) => prev + 1);

          // Show browser notification if permitted
          if (Notification.permission === 'granted') {
            new Notification(payload.new.title, {
              body: payload.new.message,
              icon: '/notification-icon.png',
            });
          }
        },
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [userId]);

  const fetchNotifications = async () => {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (!error && data) {
      setNotifications(data);
    }
    setIsLoading(false);
  };

  const fetchUnreadCount = async () => {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    setUnreadCount(count || 0);
  };

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(async () => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    setUnreadCount(0);
  }, [userId]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
```

## Testing Strategy

### 1. Unit Tests

```typescript
// __tests__/notificationService.test.ts
describe('NotificationService', () => {
  it('should create notification with correct priority', async () => {
    const notification = await notificationService.createNotification({
      userId: 'user123',
      type: 'task_assigned',
      title: 'Test Task',
      message: 'Test message',
      priority: 'high',
    });

    expect(notification.priority).toBe('high');
    expect(notification.type).toBe('task_assigned');
  });

  it('should handle bulk notifications efficiently', async () => {
    const notifications = Array(100)
      .fill(null)
      .map((_, i) => ({
        userId: `user${i}`,
        type: 'system' as const,
        title: 'System Update',
        message: 'Test bulk notification',
      }));

    const start = Date.now();
    await notificationService.createBulkNotifications(notifications);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(1000); // Should complete in under 1 second
  });
});
```

### 2. Integration Tests

```typescript
// __tests__/notificationIntegration.test.ts
describe('Notification Integration', () => {
  it('should trigger notification on task assignment', async () => {
    const task = await createTask({
      title: 'Test Task',
      assignee_id: 'user123',
    });

    // Wait for async notification
    await waitFor(() => {
      const notification = getLatestNotification('user123');
      expect(notification.entity_id).toBe(task.id);
      expect(notification.type).toBe('task_assigned');
    });
  });
});
```

## Monitoring Dashboard

```typescript
// pages/admin/notifications-dashboard.tsx
export function NotificationsDashboard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Delivery Rate"
        value="98.5%"
        trend="+2.3%"
        icon={<CheckCircle />}
      />
      <MetricCard
        title="Avg. Read Time"
        value="3.2 min"
        trend="-0.5 min"
        icon={<Clock />}
      />
      <MetricCard
        title="Failed Deliveries"
        value="142"
        trend="-15%"
        icon={<AlertTriangle />}
      />
      <MetricCard
        title="Active Users"
        value="1,234"
        trend="+8%"
        icon={<Users />}
      />

      <div className="col-span-full">
        <NotificationTypeChart />
        <DeliveryChannelBreakdown />
        <RecentFailures />
      </div>
    </div>
  );
}
```

## Summary

This integration guide provides:

1. **Clear API Design**: RESTful and GraphQL options
2. **Service Integration**: Hooks for all major features
3. **Real-time Support**: WebSocket and Supabase subscriptions
4. **Edge Functions**: Serverless notification delivery
5. **Database Automation**: Triggers for automatic notifications
6. **Frontend Integration**: React hooks and components
7. **Testing Strategy**: Comprehensive test coverage
8. **Monitoring Tools**: Dashboard for tracking performance

The system is designed to be modular, scalable, and easy to integrate with existing services.
