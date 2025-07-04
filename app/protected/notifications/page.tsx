'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { notificationAPI } from '@/lib/api/notifications';
import { useNotifications } from '@/contexts/NotificationContext';
import { NotificationType, NotificationPriority } from '@/lib/types/notification';

export default function NotificationsTestPage() {
  const [isCreating, setIsCreating] = useState(false);
  const { notifications, unreadCount, refresh } = useNotifications();

  const createSampleNotification = async (
    type: NotificationType,
    priority: NotificationPriority = 'medium',
  ) => {
    setIsCreating(true);
    try {
      const notificationData = {
        type,
        title: getNotificationTitle(type),
        message: getNotificationMessage(type),
        priority,
        recipient_user_ids: [], // System-wide notification
        metadata: { test: true },
        action_url: '/protected/notifications',
      };

      await notificationAPI.createNotification(notificationData);
      await refresh(); // Refresh to see the new notification
    } catch (error) {
      console.error('Failed to create notification:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const getNotificationTitle = (type: NotificationType): string => {
    const titles = {
      system_announcement: '🚀 New Feature Available',
      approval_request: '📋 Approval Required',
      approval_status_update: '✅ Approval Status Updated',
      task_assignment: '📌 New Task Assigned',
      task_status_update: '🔄 Task Status Changed',
      organization_invitation: '🏢 Organization Invitation',
      project_invitation: '📁 Project Invitation',
      form_submission: '📄 Form Submission',
      site_diary_submission: '📖 Site Diary Entry',
      comment_mention: '💬 You were mentioned',
      due_date_reminder: '⏰ Due Date Reminder',
    };
    return titles[type];
  };

  const getNotificationMessage = (type: NotificationType): string => {
    const messages = {
      system_announcement:
        "We've added a new notification system to keep you updated on important events.",
      approval_request:
        'A new approval request requires your attention. Please review and respond.',
      approval_status_update:
        'Your approval request has been reviewed and a decision has been made.',
      task_assignment: 'You have been assigned a new task. Check the details and get started.',
      task_status_update: 'The status of one of your tasks has been updated to "In Progress".',
      organization_invitation:
        'You have been invited to join the "ACME Construction" organization.',
      project_invitation: 'You have been invited to collaborate on the "Office Building" project.',
      form_submission: 'A new form submission has been received and is ready for review.',
      site_diary_submission: 'A new site diary entry has been submitted for your project.',
      comment_mention: 'Someone mentioned you in a comment on the task "Fix foundation issues".',
      due_date_reminder: 'The task "Complete safety inspection" is due tomorrow.',
    };
    return messages[type];
  };

  return (
    <div className="container mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notification System Test</h1>
        <p className="text-muted-foreground">
          Test the notification system by creating sample notifications.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Test Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Create Test Notifications</CardTitle>
            <CardDescription>
              Click the buttons below to create sample notifications of different types.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <h4 className="font-medium">System Notifications</h4>
              <div className="grid gap-2">
                <Button
                  onClick={() => createSampleNotification('system_announcement', 'high')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  System Announcement
                </Button>
                <Button
                  onClick={() => createSampleNotification('due_date_reminder', 'urgent')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Due Date Reminder
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <h4 className="font-medium">Task Notifications</h4>
              <div className="grid gap-2">
                <Button
                  onClick={() => createSampleNotification('task_assignment', 'medium')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Task Assignment
                </Button>
                <Button
                  onClick={() => createSampleNotification('task_status_update', 'low')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Task Status Update
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <h4 className="font-medium">Approval Notifications</h4>
              <div className="grid gap-2">
                <Button
                  onClick={() => createSampleNotification('approval_request', 'high')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Approval Request
                </Button>
                <Button
                  onClick={() => createSampleNotification('approval_status_update', 'medium')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Approval Status Update
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <h4 className="font-medium">Other Notifications</h4>
              <div className="grid gap-2">
                <Button
                  onClick={() => createSampleNotification('comment_mention', 'medium')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Comment Mention
                </Button>
                <Button
                  onClick={() => createSampleNotification('organization_invitation', 'medium')}
                  disabled={isCreating}
                  variant="outline"
                  className="justify-start"
                >
                  Organization Invitation
                </Button>
              </div>
            </div>

            {isCreating && (
              <div className="flex items-center justify-center p-4">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                <span className="ml-2 text-sm">Creating notification...</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Notification Stats */}
        <Card>
          <CardHeader>
            <CardTitle>Notification Stats</CardTitle>
            <CardDescription>Current notification status for your account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Notifications:</span>
                <span className="text-lg font-bold">{notifications.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Unread Count:</span>
                <span className="text-lg font-bold text-red-500">{unreadCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Read Count:</span>
                <span className="text-lg font-bold text-green-500">
                  {notifications.length - unreadCount}
                </span>
              </div>
            </div>

            <Button onClick={refresh} variant="outline" className="w-full">
              Refresh Notifications
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Notifications Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Notifications</CardTitle>
          <CardDescription>Preview of your latest notifications (first 5).</CardDescription>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No notifications yet. Create some test notifications above to see them here.
            </p>
          ) : (
            <div className="space-y-3">
              {notifications.slice(0, 5).map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-lg border p-3 ${
                    !notification.is_read
                      ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/20'
                      : 'bg-muted/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium">{notification.title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">{notification.message}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="rounded bg-primary/10 px-2 py-1 text-xs text-primary">
                          {notification.type}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {notification.priority}
                        </span>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <div className="ml-2 mt-1 h-2 w-2 rounded-full bg-blue-500"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
