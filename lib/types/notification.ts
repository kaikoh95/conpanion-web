import { Database } from '@/lib/supabase/types.generated';

// Database types from generated schema
export type NotificationType = Database['public']['Enums']['notification_type'];
export type NotificationPriority = Database['public']['Enums']['notification_priority'];

// Base notification from database
export type Notification = Database['public']['Tables']['notifications']['Row'];
export type NotificationRead = Database['public']['Tables']['notification_reads']['Row'];
export type NotificationPreferences =
  Database['public']['Tables']['notification_preferences']['Row'];

// Enhanced notification with read status (from get_user_notifications function)
export interface NotificationWithReadStatus {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  entity_type: string | null;
  entity_id: number | null;
  metadata: Record<string, any>;
  action_url: string | null;
  created_at: string;
  expires_at: string | null;
  is_read: boolean;
  read_at: string | null;
}

// Request types for API calls
export interface CreateNotificationRequest {
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  recipient_user_ids?: string[]; // Empty array means all users
  entity_type?: string;
  entity_id?: number;
  metadata?: Record<string, any>;
  action_url?: string;
  expires_at?: string;
}

export interface UpdateNotificationPreferencesRequest {
  notifications_enabled?: boolean;
  email_notifications?: boolean;
  push_notifications?: boolean;
  type_preferences?: Record<string, any>;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  timezone?: string;
}

// API response types
export interface NotificationListResponse {
  notifications: NotificationWithReadStatus[];
  total_count: number;
  unread_count: number;
  has_more: boolean;
}

export interface NotificationStatsResponse {
  total_count: number;
  unread_count: number;
  by_type: Record<NotificationType, number>;
  by_priority: Record<NotificationPriority, number>;
}

// Notification context types
export interface NotificationContextType {
  notifications: NotificationWithReadStatus[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  preferences: NotificationPreferences | null;

  // Actions
  loadNotifications: (limit?: number, offset?: number) => Promise<void>;
  markAsRead: (notificationId: number) => Promise<void>;
  markAllAsRead: () => Promise<number>;
  refreshUnreadCount: () => Promise<void>;
  updatePreferences: (preferences: UpdateNotificationPreferencesRequest) => Promise<void>;
  refresh: () => Promise<void>;
}

// Real-time subscription types
export interface NotificationSubscriptionPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Notification | null;
  old: Notification | null;
}

// Notification template types for consistent styling
export interface NotificationTemplate {
  type: NotificationType;
  icon: string;
  color: string;
  description: string;
}

// Predefined notification templates
export const NOTIFICATION_TEMPLATES: Record<NotificationType, NotificationTemplate> = {
  system_announcement: {
    type: 'system_announcement',
    icon: 'megaphone',
    color: 'blue',
    description: 'System announcements and updates',
  },
  approval_request: {
    type: 'approval_request',
    icon: 'user-check',
    color: 'orange',
    description: 'New approval requests',
  },
  approval_status_update: {
    type: 'approval_status_update',
    icon: 'check-circle',
    color: 'green',
    description: 'Approval status changes',
  },
  task_assignment: {
    type: 'task_assignment',
    icon: 'user-plus',
    color: 'purple',
    description: 'Task assignments',
  },
  task_status_update: {
    type: 'task_status_update',
    icon: 'activity',
    color: 'indigo',
    description: 'Task status updates',
  },
  organization_invitation: {
    type: 'organization_invitation',
    icon: 'building',
    color: 'teal',
    description: 'Organization invitations',
  },
  project_invitation: {
    type: 'project_invitation',
    icon: 'folder-plus',
    color: 'cyan',
    description: 'Project invitations',
  },
  form_submission: {
    type: 'form_submission',
    icon: 'file-text',
    color: 'yellow',
    description: 'Form submissions',
  },
  site_diary_submission: {
    type: 'site_diary_submission',
    icon: 'book',
    color: 'emerald',
    description: 'Site diary submissions',
  },
  comment_mention: {
    type: 'comment_mention',
    icon: 'at-sign',
    color: 'pink',
    description: 'Comment mentions',
  },
  due_date_reminder: {
    type: 'due_date_reminder',
    icon: 'clock',
    color: 'red',
    description: 'Due date reminders',
  },
};

// Priority styling
export const PRIORITY_STYLES: Record<NotificationPriority, { color: string; bgColor: string }> = {
  low: { color: 'text-gray-600', bgColor: 'bg-gray-100' },
  medium: { color: 'text-blue-600', bgColor: 'bg-blue-100' },
  high: { color: 'text-orange-600', bgColor: 'bg-orange-100' },
  urgent: { color: 'text-red-600', bgColor: 'bg-red-100' },
};

// Helper functions
export function getNotificationTemplate(type: NotificationType): NotificationTemplate {
  return NOTIFICATION_TEMPLATES[type];
}

export function getPriorityStyle(priority: NotificationPriority) {
  return PRIORITY_STYLES[priority];
}

export function isNotificationExpired(notification: NotificationWithReadStatus): boolean {
  if (!notification.expires_at) return false;
  return new Date(notification.expires_at) < new Date();
}

export function formatNotificationTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

// Notification grouping helpers
export function groupNotificationsByDate(notifications: NotificationWithReadStatus[]) {
  const groups: Record<string, NotificationWithReadStatus[]> = {};

  notifications.forEach((notification) => {
    const date = new Date(notification.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let groupKey: string;
    if (date.toDateString() === today.toDateString()) {
      groupKey = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      groupKey = 'Yesterday';
    } else {
      groupKey = date.toLocaleDateString();
    }

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }
    groups[groupKey].push(notification);
  });

  return groups;
}

export function groupNotificationsByType(notifications: NotificationWithReadStatus[]) {
  const groups: Record<NotificationType, NotificationWithReadStatus[]> = {} as Record<
    NotificationType,
    NotificationWithReadStatus[]
  >;

  notifications.forEach((notification) => {
    if (!groups[notification.type]) {
      groups[notification.type] = [];
    }
    groups[notification.type].push(notification);
  });

  return groups;
}
