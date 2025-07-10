'use client';

import { formatDistanceToNow } from 'date-fns';
import { useNotifications } from '@/providers/NotificationProvider';
import type { Notification } from '@/lib/types/notifications';
import { notificationIcons, priorityColors } from '@/lib/types/notifications';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

interface NotificationItemProps {
  notification: Notification;
}

export function NotificationItem({ notification }: NotificationItemProps) {
  const { markAsRead } = useNotifications();
  const router = useRouter();

  const handleClick = async () => {
    // Mark as read if unread
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }

    // Navigate to entity if applicable
    const entityPath = getEntityPath(notification);
    if (entityPath) {
      router.push(entityPath);
    }
  };

  const icon = notificationIcons[notification.type] || '🔔';
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), {
    addSuffix: true,
  });

  return (
    <Button
      variant="ghost"
      className={cn(
        'h-auto w-full justify-start px-3 py-3 text-left hover:bg-muted/50',
        'flex min-h-[80px] items-start gap-3 transition-colors',
        !notification.is_read && 'bg-muted/30',
      )}
      onClick={handleClick}
    >
      <div className="mt-1 flex-shrink-0">
        <span className="text-xl">{icon}</span>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        <p
          className={cn(
            'text-sm font-medium leading-tight',
            !notification.is_read && 'font-semibold',
          )}
        >
          {notification.title}
        </p>
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {notification.message}
        </p>
        <div className="flex items-center justify-between">
          <span className={cn('text-[10px]', priorityColors[notification.priority])}>
            {notification.priority === 'critical' && '● '}
            {timeAgo}
          </span>
        </div>
      </div>

      {!notification.is_read && (
        <div className="mt-2 flex-shrink-0">
          <div className="h-2 w-2 rounded-full bg-blue-500" />
        </div>
      )}
    </Button>
  );
}

// Helper function to get entity path
function getEntityPath(notification: Notification): string | null {
  const { entity_type, entity_id, data } = notification;

  if (!entity_type || !entity_id) return null;

  switch (entity_type) {
    case 'task':
      return `/protected/tasks/${entity_id}`;
    case 'project':
      return `/protected/projects/${entity_id}`;
    case 'organization':
      return `/protected/organizations/${entity_id}`;
    case 'approval':
      return `/protected/approvals/${entity_id}`;
    case 'task_comment':
      return data?.task_id ? `/protected/tasks/${data.task_id}#comment-${entity_id}` : null;
    default:
      return null;
  }
}
