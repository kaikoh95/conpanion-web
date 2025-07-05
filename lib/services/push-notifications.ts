import { createClient } from '@/utils/supabase/client';
import {
  PushSubscriptionData,
  CreatePushSubscriptionRequest,
  PushSubscriptionResponse,
  SendPushNotificationRequest,
  SendPushNotificationResponse,
  PushNotificationPayload,
  PushDeliveryResult,
  PushSubscriptionRecord,
  isPushNotificationSupported,
  getNotificationPermission,
  urlBase64ToUint8Array,
  createPushNotificationPayload,
  formatPushSubscriptionForStorage,
} from '@/lib/types/push-notifications';
import { NotificationType } from '@/lib/types/notification';

export class PushNotificationService {
  private supabase = createClient();
  private vapidPublicKey: string;
  private swRegistration: ServiceWorkerRegistration | null = null;

  constructor() {
    // VAPID public key should be set via environment variable NEXT_PUBLIC_VAPID_PUBLIC_KEY
    this.vapidPublicKey = '';
    if (typeof window !== 'undefined') {
      // Get VAPID key from window object or fetch from API endpoint
      this.initVapidKey();
      this.initializeServiceWorker();
    }
  }

  private async initVapidKey(): Promise<void> {
    try {
      // Try to get from global window object set by Next.js
      const nextConfig = (window as any).__NEXT_DATA__?.env;
      if (nextConfig?.NEXT_PUBLIC_VAPID_PUBLIC_KEY) {
        this.vapidPublicKey = nextConfig.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        return;
      }

      // Fallback: fetch from API endpoint
      const response = await fetch('/api/push/vapid-key');
      if (response.ok) {
        const data = await response.json();
        this.vapidPublicKey = data.publicKey;
      }
    } catch (error) {
      console.warn('Failed to load VAPID key:', error);
    }
  }

  /**
   * Initialize the service worker
   */
  private async initializeServiceWorker(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return;
    }

