import { useState, useEffect, useCallback } from 'react';
import { pushNotificationService } from '@/lib/services/push-notifications';
import {
  PushNotificationContextType,
  PushSubscriptionData,
  PushNotificationPayload,
} from '@/lib/types/push-notifications';

export function usePushNotifications(): PushNotificationContextType {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscriptionData | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleError = useCallback((err: any) => {
    console.error('Push notification error:', err);
    setError(err.message || 'An error occurred');
  }, []);

  // Initialize push notification support check
  useEffect(() => {
    const checkSupport = async () => {
      try {
        setIsLoading(true);
        const supported = pushNotificationService.isSupported();
        setIsSupported(supported);

        if (supported) {
          await checkSubscriptionStatus();
        }
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    };

    checkSupport();
  }, [handleError]);

  // Check current subscription status
  const checkSubscriptionStatus = useCallback(async () => {
    try {
      const subscribed = await pushNotificationService.isSubscribed();
      setIsSubscribed(subscribed);

      if (subscribed) {
        const currentSubscription = await pushNotificationService.getCurrentSubscription();
        if (currentSubscription) {
          const subscriptionData = {
            endpoint: currentSubscription.endpoint,
            keys: {
              p256dh: currentSubscription.getKey('p256dh')
                ? btoa(
                    String.fromCharCode.apply(
                      null,
                      Array.from(new Uint8Array(currentSubscription.getKey('p256dh')!)),
                    ),
                  )
                : '',
              auth: currentSubscription.getKey('auth')
                ? btoa(
                    String.fromCharCode.apply(
                      null,
                      Array.from(new Uint8Array(currentSubscription.getKey('auth')!)),
                    ),
                  )
                : '',
            },
          };
          setSubscription(subscriptionData);
        }
      } else {
        setSubscription(null);
      }
    } catch (err) {
      console.error('Failed to check subscription status:', err);
      setIsSubscribed(false);
      setSubscription(null);
    }
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    try {
      clearError();

      if (!isSupported) {
        throw new Error('Push notifications are not supported in this browser');
      }

      const permission = await pushNotificationService.requestPermission();
      return permission;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, [isSupported, clearError, handleError]);

  // Subscribe to push notifications
  const subscribe = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      clearError();

      if (!isSupported) {
        throw new Error('Push notifications are not supported in this browser');
      }

      const result = await pushNotificationService.subscribe();

      if (result.success) {
        setIsSubscribed(true);
        await checkSubscriptionStatus();
        return true;
      } else {
        throw new Error(result.message || 'Failed to subscribe to push notifications');
      }
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, clearError, handleError, checkSubscriptionStatus]);

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);
      clearError();

      const success = await pushNotificationService.unsubscribe();

      if (success) {
        setIsSubscribed(false);
        setSubscription(null);
        return true;
      } else {
        throw new Error('Failed to unsubscribe from push notifications');
      }
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [clearError, handleError]);

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    try {
      clearError();

      if (!isSubscribed) {
        throw new Error('You must be subscribed to push notifications to send a test');
      }

      const success = await pushNotificationService.sendTestNotification();
      return success;
    } catch (err) {
      handleError(err);
      return false;
    }
  }, [isSubscribed, clearError, handleError]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    error,
    subscription,
    requestPermission,
    subscribe,
    unsubscribe,
    sendTestNotification,
    checkSubscriptionStatus,
  };
}

// Additional hook for managing push notification preferences
export function usePushNotificationPreferences() {
  const [preferences, setPreferences] = useState({
    enabled: true,
    quietHours: {
      enabled: false,
      start: '22:00',
      end: '07:00',
      timezone: 'UTC',
    },
  });

  const updatePreferences = useCallback(async (newPreferences: any) => {
    try {
      // Update preferences via API
      // This would integrate with the notification preferences system
      setPreferences(newPreferences);
    } catch (error) {
      console.error('Failed to update push notification preferences:', error);
      throw error;
    }
  }, []);

  return {
    preferences,
    updatePreferences,
  };
}

// Hook for testing push notifications with different payloads
export function usePushNotificationTesting() {
  const [isTesting, setIsTesting] = useState(false);

  const sendTestNotification = useCallback(
    async (
      type: string,
      title: string,
      body: string,
      options?: {
        actionUrl?: string;
        data?: Record<string, any>;
      },
    ): Promise<boolean> => {
      try {
        setIsTesting(true);

        const payload = pushNotificationService.createNotificationPayload(
          type as any,
          title,
          body,
          options,
        );

        // Show local notification for testing
        await pushNotificationService.showLocalNotification(payload);
        return true;
      } catch (error) {
        console.error('Failed to send test notification:', error);
        return false;
      } finally {
        setIsTesting(false);
      }
    },
    [],
  );

  const sendTestPushNotification = useCallback(
    async (
      type: string,
      title: string,
      body: string,
      options?: {
        actionUrl?: string;
        data?: Record<string, any>;
      },
    ): Promise<boolean> => {
      try {
        setIsTesting(true);

        const payload = pushNotificationService.createNotificationPayload(
          type as any,
          title,
          body,
          options,
        );

        const response = await fetch('/api/notifications/push/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ notification: payload }),
        });

        if (!response.ok) {
          throw new Error('Failed to send test push notification');
        }

        const result = await response.json();
        return result.success;
      } catch (error) {
        console.error('Failed to send test push notification:', error);
        return false;
      } finally {
        setIsTesting(false);
      }
    },
    [],
  );

  return {
    isTesting,
    sendTestNotification,
    sendTestPushNotification,
  };
}

// Hook for push notification statistics
export function usePushNotificationStats() {
  const [stats, setStats] = useState({
    totalSubscriptions: 0,
    activeSubscriptions: 0,
    inactiveSubscriptions: 0,
    uniqueUsers: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await pushNotificationService.getStatistics();
      setStats(data);
    } catch (err) {
      console.error('Failed to load push notification statistics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    isLoading,
    error,
    reload: loadStats,
  };
}
