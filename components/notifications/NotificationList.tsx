'use client';

import { useNotifications } from '@/providers/NotificationProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { NotificationItem } from './NotificationItem';
import { Loader2, BellOff } from 'lucide-react';

export function NotificationList() {
  const { notifications, isLoading, markAllAsRead, unreadCount } = useNotifications();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="text-lg font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="text-xs"
          >
            Mark all as read
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <BellOff className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              You'll see notifications here when you get them
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem 
                key={notification.id} 
                notification={notification} 
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {notifications.length > 0 && (
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            asChild
          >
            <a href="/notifications">View all notifications</a>
          </Button>
        </div>
      )}
    </div>
  );
}