    try {
      // Register service worker
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });

      console.log('Service Worker registered successfully:', this.swRegistration);

      // Handle service worker updates
      this.swRegistration.addEventListener('updatefound', () => {
        const newWorker = this.swRegistration!.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('New service worker available');
              // Optionally show update notification
              this.showUpdateNotification();
            }
          });
        }
      });

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event);
      });
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }

  /**
   * Show update notification for service worker
   */
  private showUpdateNotification(): void {
    if (window.confirm('A new version is available. Reload to update?')) {
      window.location.reload();
    }
  }

  /**
   * Handle messages from service worker
   */
  private handleServiceWorkerMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    switch (type) {
      case 'NOTIFICATION_CLICK':
        console.log('Notification clicked:', data);
        this.handleNotificationClick(data);
        break;
      case 'NOTIFICATION_CLOSE':
        console.log('Notification closed:', data);
        this.handleNotificationClose(data);
        break;
      case 'PUSH_RECEIVED':
        console.log('Push notification received:', data);
        this.handlePushReceived(data);
        break;
      case 'SYNC_NOTIFICATIONS':
        console.log('Sync notifications requested');
        this.handleSyncNotifications();
        break;
      default:
        console.log('Unknown service worker message:', type);
    }
  }

  /**
   * Handle notification click
   */
  private handleNotificationClick(data: any): void {
    // Mark notification as read if notificationId is provided
    if (data.notificationId) {
      this.markNotificationAsRead(data.notificationId);
    }

    // Navigate to action URL if provided
    if (data.actionUrl && data.actionUrl !== window.location.pathname) {
      window.location.href = data.actionUrl;
    }
  }

  /**
   * Handle notification close
   */
  private handleNotificationClose(data: any): void {
    // Optional: Track notification dismissal analytics
    console.log('Notification dismissed:', data);
  }

  /**
   * Handle push received
   */
  private handlePushReceived(data: any): void {
    // Optional: Update UI state or refresh notifications
    console.log('Push notification received in foreground:', data);
  }

  /**
   * Handle sync notifications
   */
  private handleSyncNotifications(): void {
    // Refresh notifications when coming back online
    window.location.reload();
  }

  /**
   * Mark notification as read
   */
  private async markNotificationAsRead(notificationId: number): Promise<void> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();
      if (!user) return;

      const { error } = await this.supabase.rpc('mark_notification_read', {
        notification_id_param: notificationId,
        user_id_param: user.id,
      });

      if (error) {
        console.error('Failed to mark notification as read:', error);
      }
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return isPushNotificationSupported();
  }

  /**
   * Get current notification permission
   */
  getPermission(): NotificationPermission {
    return getNotificationPermission();
  }

  /**
   * Request notification permission
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      throw new Error('Push notifications are not supported');
    }

    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    return permission;
  }

  /**
   * Get current push subscription
   */
  async getCurrentSubscription(): Promise<PushSubscription | null> {
    if (!this.swRegistration) {
      await this.initializeServiceWorker();
    }

    if (!this.swRegistration) {
      throw new Error('Service Worker not available');
    }

    return this.swRegistration.pushManager.getSubscription();
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(): Promise<PushSubscriptionResponse> {
    if (!this.isSupported()) {
      throw new Error('Push notifications are not supported');
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Push notification permission denied');
    }

    if (!this.swRegistration) {
      await this.initializeServiceWorker();
    }

    if (!this.swRegistration) {
      throw new Error('Service Worker not available');
    }

    if (!this.vapidPublicKey) {
      throw new Error('VAPID public key not configured');
    }

    try {
      // Create push subscription
      const subscription = await this.swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(this.vapidPublicKey),
      });

      // Format subscription for storage
      const subscriptionData = formatPushSubscriptionForStorage(subscription);

      // Store subscription in database
      const result = await this.storeSubscription({
        subscription: subscriptionData,
        userAgent: navigator.userAgent,
      });

      return result;
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      throw error;
    }
  }

  /**
   * Store push subscription in database
   */
  private async storeSubscription(
    request: CreatePushSubscriptionRequest,
  ): Promise<PushSubscriptionResponse> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await this.supabase.rpc('upsert_push_subscription', {
        user_id_param: user.id,
        endpoint_param: request.subscription.endpoint,
        p256dh_param: request.subscription.keys.p256dh,
        auth_param: request.subscription.keys.auth,
        user_agent_param: request.userAgent || null,
      });

      if (error) {
        throw error;
      }

      return {
        id: data,
        success: true,
        message: 'Push subscription stored successfully',
      };
    } catch (error) {
      console.error('Failed to store push subscription:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(): Promise<boolean> {
    try {
      const subscription = await this.getCurrentSubscription();
      if (!subscription) {
        return true; // Already unsubscribed
      }

      // Unsubscribe from browser
      const success = await subscription.unsubscribe();

      if (success) {
        // Remove from database
        await this.removeSubscription(subscription.endpoint);
      }

      return success;
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      throw error;
    }
  }

  /**
   * Remove push subscription from database
   */
  private async removeSubscription(endpoint: string): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { error } = await this.supabase.rpc('deactivate_push_subscription', {
        user_id_param: user.id,
        endpoint_param: endpoint,
      });

      if (error) {
        console.error('Failed to remove push subscription:', error);
      }
    } catch (error) {
      console.error('Error removing push subscription:', error);
    }
  }

  /**
   * Check if user is subscribed to push notifications
   */
  async isSubscribed(): Promise<boolean> {
    try {
      const subscription = await this.getCurrentSubscription();
      return subscription !== null;
    } catch (error) {
      console.error('Failed to check subscription status:', error);
      return false;
    }
  }

  /**
   * Get user's push subscriptions from database
   */
  async getUserSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    try {
      const { data, error } = await this.supabase.rpc('get_user_push_subscriptions', {
        user_id_param: user.id,
      });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Failed to get user push subscriptions:', error);
      throw error;
    }
  }

  /**
   * Send test push notification
   */
  async sendTestNotification(): Promise<boolean> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      const payload = createPushNotificationPayload(
        'system_announcement',
        '🔔 Test Push Notification',
        'This is a test push notification to verify your settings are working correctly.',
        {
          actionUrl: '/protected/settings/notifications',
          data: { test: true },
        },
      );

      const response = await fetch('/api/notifications/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification: payload }),
      });

      if (!response.ok) {
        throw new Error('Failed to send test notification');
      }

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Failed to send test push notification:', error);
      throw error;
    }
  }

  /**
   * Send push notification to users
   */
  async sendPushNotification(
    request: SendPushNotificationRequest,
  ): Promise<SendPushNotificationResponse> {
    try {
      const response = await fetch('/api/notifications/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        throw new Error('Failed to send push notification');
      }

      return await response.json();
    } catch (error) {
      console.error('Failed to send push notification:', error);
      throw error;
    }
  }

  /**
   * Create notification payload for specific type
   */
  createNotificationPayload(
    type: NotificationType,
    title: string,
    body: string,
    options?: {
      notificationId?: number;
      actionUrl?: string;
      data?: Record<string, any>;
    },
  ): PushNotificationPayload {
    return createPushNotificationPayload(type, title, body, options);
  }

  /**
   * Show local notification (for testing)
   */
  async showLocalNotification(payload: PushNotificationPayload): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Notifications are not supported');
    }

    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }

    if (!this.swRegistration) {
      await this.initializeServiceWorker();
    }

    if (!this.swRegistration) {
      throw new Error('Service Worker not available');
    }

    await this.swRegistration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon,
      badge: payload.badge,
      // image: payload.image, // Not supported in all browsers
      data: payload.data,
      actions: payload.actions,
      silent: payload.silent,
      requireInteraction: payload.requireInteraction,
      tag: payload.tag,
      timestamp: payload.timestamp || Date.now(),
    } as NotificationOptions);
  }

  /**
   * Clear all notifications
   */
  async clearAllNotifications(): Promise<void> {
    if (!this.swRegistration) {
      return;
    }

    try {
      const notifications = await this.swRegistration.getNotifications();
      notifications.forEach((notification) => notification.close());
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  /**
   * Get notification statistics
   */
  async getStatistics(): Promise<any> {
    try {
      const { data, error } = await this.supabase.rpc('get_push_subscription_stats');
      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Failed to get push subscription statistics:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired subscriptions
   */
  async cleanupExpiredSubscriptions(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('cleanup_expired_push_subscriptions');
      if (error) {
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Failed to cleanup expired subscriptions:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
