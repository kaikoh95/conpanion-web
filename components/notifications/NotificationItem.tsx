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
    addSuffix: true 
  });

  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start px-4 py-3 h-auto hover:bg-muted/50",
        "flex items-start gap-3 transition-colors",
        !notification.is_read && "bg-muted/30"
      )}
      onClick={handleClick}
    >
      <div className="flex-shrink-0 mt-1">
        <span className="text-xl">{icon}</span>
      </div>
      <div className="flex-1 text-left space-y-1">
        <p className={cn(
          "text-sm font-medium",
          !notification.is_read && "font-semibold"
        )}>
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-[10px]",
            priorityColors[notification.priority]
          )}>
            {notification.priority === 'critical' && '● '}
            {timeAgo}
          </span>
        </div>
      </div>
      {!notification.is_read && (
        <div className="flex-shrink-0 mt-2">
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