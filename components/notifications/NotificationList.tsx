'use client';

import { useNotifications } from '@/providers/NotificationProvider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { NotificationItem } from './NotificationItem';
import { Loader2, BellOff, Settings } from 'lucide-react';
import Link from 'next/link';

export function NotificationList() {
  const { notifications, isLoading, markAllAsRead, unreadCount } = useNotifications();

  return (
    <div className="flex h-full flex-col">
      {/* Header - Mobile optimized */}
      <div className="flex items-center justify-between border-b p-3 sm:p-4">
        <h3 className="truncate text-lg font-semibold">Notifications</h3>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 flex-shrink-0">
            <Link href="/protected/settings/notifications">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Notification settings</span>
            </Link>
          </Button>
          {unreadCount > 0 && (
            <>
              {/* Desktop version */}
              <Button
                variant="ghost"
                size="sm"
                onClick={markAllAsRead}
                className="hidden whitespace-nowrap text-xs sm:inline-flex"
              >
                Mark all as read
              </Button>
              {/* Mobile version */}
              <Button
                variant="ghost"
                size="icon"
                onClick={markAllAsRead}
                className="h-8 w-8 sm:hidden"
                title="Mark all as read"
              >
                <span className="text-xs">✓</span>
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content Area */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center sm:p-8">
            <BellOff className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No notifications yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You'll see notifications here when you get them
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t p-3">
          <Button variant="ghost" size="sm" className="w-full text-xs" asChild>
            <Link href="/protected/notifications">View all notifications</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
