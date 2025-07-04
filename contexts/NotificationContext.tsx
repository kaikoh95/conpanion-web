'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { notificationAPI } from '@/lib/api/notifications';
import {
  NotificationWithReadStatus,
  NotificationPreferences,
  NotificationContextType,
  UpdateNotificationPreferencesRequest,
} from '@/lib/types/notification';

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<NotificationWithReadStatus[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: any) => {
    console.error('Notification error:', err);
    setError(err.message || 'An error occurred');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Load notifications with pagination
  const loadNotifications = useCallback(
    async (limit: number = 20, offset: number = 0) => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        clearError();

        const response = await notificationAPI.getNotifications(limit, offset);

        if (offset === 0) {
          // Fresh load - replace all notifications
          setNotifications(response.notifications);
        } else {
          // Pagination - append notifications
          setNotifications((prev) => [...prev, ...response.notifications]);
        }

        setUnreadCount(response.unread_count);
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [user, handleError, clearError],
  );

  // Load user preferences
  const loadPreferences = useCallback(async () => {
    if (!user) return;

    try {
      const userPreferences = await notificationAPI.getPreferences();
      setPreferences(userPreferences);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    }
  }, [user]);

  // Refresh unread count only
  const refreshUnreadCount = useCallback(async () => {
    if (!user) return;

    try {
      const count = await notificationAPI.getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      console.error('Failed to refresh unread count:', err);
    }
  }, [user]);

  // Mark notification as read
  const markAsRead = useCallback(
    async (notificationId: number) => {
      try {
        clearError();

        await notificationAPI.markAsRead(notificationId);

        // Update local state optimistically
        setNotifications((prev) =>
          prev.map((notification) =>
            notification.id === notificationId
              ? { ...notification, is_read: true, read_at: new Date().toISOString() }
              : notification,
          ),
        );

        // Update unread count
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [handleError, clearError],
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    try {
      clearError();

      const affectedCount = await notificationAPI.markAllAsRead();

      // Update local state optimistically
      const now = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((notification) => ({
          ...notification,
          is_read: true,
          read_at: notification.is_read ? notification.read_at : now,
        })),
      );

      // Reset unread count
      setUnreadCount(0);

      return affectedCount;
    } catch (err) {
      handleError(err);
      throw err;
    }
  }, [handleError, clearError]);

  // Update notification preferences
  const updatePreferences = useCallback(
    async (newPreferences: UpdateNotificationPreferencesRequest) => {
      try {
        clearError();

        const updatedPreferences = await notificationAPI.updatePreferences(newPreferences);
        setPreferences(updatedPreferences);
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [handleError, clearError],
  );

  // Refresh all data
  const refresh = useCallback(async () => {
    await Promise.all([loadNotifications(), loadPreferences(), refreshUnreadCount()]);
  }, [loadNotifications, loadPreferences, refreshUnreadCount]);

  // Load initial data when user changes
  useEffect(() => {
    if (user) {
      loadNotifications();
      loadPreferences();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      setPreferences(null);
      setIsLoading(false);
      setError(null);
    }
  }, [user, loadNotifications, loadPreferences]);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!user?.id) return;

    let notificationSubscription: any;
    let readSubscription: any;

    try {
      // Subscribe to new notifications
      notificationSubscription = notificationAPI.subscribeToNotifications(
        user.id,
        (payload) => {
          console.log('📨 New notification received:', payload);

          if (payload.eventType === 'INSERT' && payload.new) {
            // Add new notification to the beginning of the list
            const newNotification: NotificationWithReadStatus = {
              ...payload.new,
              is_read: false,
              read_at: null,
            };

            setNotifications((prev) => [newNotification, ...prev]);
            setUnreadCount((prev) => prev + 1);
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            // Update existing notification
            setNotifications((prev) =>
              prev.map((notification) =>
                notification.id === payload.new.id
                  ? { ...payload.new, is_read: notification.is_read, read_at: notification.read_at }
                  : notification,
              ),
            );
          } else if (payload.eventType === 'DELETE' && payload.old) {
            // Remove deleted notification
            setNotifications((prev) =>
              prev.filter((notification) => notification.id !== payload.old.id),
            );
            // Refresh unread count since we can't be sure of the read status
            refreshUnreadCount();
          }
        },
        (error) => {
          console.error('Notification subscription error:', error);
        },
      );

      // Subscribe to read status changes
      readSubscription = notificationAPI.subscribeToNotificationReads(
        user.id,
        (payload) => {
          console.log('📖 Notification read status changed:', payload);

          if (payload.eventType === 'INSERT' && payload.new) {
            // Mark notification as read
            setNotifications((prev) =>
              prev.map((notification) =>
                notification.id === payload.new.notification_id
                  ? { ...notification, is_read: true, read_at: payload.new.read_at }
                  : notification,
              ),
            );
            // Refresh unread count for accuracy
            refreshUnreadCount();
          }
        },
        (error) => {
          console.error('Notification read subscription error:', error);
        },
      );
    } catch (error) {
      console.error('Failed to set up notification subscriptions:', error);
    }

    // Cleanup subscriptions
    return () => {
      if (notificationSubscription) {
        notificationSubscription.unsubscribe();
      }
      if (readSubscription) {
        readSubscription.unsubscribe();
      }
    };
  }, [user?.id, refreshUnreadCount]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isLoading,
    error,
    preferences,
    loadNotifications,
    markAsRead,
    markAllAsRead,
    refreshUnreadCount,
    updatePreferences,
    refresh,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationContextType {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
