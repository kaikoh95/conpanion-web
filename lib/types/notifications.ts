// Notification system types

export type NotificationType =
  | 'system'
  | 'organization_added'
  | 'project_added'
  | 'task_assigned'
  | 'task_updated'
  | 'task_comment'
  | 'comment_mention'
  | 'task_unassigned'
  | 'approval_requested'
  | 'approval_status_changed'
  | 'entity_assigned';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export type DeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retry';

export type EmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  data: Record<string, any>;
  entity_type?: string;
  entity_id?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
}

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  channel: 'realtime' | 'email' | 'push' | 'sms' | 'webhook';
  status: DeliveryStatus;
  delivered_at?: string;
  retry_count: number;
  error_message?: string;
  metadata: Record<string, any>;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  type: NotificationType;
  email_enabled: boolean;
  push_enabled: boolean;
  in_app_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  platform: 'ios' | 'android' | 'web';
  token: string;
  device_name?: string;
  push_enabled: boolean;
  last_used: string;
  created_at: string;
  updated_at: string;
}

// Helper type for notification creation
export interface CreateNotificationParams {
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  entity_type?: string;
  entity_id?: string;
  priority?: NotificationPriority;
  created_by?: string;
}

// Notification icon map
export const notificationIcons: Record<NotificationType, string> = {
  system: '🔔',
  organization_added: '🏢',
  project_added: '📁',
  task_assigned: '📋',
  task_updated: '🔄',
  task_comment: '💬',
  comment_mention: '@',
  task_unassigned: '📤',
  approval_requested: '✅',
  approval_status_changed: '📝',
  entity_assigned: '👤',
};

// Priority colors
export const priorityColors: Record<NotificationPriority, string> = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};