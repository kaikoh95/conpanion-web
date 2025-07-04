'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, Settings, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/contexts/NotificationContext';
import { NotificationList } from './NotificationList';
import { NotificationEmpty } from './NotificationEmpty';
import { NotificationBadge } from './NotificationBadge';
import { formatNotificationTime } from '@/lib/types/notification';
import { useRouter } from 'next/navigation';

interface NotificationDropdownProps {
  className?: string;
}

export function NotificationDropdown({ className }: NotificationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  const { notifications, unreadCount, isLoading, markAllAsRead, loadNotifications, refresh } =
    useNotifications();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Load notifications when dropdown opens
  useEffect(() => {
    if (isOpen && notifications.length === 0) {
      loadNotifications();
    }
  }, [isOpen, notifications.length, loadNotifications]);

  const handleToggle = () => {
    setIsOpen(!isOpen);
  };

  const handleSettingsClick = () => {
    setIsOpen(false);
    router.push('/protected/settings/notifications');
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const handleRefresh = async () => {
    try {
      await refresh();
    } catch (error) {
      console.error('Failed to refresh notifications:', error);
    }
  };

  const handleLoadMore = async () => {
    try {
      await loadNotifications(20, notifications.length);
    } catch (error) {
      console.error('Failed to load more notifications:', error);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Notification Button */}
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="relative hover:bg-muted/50"
        onClick={handleToggle}
      >
        <Bell className="h-5 w-5" />
        <NotificationBadge count={unreadCount} />
        <span className="sr-only">
          Notifications {unreadCount > 0 && `(${unreadCount} unread)`}
        </span>
      </Button>

      {/* Dropdown */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-sm rounded-lg border bg-background/95 shadow-lg backdrop-blur-sm md:w-96"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">Notifications</h3>
              {unreadCount > 0 && <NotificationBadge count={unreadCount} size="sm" />}
            </div>
            <div className="flex items-center gap-1">
              {/* Mark All Read Button */}
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  className="h-8 px-2 text-xs"
                >
                  <CheckCheck className="mr-1 h-3 w-3" />
                  Mark all read
                </Button>
              )}

              {/* Settings Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSettingsClick}
                className="h-8 w-8"
              >
                <Settings className="h-4 w-4" />
                <span className="sr-only">Notification settings</span>
              </Button>

              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close notifications</span>
              </Button>
            </div>
          </div>



          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {isLoading && notifications.length === 0 ? (
              <div className="flex items-center justify-center p-8">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : notifications.length === 0 ? (
              <NotificationEmpty />
            ) : (
              <NotificationList
                notifications={notifications}
                onLoadMore={handleLoadMore}
                hasMore={notifications.length >= 20} // Simple check, could be improved
                isLoading={isLoading}
              />
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
                  {unreadCount > 0 && ` • ${unreadCount} unread`}
                </span>
                <button onClick={handleRefresh} className="hover:text-primary" disabled={isLoading}>
                  {isLoading ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
