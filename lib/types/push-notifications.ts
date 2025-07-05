import { Database } from '@/lib/supabase/types.generated';

// Database types (will be available after migration)
// export type PushSubscription = Database['public']['Tables']['push_subscriptions']['Row'];
// export type PushSubscriptionInsert = Database['public']['Tables']['push_subscriptions']['Insert'];
// export type PushSubscriptionUpdate = Database['public']['Tables']['push_subscriptions']['Update'];

// Temporary type definitions until migration is applied
export interface PushSubscriptionRecord {
  id: number;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PushSubscriptionInsert {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  is_active?: boolean;
}

export interface PushSubscriptionUpdate {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  user_agent?: string | null;
  is_active?: boolean;
  updated_at?: string;
}

// Browser Push API types
export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Push notification payload types
export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  image?: string;
  data?: {
    notificationId?: number;
    actionUrl?: string;
    type?: string;
    [key: string]: any;
  };
  actions?: NotificationAction[];
  silent?: boolean;
  requireInteraction?: boolean;
  tag?: string;
  timestamp?: number;
}

export interface NotificationAction {
  action: string;
  title: string;
  icon?: string;
}

// Push subscription management types
export interface CreatePushSubscriptionRequest {
  subscription: PushSubscriptionData;
  userAgent?: string;
}

export interface PushSubscriptionResponse {
  id: number;
  success: boolean;
  message?: string;
}

// Push notification service types
export interface SendPushNotificationRequest {
  userIds: string[];
  notification: PushNotificationPayload;
  options?: {
    ttl?: number;
    urgency?: 'very-low' | 'low' | 'normal' | 'high';
    topic?: string;
  };
}

export interface SendPushNotificationResponse {
  success: boolean;
  successCount: number;
  failureCount: number;
  results: PushDeliveryResult[];
}

export interface PushDeliveryResult {
  subscriptionId: number;
  success: boolean;
  error?: string;
  statusCode?: number;
}

// Push service configuration
export interface PushServiceConfig {
  vapidPublicKey: string;
  vapidPrivateKey: string;
  vapidSubject: string;
}

// Push notification preferences
export interface PushNotificationPreferences {
  enabled: boolean;
  deliveryPreference: 'immediate' | 'disabled';
  quietHours?: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: string;
  };
  typePreferences?: Record<string, boolean>;
}

// Push subscription stats
export interface PushSubscriptionStats {
  totalSubscriptions: number;
  activeSubscriptions: number;
  inactiveSubscriptions: number;
  uniqueUsers: number;
}

// Push notification context types
export interface PushNotificationContextType {
  isSupported: boolean;
  isSubscribed: boolean;
  isLoading: boolean;
  error: string | null;
  subscription: PushSubscriptionData | null;
  
  // Actions
  requestPermission: () => Promise<NotificationPermission>;
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<boolean>;
  sendTestNotification: () => Promise<boolean>;
  checkSubscriptionStatus: () => Promise<void>;
}

// Service worker message types
export interface ServiceWorkerMessage {
  type: 'NOTIFICATION_CLICK' | 'NOTIFICATION_CLOSE' | 'PUSH_RECEIVED';
  data?: any;
}

// Notification click event data
export interface NotificationClickData {
  notificationId?: number;
  actionUrl?: string;
  action?: string;
  type?: string;
}

// Push notification templates
export interface PushNotificationTemplate {
  title: string;
  body: string;
  icon: string;
  badge: string;
  actions?: NotificationAction[];
}

// Template mapping for different notification types
export const PUSH_NOTIFICATION_TEMPLATES: Record<string, PushNotificationTemplate> = {
  system_announcement: {
    title: '📢 System Announcement',
    body: 'New system announcement available',
    icon: '/icons/notification-system.png',
    badge: '/icons/badge.png',
  },
  approval_request: {
    title: '📝 Approval Request',
    body: 'New approval request requires your attention',
    icon: '/icons/notification-approval.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'approve', title: 'Approve', icon: '/icons/approve.png' },
      { action: 'view', title: 'View', icon: '/icons/view.png' },
    ],
  },
  approval_status_update: {
    title: '✅ Approval Update',
    body: 'Approval status has been updated',
    icon: '/icons/notification-update.png',
    badge: '/icons/badge.png',
  },
  task_assignment: {
    title: '👤 Task Assignment',
    body: 'New task has been assigned to you',
    icon: '/icons/notification-task.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'view', title: 'View Task', icon: '/icons/view.png' },
      { action: 'accept', title: 'Accept', icon: '/icons/accept.png' },
    ],
  },
  task_status_update: {
    title: '📊 Task Update',
    body: 'Task status has been updated',
    icon: '/icons/notification-update.png',
    badge: '/icons/badge.png',
  },
  organization_invitation: {
    title: '🏢 Organization Invitation',
    body: 'You have been invited to join an organization',
    icon: '/icons/notification-org.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'accept', title: 'Accept', icon: '/icons/accept.png' },
      { action: 'view', title: 'View', icon: '/icons/view.png' },
    ],
  },
  project_invitation: {
    title: '📁 Project Invitation',
    body: 'You have been invited to join a project',
    icon: '/icons/notification-project.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'accept', title: 'Accept', icon: '/icons/accept.png' },
      { action: 'view', title: 'View', icon: '/icons/view.png' },
    ],
  },
  form_submission: {
    title: '📄 Form Submission',
    body: 'New form submission received',
    icon: '/icons/notification-form.png',
    badge: '/icons/badge.png',
  },
  site_diary_submission: {
    title: '📖 Site Diary Update',
    body: 'New site diary entry submitted',
    icon: '/icons/notification-diary.png',
    badge: '/icons/badge.png',
  },
  comment_mention: {
    title: '💬 Mention',
    body: 'You have been mentioned in a comment',
    icon: '/icons/notification-mention.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'view', title: 'View', icon: '/icons/view.png' },
      { action: 'reply', title: 'Reply', icon: '/icons/reply.png' },
    ],
  },
  due_date_reminder: {
    title: '⏰ Due Date Reminder',
    body: 'Task due date is approaching',
    icon: '/icons/notification-reminder.png',
    badge: '/icons/badge.png',
    actions: [
      { action: 'view', title: 'View Task', icon: '/icons/view.png' },
      { action: 'complete', title: 'Mark Complete', icon: '/icons/complete.png' },
    ],
  },
};

// Helper functions
export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'default';
  }
  return Notification.permission;
}

export function createPushNotificationPayload(
  type: string,
  title: string,
  body: string,
  options?: {
    notificationId?: number;
    actionUrl?: string;
    data?: Record<string, any>;
  }
): PushNotificationPayload {
  const template = PUSH_NOTIFICATION_TEMPLATES[type];
  
  return {
    title: title || template?.title || 'Notification',
    body: body || template?.body || 'You have a new notification',
    icon: template?.icon || '/icons/notification-default.png',
    badge: template?.badge || '/icons/badge.png',
    data: {
      notificationId: options?.notificationId,
      actionUrl: options?.actionUrl,
      type,
      timestamp: Date.now(),
      ...options?.data,
    },
    actions: template?.actions,
    requireInteraction: ['approval_request', 'task_assignment', 'organization_invitation', 'project_invitation'].includes(type),
    tag: type,
  };
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  
  return outputArray;
}

export function formatPushSubscriptionForStorage(subscription: PushSubscription): PushSubscriptionData {
  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.getKey('p256dh') ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('p256dh')!)))) : '',
      auth: subscription.getKey('auth') ? btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey('auth')!)))) : '',
    },
  };
}