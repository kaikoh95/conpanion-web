import { createClient } from '@/utils/supabase/client';
import {
  NotificationWithReadStatus,
  NotificationPreferences,
  CreateNotificationRequest,
  UpdateNotificationPreferencesRequest,
  NotificationListResponse,
  NotificationStatsResponse,
  NotificationType,
  NotificationPriority,
} from '@/lib/types/notification';

export class NotificationAPI {
  private supabase = createClient();

  /**
   * Ensure we have a valid session and refresh if needed
   */
  private async ensureValidSession(): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await this.supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Authentication required. Please sign in again.');
    }

    // Refresh the session if it's close to expiring
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;

    if (expiresAt - now < 300) {
      // Refresh if expires in less than 5 minutes
      const { error: refreshError } = await this.supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Session refresh failed:', refreshError);
      }
    }
  }

  /**
   * Get notifications for the current user with pagination
   */
  async getNotifications(
    limit: number = 20,
    offset: number = 0,
  ): Promise<NotificationListResponse> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get notifications using the database function
    const { data: notifications, error } = await this.supabase.rpc('get_user_notifications', {
      user_id_param: user.id,
      limit_param: limit,
      offset_param: offset,
    });

    if (error) throw error;

    // Get total and unread counts
    const [unreadCountResult, totalCountResult] = await Promise.all([
      this.getUnreadCount(),
      this.getTotalCount(),
    ]);

    return {
      notifications: notifications || [],
      total_count: totalCountResult,
      unread_count: unreadCountResult,
      has_more: notifications ? notifications.length === limit : false,
    };
  }

  /**
   * Get unread notification count for current user
   */
  async getUnreadCount(): Promise<number> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: count, error } = await this.supabase.rpc('get_unread_notification_count', {
      user_id_param: user.id,
    });

    if (error) throw error;
    return count || 0;
  }

  /**
   * Get total notification count for current user
   */
  async getTotalCount(): Promise<number> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { count, error } = await this.supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .or(`recipient_user_ids.is.null,recipient_user_ids.cs.{${user.id}}`)
      .eq('is_active', true);

    if (error) throw error;
    return count || 0;
  }

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: number): Promise<void> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data, error } = await this.supabase.rpc('mark_notification_read', {
      notification_id_param: notificationId,
      user_id_param: user.id,
    });

    if (error) throw error;
    if (!data) throw new Error('Failed to mark notification as read');
  }

  /**
   * Mark all notifications as read for current user
   */
  async markAllAsRead(): Promise<number> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: affectedCount, error } = await this.supabase.rpc('mark_all_notifications_read', {
      user_id_param: user.id,
    });

    if (error) throw error;
    return affectedCount || 0;
  }

  /**
   * Create a new notification (admin/system use)
   */
  async createNotification(request: CreateNotificationRequest): Promise<number> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    const { data: notificationId, error } = await this.supabase.rpc('create_notification', {
      type_param: request.type,
      title_param: request.title,
      message_param: request.message,
      priority_param: request.priority || 'medium',
      recipient_user_ids_param: request.recipient_user_ids || [],
      entity_type_param: request.entity_type || null,
      entity_id_param: request.entity_id || null,
      metadata_param: request.metadata || {},
      action_url_param: request.action_url || null,
      expires_at_param: request.expires_at || null,
      created_by_param: user.id,
    });

    if (error) throw error;
    if (!notificationId) throw new Error('Failed to create notification');

    // Handle case where notification was not created due to user preferences
    if (notificationId === -1) {
      console.log(
        'Notification not created - all recipients have disabled this notification type',
        {
          type: request.type,
          title: request.title,
          recipients: request.recipient_user_ids,
        },
      );
      // Return -1 to indicate notification was filtered out by preferences
      return -1;
    }

    return notificationId;
  }

  /**
   * Get notification preferences for current user
   */
  async getPreferences(): Promise<NotificationPreferences | null> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  }

  /**
   * Update notification preferences for current user
   */
  async updatePreferences(
    preferences: UpdateNotificationPreferencesRequest,
  ): Promise<NotificationPreferences> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // First try to update existing preferences
    const { data, error } = await this.supabase
      .from('notification_preferences')
      .update(preferences)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      // If no existing preferences, create new ones
      if (error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await this.supabase
          .from('notification_preferences')
          .insert({
            user_id: user.id,
            ...preferences,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        return newData;
      }
      throw error;
    }

    return data;
  }

  /**
   * Get notification statistics
   */
  async getStats(): Promise<NotificationStatsResponse> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get all user notifications for statistics
    const { data: notifications, error } = await this.supabase.rpc('get_user_notifications', {
      user_id_param: user.id,
      limit_param: 1000, // Get a large number for statistics
      offset_param: 0,
    });

    if (error) throw error;

    const allNotifications: NotificationWithReadStatus[] = notifications || [];
    const unreadNotifications = allNotifications.filter(
      (n: NotificationWithReadStatus) => !n.is_read,
    );

    // Group by type
    const byType: Record<NotificationType, number> = {} as Record<NotificationType, number>;
    allNotifications.forEach((notification: NotificationWithReadStatus) => {
      byType[notification.type] = (byType[notification.type] || 0) + 1;
    });

    // Group by priority
    const byPriority: Record<NotificationPriority, number> = {} as Record<
      NotificationPriority,
      number
    >;
    allNotifications.forEach((notification: NotificationWithReadStatus) => {
      byPriority[notification.priority] = (byPriority[notification.priority] || 0) + 1;
    });

    return {
      total_count: allNotifications.length,
      unread_count: unreadNotifications.length,
      by_type: byType,
      by_priority: byPriority,
    };
  }

  /**
   * Delete/deactivate a notification (admin use)
   */
  async deleteNotification(notificationId: number): Promise<void> {
    await this.ensureValidSession();

    const { error } = await this.supabase
      .from('notifications')
      .update({ is_active: false })
      .eq('id', notificationId);

    if (error) throw error;
  }

  /**
   * Subscribe to real-time notification changes
   */
  subscribeToNotifications(
    userId: string,
    onNotification: (payload: any) => void,
    onError?: (error: Error) => void,
  ) {
    return this.supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_user_ids.cs.{${userId}}`,
        },
        onNotification,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: 'recipient_user_ids.is.null', // System-wide notifications
        },
        onNotification,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to notification updates');
        } else if (status === 'CHANNEL_ERROR' && onError) {
          onError(new Error('Failed to subscribe to notification updates'));
        }
      });
  }

  /**
   * Subscribe to notification read status changes
   */
  subscribeToNotificationReads(
    userId: string,
    onRead: (payload: any) => void,
    onError?: (error: Error) => void,
  ) {
    return this.supabase
      .channel('notification_reads')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notification_reads',
          filter: `user_id=eq.${userId}`,
        },
        onRead,
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to notification read updates');
        } else if (status === 'CHANNEL_ERROR' && onError) {
          onError(new Error('Failed to subscribe to notification read updates'));
        }
      });
  }

  /**
   * Search notifications by text
   */
  async searchNotifications(
    query: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<NotificationWithReadStatus[]> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get all notifications first, then filter (could be optimized with full-text search later)
    const { data: allNotifications, error } = await this.supabase.rpc('get_user_notifications', {
      user_id_param: user.id,
      limit_param: 1000, // Get a large number for searching
      offset_param: 0,
    });

    if (error) throw error;

    const filtered = (allNotifications || [])
      .filter(
        (notification: NotificationWithReadStatus) =>
          notification.title.toLowerCase().includes(query.toLowerCase()) ||
          notification.message.toLowerCase().includes(query.toLowerCase()),
      )
      .slice(offset, offset + limit);

    return filtered;
  }

  /**
   * Get notifications by type
   */
  async getNotificationsByType(
    type: NotificationType,
    limit: number = 20,
    offset: number = 0,
  ): Promise<NotificationWithReadStatus[]> {
    await this.ensureValidSession();

    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error('User not authenticated');

    // Get all notifications first, then filter by type
    const { data: allNotifications, error } = await this.supabase.rpc('get_user_notifications', {
      user_id_param: user.id,
      limit_param: 1000, // Get a large number for filtering
      offset_param: 0,
    });

    if (error) throw error;

    const filtered = (allNotifications || [])
      .filter((notification: NotificationWithReadStatus) => notification.type === type)
      .slice(offset, offset + limit);

    return filtered;
  }
}

// Export singleton instance
export const notificationAPI = new NotificationAPI();
