'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Loader2, BellOff, Filter } from 'lucide-react';
import { toast } from 'sonner';
import type { Notification, NotificationType, NotificationPriority } from '@/lib/types/notifications';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ITEMS_PER_PAGE = 20;

export default function AllNotificationsPage() {
  const { user } = useAuth();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [filterType, setFilterType] = useState<NotificationType | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<NotificationPriority | 'all'>('all');
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all');

  useEffect(() => {
    loadNotifications(true);
  }, [user, filterType, filterPriority, filterRead]);

  const loadNotifications = async (reset = false) => {
    if (!user) return;

    try {
      setIsLoading(true);
      
      let query = supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(
          reset ? 0 : page * ITEMS_PER_PAGE,
          reset ? ITEMS_PER_PAGE - 1 : (page + 1) * ITEMS_PER_PAGE - 1
        );

      // Apply filters
      if (filterType !== 'all') {
        query = query.eq('type', filterType);
      }
      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }
      if (filterRead !== 'all') {
        query = query.eq('is_read', filterRead === 'read');
      }

      const { data, error } = await query;

      if (error) throw error;

      if (reset) {
        setNotifications(data || []);
        setPage(0);
      } else {
        setNotifications((prev) => [...prev, ...(data || [])]);
      }

      setHasMore((data?.length || 0) === ITEMS_PER_PAGE);
    } catch (error) {
      console.error('Error loading notifications:', error);
      toast.error('Failed to load notifications');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMore = () => {
    setPage((prev) => prev + 1);
    loadNotifications(false);
  };

  const markAllAsRead = async () => {
    if (!user) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_read: true, 
          read_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .eq('is_read', false);

      if (error) throw error;

      // Update local state
      setNotifications((prev) => 
        prev.map((n) => ({ ...n, is_read: true }))
      );
      
      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error('Failed to mark all as read');
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notifications</h1>
          <p className="text-muted-foreground mt-2">
            All your notifications in one place
          </p>
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            Mark all as read ({unreadCount})
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <Select value={filterType} onValueChange={(value: any) => setFilterType(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="system">System</SelectItem>
              <SelectItem value="task_assigned">Task Assigned</SelectItem>
              <SelectItem value="task_updated">Task Updated</SelectItem>
              <SelectItem value="task_comment">Comments</SelectItem>
              <SelectItem value="approval_requested">Approvals</SelectItem>
              <SelectItem value="project_added">Projects</SelectItem>
              <SelectItem value="organization_added">Organizations</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterPriority} onValueChange={(value: any) => setFilterPriority(value)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterRead} onValueChange={(value: any) => setFilterRead(value)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
              <SelectItem value="read">Read</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Notifications List */}
      <Card className="p-0">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center p-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <BellOff className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">No notifications found</p>
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your filters or check back later
            </p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem 
                  key={notification.id} 
                  notification={notification} 
                />
              ))}
            </div>
            
            {hasMore && (
              <div className="p-4 text-center border-t">
                <Button
                  onClick={loadMore}
                  variant="outline"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Loading...
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}