// Notification system types and constants

export type NotificationType =
  | 'system'
  | 'organization_added'
  | 'project_added'
  | 'task_assigned'
  | 'task_updated'
  | 'task_comment'
  | 'comment_mention'
  | 'task_unassigned'
  | 'form_assigned'
  | 'form_unassigned'
  | 'approval_requested'
  | 'approval_status_changed'
  | 'entity_assigned';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'critical';

export type NotificationDeliveryStatus = 'pending' | 'sent' | 'failed';

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, any>;
  entity_type?: string;
  entity_id?: string;
  priority: NotificationPriority;
  is_read: boolean;
  read_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: string;
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

export interface NotificationDelivery {
  id: string;
  notification_id: string;
  user_id: string;
  email_sent_at?: string;
  email_status?: NotificationDeliveryStatus;
  push_sent_at?: string;
  push_status?: NotificationDeliveryStatus;
  created_at: string;
  updated_at: string;
}

// Notification icons mapping
export const notificationIcons: Record<NotificationType, string> = {
  system: '🔔',
  organization_added: '🏢',
  project_added: '�',
  task_assigned: '📝',
  task_updated: '🔄',
  task_comment: '💬',
  comment_mention: '👤',
  task_unassigned: '❌',
  form_assigned: '�',
  form_unassigned: '📄',
  approval_requested: '✋',
  approval_status_changed: '✅',
  entity_assigned: '📌',
};

// Priority colors
export const priorityColors: Record<NotificationPriority, string> = {
  low: 'text-gray-500',
  medium: 'text-blue-500',
  high: 'text-orange-500',
  critical: 'text-red-500',
};
