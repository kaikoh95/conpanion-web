'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

// VAPID public key - you'll need to generate this and add to your environment
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

// Validate VAPID key is properly configured
const isVapidKeyValid = () => {
  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.trim() === '') {
    return false;
  }
  // Basic validation - VAPID keys should be base64url encoded and have a specific length
  return VAPID_PUBLIC_KEY.length > 0 && /^[A-Za-z0-9_-]+$/.test(VAPID_PUBLIC_KEY);
};

export function useServiceWorker() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      registerServiceWorker();
    }
  }, []);

  const registerServiceWorker = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js');
      setRegistration(reg);
      console.log('Service Worker registered:', reg);

      // Check for existing subscription
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        setSubscription(sub);
        // Save to database if user is logged in
        if (user) {
          await saveSubscription(sub);
        }
      }
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  };

  const subscribeToPush = useCallback(async () => {
    if (!registration || !user) {
      toast.error('Please log in to enable push notifications');
      return;
    }

    // Validate VAPID key before attempting subscription
    if (!isVapidKeyValid()) {
      console.error('VAPID_PUBLIC_KEY is not properly configured');
      toast.error('Push notifications are not properly configured. Please contact support.');
      return;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast.error('Notification permission denied');
        return;
      }

      // Subscribe to push notifications
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });

      setSubscription(sub);
      await saveSubscription(sub);
      toast.success('Push notifications enabled');
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error);
      toast.error('Failed to enable push notifications');
    }
  }, [registration, user]);

  const unsubscribeFromPush = useCallback(async () => {
    if (!subscription || !user) return;

    try {
      await subscription.unsubscribe();
      await removeSubscription();
      setSubscription(null);
      toast.success('Push notifications disabled');
    } catch (error) {
      console.error('Failed to unsubscribe from push notifications:', error);
      toast.error('Failed to disable push notifications');
    }
  }, [subscription, user]);

  const saveSubscription = async (sub: PushSubscription) => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('user_devices')
        .upsert({
          user_id: user.id,
          token: JSON.stringify(sub.toJSON()),
          platform: 'web',
          device_name: navigator.userAgent.substring(0, 100),
          push_enabled: true,
        }, {
          onConflict: 'user_id,token'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Failed to save push subscription:', error);
    }
  };

  const removeSubscription = async () => {
    if (!user || !subscription) return;

    try {
      const { error } = await supabase
        .from('user_devices')
        .delete()
        .eq('user_id', user.id)
        .eq('token', JSON.stringify(subscription.toJSON()));

      if (error) throw error;
    } catch (error) {
      console.error('Failed to remove push subscription:', error);
    }
  };

  return {
    isSupported,
    subscription,
    registration,
    subscribeToPush,
    unsubscribeFromPush,
    isSubscribed: !!subscription,
    permissionState: typeof window !== 'undefined' ? Notification.permission : 'default'
  };
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Additional validation to prevent window.atob errors
  if (!base64String || base64String.trim() === '') {
    throw new Error('Invalid base64 string: empty or undefined');
  }

  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  try {
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  } catch (error) {
    throw new Error(`Failed to decode base64 string: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}