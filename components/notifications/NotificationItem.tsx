'use client';

import React from 'react';
import {
  Megaphone,
  UserCheck,
  CheckCircle,
  UserPlus,
  Activity,
  Building,
  FolderPlus,
  FileText,
  Book,
  AtSign,
  Clock,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import {
  NotificationWithReadStatus,
  getNotificationTemplate,
  getPriorityStyle,
  formatNotificationTime,
} from '@/lib/types/notification';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: NotificationWithReadStatus;
}

// Icon mapping for notification types
const iconMap = {
  megaphone: Megaphone,
  'user-check': UserCheck,
  'check-circle': CheckCircle,
  'user-plus': UserPlus,
  activity: Activity,
  building: Building,
  'folder-plus': FolderPlus,
  'file-text': FileText,
  book: Book,
  'at-sign': AtSign,
  clock: Clock,
};

export function NotificationItem({ notification }: NotificationItemProps) {
  const { markAsRead } = useNotifications();

  const template = getNotificationTemplate(notification.type);
  const priorityStyle = getPriorityStyle(notification.priority);
  const IconComponent = iconMap[template.icon as keyof typeof iconMap] || Clock;

  const handleClick = async () => {
    // Mark as read if not already read
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
      } catch (error) {
        console.error('Failed to mark notification as read:', error);
      }
    }

    // Navigate to action URL if provided
    if (notification.action_url) {
      window.location.href = notification.action_url;
    }
  };

  return (
    <div
      className={cn(
        'cursor-pointer p-4 transition-colors hover:bg-muted/50',
        !notification.is_read && 'bg-blue-50/50 dark:bg-blue-950/10',
      )}
      onClick={handleClick}
    >
      <div className="flex gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            priorityStyle.bgColor,
          )}
        >
          <IconComponent className={cn('h-4 w-4', priorityStyle.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-1">
          {/* Title and timestamp */}
          <div className="flex items-start justify-between">
            <h4
              className={cn(
                'text-sm font-medium leading-tight',
                !notification.is_read && 'font-semibold',
              )}
            >
              {notification.title}
            </h4>
            <time className="ml-2 shrink-0 text-xs text-muted-foreground">
              {formatNotificationTime(notification.created_at)}
            </time>
          </div>

          {/* Message */}
          <p className="line-clamp-2 text-sm text-muted-foreground">{notification.message}</p>

          {/* Priority and read status indicators */}
          <div className="flex items-center gap-2">
            {/* Priority indicator */}
            {notification.priority !== 'medium' && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  priorityStyle.bgColor,
                  priorityStyle.color,
                )}
              >
                {notification.priority}
              </span>
            )}

            {/* Unread indicator */}
            {!notification.is_read && <div className="h-2 w-2 rounded-full bg-blue-500"></div>}

            {/* Type badge */}
            <span className="text-xs text-muted-foreground">{template.description}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
