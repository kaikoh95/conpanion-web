'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
// import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Bell,
  BellOff,
  Smartphone,
  AlertCircle,
  CheckCircle,
  Loader2,
  Settings,
  TestTube,
  Info,
} from 'lucide-react';

interface PushNotificationSetupProps {
  className?: string;
}

export function PushNotificationSetup({ className }: PushNotificationSetupProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    checkPushNotificationSupport();
  }, []);

  const checkPushNotificationSupport = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if push notifications are supported
      const supported =
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

      setIsSupported(supported);

      if (supported) {
        // Check current permission
        setPermission(Notification.permission);

        // Check subscription status
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsSubscribed(!!subscription);
        }
      }
    } catch (err) {
      console.error('Error checking push notification support:', err);
      setError('Failed to check push notification support');
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermission = async () => {
    try {
      setError(null);

      if (!isSupported) {
        throw new Error('Push notifications are not supported in this browser');
      }

      const newPermission = await Notification.requestPermission();
      setPermission(newPermission);

      if (newPermission !== 'granted') {
        throw new Error('Push notification permission denied');
      }

      return newPermission;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request permission';
      setError(errorMessage);
      throw err;
    }
  };

  const subscribeToPushNotifications = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Request permission first
      if (permission !== 'granted') {
        await requestPermission();
      }

      // Register service worker if not already registered
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
      }

      // Get VAPID public key from global config or API
      let vapidPublicKey = '';
      try {
        const response = await fetch('/api/push/vapid-key');
        if (response.ok) {
          const data = await response.json();
          vapidPublicKey = data.publicKey;
        }
      } catch (error) {
        console.error('Failed to get VAPID key:', error);
      }

      if (!vapidPublicKey) {
        throw new Error('VAPID public key not configured');
      }

      // Convert VAPID key
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);

      // Subscribe to push notifications
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });

      // Send subscription to server
      const response = await fetch('/api/notifications/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscription: {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: arrayBufferToBase64(subscription.getKey('p256dh')!),
              auth: arrayBufferToBase64(subscription.getKey('auth')!),
            },
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to store push subscription');
      }

      setIsSubscribed(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to subscribe';
      setError(errorMessage);
      console.error('Push subscription error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribeFromPushNotifications = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          // Unsubscribe from browser
          await subscription.unsubscribe();

          // Remove from server
          await fetch('/api/notifications/push/unsubscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              endpoint: subscription.endpoint,
            }),
          });
        }
      }

      setIsSubscribed(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to unsubscribe';
      setError(errorMessage);
      console.error('Push unsubscribe error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async () => {
    try {
      setIsTesting(true);
      setError(null);

      const response = await fetch('/api/notifications/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notification: {
            title: '🔔 Test Push Notification',
            body: 'This is a test push notification to verify your settings are working correctly.',
            icon: '/icons/notification-default.png',
            badge: '/icons/badge.png',
            data: {
              type: 'system_announcement',
              actionUrl: '/protected/settings/notifications',
              test: true,
            },
          },
        }),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to send test notification');
      }

      // Show success message
      // You could show a toast notification here
      console.log('Test notification sent successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test notification';
      setError(errorMessage);
      console.error('Test notification error:', err);
    } finally {
      setIsTesting(false);
    }
  };

  // Helper functions
  const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return window.btoa(binary);
  };

  const getStatusBadge = () => {
    if (!isSupported) {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
          Not Supported
        </span>
      );
    }

    if (permission === 'denied') {
      return (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
          Blocked
        </span>
      );
    }

    if (isSubscribed) {
      return (
        <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
          Active
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-900 dark:text-gray-200">
        Inactive
      </span>
    );
  };

  const getStatusIcon = () => {
    if (!isSupported || permission === 'denied') {
      return <BellOff className="h-5 w-5 text-red-600" />;
    }

    if (isSubscribed) {
      return <Bell className="h-5 w-5 text-green-600" />;
    }

    return <Bell className="h-5 w-5 text-gray-400" />;
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950">
            <Smartphone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              Push Notifications
              {getStatusBadge()}
            </CardTitle>
            <CardDescription>Receive notifications directly on your device</CardDescription>
          </div>
          {getStatusIcon()}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Browser Support Check */}
        {!isSupported && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Push notifications are not supported in this browser. Please use a modern browser like
              Chrome, Firefox, or Safari.
            </AlertDescription>
          </Alert>
        )}

        {/* Permission Status */}
        {isSupported && permission === 'denied' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Push notifications have been blocked. Please enable them in your browser settings and
              refresh the page.
            </AlertDescription>
          </Alert>
        )}

        {/* Main Controls */}
        {isSupported && permission !== 'denied' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Enable Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  Receive notifications directly on your device, even when the app is closed
                </p>
              </div>
              <Switch
                checked={isSubscribed}
                onCheckedChange={
                  isSubscribed ? unsubscribeFromPushNotifications : subscribeToPushNotifications
                }
                disabled={isLoading}
              />
            </div>

            {/* Test Button */}
            {isSubscribed && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={sendTestNotification}
                  disabled={isTesting}
                >
                  {isTesting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube className="mr-2 h-4 w-4" />
                  )}
                  Send Test Notification
                </Button>
              </div>
            )}

            {/* Status Information */}
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">Status:</span>
                <span>
                  {isSubscribed
                    ? 'Push notifications are enabled'
                    : 'Push notifications are disabled'}
                </span>
              </div>

              {isSubscribed && (
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <p>• Notifications will appear even when the app is closed</p>
                  <p>• You can control which types of notifications you receive</p>
                  <p>• Quiet hours settings will be respected</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2 text-sm text-muted-foreground">
              {isSubscribed ? 'Unsubscribing...' : 'Setting up push notifications...'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
