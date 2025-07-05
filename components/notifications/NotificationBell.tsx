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
                "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center",
                "rounded-full bg-red-500 text-[10px] font-bold text-white",
                "animate-in zoom-in-50 duration-200"
              )}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        className="w-[400px] max-h-[600px] overflow-hidden p-0"
      >
        <NotificationList />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}