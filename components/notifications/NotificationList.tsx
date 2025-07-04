'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { NotificationWithReadStatus, groupNotificationsByDate } from '@/lib/types/notification';
import { NotificationItem } from './NotificationItem';

interface NotificationListProps {
  notifications: NotificationWithReadStatus[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

export function NotificationList({
  notifications,
  onLoadMore,
  hasMore = false,
  isLoading = false,
}: NotificationListProps) {
  // Group notifications by date for better organization
  const groupedNotifications = groupNotificationsByDate(notifications);
  const dateGroups = Object.keys(groupedNotifications).sort((a, b) => {
    // Sort to have "Today" first, then "Yesterday", then dates
    if (a === 'Today') return -1;
    if (b === 'Today') return 1;
    if (a === 'Yesterday') return -1;
    if (b === 'Yesterday') return 1;
    return new Date(b).getTime() - new Date(a).getTime();
  });

  return (
    <div className="divide-y">
      {dateGroups.map((dateGroup) => (
        <div key={dateGroup}>
          {/* Date Header */}
          <div className="sticky top-0 bg-background/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            {dateGroup}
          </div>

          {/* Notifications for this date */}
          <div className="divide-y">
            {groupedNotifications[dateGroup].map((notification) => (
              <NotificationItem key={notification.id} notification={notification} />
            ))}
          </div>
        </div>
      ))}

      {/* Load More Button */}
      {hasMore && onLoadMore && (
        <div className="p-4">
          <Button variant="ghost" onClick={onLoadMore} disabled={isLoading} className="w-full">
            {isLoading ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current"></div>
                Loading...
              </>
            ) : (
              'Load more notifications'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
