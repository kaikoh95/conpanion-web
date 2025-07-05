'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
import type { Notification } from '@/lib/types/notifications';
import { RealtimeChannel } from '@supabase/supabase-js';
import { toast } from 'sonner';

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const supabase = createClient();
  const [channel, setChannel] = useState<RealtimeChannel | null>(null);

  // Load notifications
  const loadNotifications = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  }, [user, supabase]);

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    if (!user) return;

    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;
      setUnreadCount(count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
    }
  }, [user, supabase]);

  // Handle new notification
  const handleNewNotification = useCallback((notification: Notification) => {
    // Add to list
    setNotifications((prev: Notification[]) => [notification, ...prev]);
    setUnreadCount((prev: number) => prev + 1);

    // Show toast notification
    toast(notification.title, {
      description: notification.message,
      action: notification.entity_id ? {
        label: 'View',
        onClick: () => {
          // Navigate to entity
          const entityPath = getEntityPath(notification);
          if (entityPath) {
            window.location.href = entityPath;
          }
        }
      } : undefined,
    });

    // Browser notification if permitted
    if (window.Notification && window.Notification.permission === 'granted' && document.hidden) {
      const browserNotification = new window.Notification(notification.title, {
        body: notification.message,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
      });

      browserNotification.onclick = () => {
        window.focus();
        const entityPath = getEntityPath(notification);
        if (entityPath) {
          window.location.href = entityPath;
        }
      };
    }
  }, []);

  // Handle notification update
  const handleNotificationUpdate = useCallback((updatedNotification: Notification) => {
    setNotifications((prev: Notification[]) => 
      prev.map((n: Notification) => n.id === updatedNotification.id ? updatedNotification : n)
    );
    
    // Update unread count if notification was marked as read
    if (updatedNotification.is_read) {
      setUnreadCount((prev: number) => Math.max(0, prev - 1));
    }
  }, []);

  // Set up real-time subscription
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      setIsLoading(false);
      return;
    }

    // Initial load
    loadNotifications();
    loadUnreadCount();

    // Subscribe to real-time updates
    const newChannel = supabase
      .channel(`user-notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          handleNewNotification(payload.new as Notification);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload: any) => {
          handleNotificationUpdate(payload.new as Notification);
        }
      )
      .subscribe();

    setChannel(newChannel);

    // Request browser notification permission
    if (window.Notification && window.Notification.permission === 'default') {
      window.Notification.requestPermission();
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [user, supabase, loadNotifications, loadUnreadCount, handleNewNotification, handleNotificationUpdate]);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('id', notificationId)
        .eq('user_id', user?.id);

      if (error) throw error;

      // Update local state
      setNotifications((prev: Notification[]) =>
        prev.map((n: Notification) => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount((prev: number) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
      toast.error('Failed to mark notification as read');
    }
  }, [user, supabase]);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      // Update local state
      setNotifications((prev: Notification[]) => prev.map((n: Notification) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      toast.error('Failed to mark all notifications as read');
    }
  }, [user, supabase]);

  // Refresh notifications
  const refreshNotifications = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadNotifications(), loadUnreadCount()]);
  }, [loadNotifications, loadUnreadCount]);

  const value: NotificationContextType = {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

// Helper function to get entity path
function getEntityPath(notification: Notification): string | null {
  const { entity_type, entity_id, data } = notification;
  
  if (!entity_type || !entity_id) return null;

  switch (entity_type) {
    case 'task':
      return `/tasks/${entity_id}`;
    case 'project':
      return `/projects/${entity_id}`;
    case 'organization':
      return `/organizations/${entity_id}`;
    case 'approval':
      return `/approvals/${entity_id}`;
    case 'task_comment':
      return data.task_id ? `/tasks/${data.task_id}#comment-${entity_id}` : null;
    default:
      return null;
  }
}