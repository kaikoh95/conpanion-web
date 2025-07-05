'use client';

import { Bell } from 'lucide-react';
import { useNotifications } from '@/providers/NotificationProvider';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationList } from './NotificationList';
import { cn } from '@/lib/utils';

export function NotificationBell() {
  const { unreadCount } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center',
                'rounded-full bg-red-500 text-[10px] font-bold text-white',
                'duration-200 animate-in zoom-in-50',
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="h-[70vh] max-h-[600px] w-[calc(100vw-2rem)] max-w-[400px] overflow-hidden p-0 sm:w-[400px]"
        sideOffset={8}
      >
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
