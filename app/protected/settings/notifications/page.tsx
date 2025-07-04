'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Bell,
  Mail,
  Moon,
  Clock,
  Volume2,
  Settings,
  TestTube,
  Save,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Megaphone,
  CheckSquare,
  UserPlus,
  Activity,
  Building,
  FolderPlus,
  FileText,
  Book,
  AtSign,
  CalendarClock,
} from 'lucide-react';
import { useNotifications } from '@/contexts/NotificationContext';
import { notificationAPI } from '@/lib/api/notifications';
import {
  NOTIFICATION_TEMPLATES,
  NotificationType,
  UpdateNotificationPreferencesRequest,
} from '@/lib/types/notification';
import { cn } from '@/lib/utils';

// Icon mapping for notification types
const notificationIcons: Record<NotificationType, React.ElementType> = {
  system_announcement: Megaphone,
  approval_request: CheckSquare,
  approval_status_update: CheckCircle,
  task_assignment: UserPlus,
  task_status_update: Activity,
  organization_invitation: Building,
  project_invitation: FolderPlus,
  form_submission: FileText,
  site_diary_submission: Book,
  comment_mention: AtSign,
  due_date_reminder: CalendarClock,
};

export default function NotificationSettingsPage() {
  const { preferences, updatePreferences, refresh } = useNotifications();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Local state for form
  const [localPreferences, setLocalPreferences] = useState({
    notifications_enabled: true,
    email_notifications: true,
    push_notifications: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
    timezone: 'UTC',
    type_preferences: {} as Record<string, boolean>,
  });

  // Load preferences on mount
  useEffect(() => {
    if (preferences) {
      setLocalPreferences({
        notifications_enabled: preferences.notifications_enabled ?? true,
        email_notifications: preferences.email_notifications ?? true,
        push_notifications: preferences.push_notifications ?? true,
        quiet_hours_enabled: preferences.quiet_hours_enabled ?? false,
        quiet_hours_start: preferences.quiet_hours_start ?? '22:00',
        quiet_hours_end: preferences.quiet_hours_end ?? '07:00',
        timezone: preferences.timezone ?? 'UTC',
        type_preferences: (preferences.type_preferences as Record<string, boolean>) ?? {},
      });
    }
  }, [preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    try {
      const updateData: UpdateNotificationPreferencesRequest = {
        notifications_enabled: localPreferences.notifications_enabled,
        email_notifications: localPreferences.email_notifications,
        push_notifications: localPreferences.push_notifications,
        quiet_hours_enabled: localPreferences.quiet_hours_enabled,
        quiet_hours_start: localPreferences.quiet_hours_start,
        quiet_hours_end: localPreferences.quiet_hours_end,
        timezone: localPreferences.timezone,
        type_preferences: localPreferences.type_preferences,
      };

      await updatePreferences(updateData);
      setSaveStatus('success');

      // Clear success message after 3 seconds
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save notification preferences:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      await notificationAPI.createNotification({
        type: 'system_announcement',
        title: '🔔 Test Notification',
        message: 'This is a test notification to verify your settings are working correctly.',
        priority: 'medium',
        recipient_user_ids: [], // System-wide
        metadata: { test: true },
        action_url: '/protected/settings/notifications',
      });

      // Refresh notifications to show the new one
      await refresh();
    } catch (error) {
      console.error('Failed to send test notification:', error);
    } finally {
      setIsTesting(false);
    }
  };

  const handleTypePreferenceChange = (type: NotificationType, enabled: boolean) => {
    setLocalPreferences((prev) => ({
      ...prev,
      type_preferences: {
        ...prev.type_preferences,
        [type]: enabled,
      },
    }));
  };

  const isTypeEnabled = (type: NotificationType): boolean => {
    return localPreferences.type_preferences[type] ?? true; // Default to enabled
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Notification Settings</h1>
          <p className="text-muted-foreground">Configure how and when you receive notifications</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleTestNotification} disabled={isTesting} variant="outline" size="sm">
            {isTesting ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <TestTube className="mr-2 h-4 w-4" />
            )}
            Test Notification
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
            className={cn(
              saveStatus === 'success' && 'bg-green-600 hover:bg-green-700',
              saveStatus === 'error' && 'bg-red-600 hover:bg-red-700',
            )}
          >
            {isSaving ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : saveStatus === 'success' ? (
              <CheckCircle className="mr-2 h-4 w-4" />
            ) : saveStatus === 'error' ? (
              <AlertCircle className="mr-2 h-4 w-4" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            {saveStatus === 'success'
              ? 'Saved!'
              : saveStatus === 'error'
                ? 'Failed'
                : 'Save Changes'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-3">
        {/* Global Settings */}
        <div className="space-y-6 lg:col-span-2">
          {/* General Notification Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-950">
                  <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>General Settings</CardTitle>
                  <CardDescription>Control your overall notification preferences</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Master Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Enable Notifications</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications in the application
                  </p>
                </div>
                <Switch
                  checked={localPreferences.notifications_enabled}
                  onCheckedChange={(checked) =>
                    setLocalPreferences((prev) => ({ ...prev, notifications_enabled: checked }))
                  }
                />
              </div>

              <Separator />

              {/* Email Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                </div>
                <Switch
                  checked={localPreferences.email_notifications}
                  onCheckedChange={(checked) =>
                    setLocalPreferences((prev) => ({ ...prev, email_notifications: checked }))
                  }
                  disabled={!localPreferences.notifications_enabled}
                />
              </div>

              {/* Push Notifications */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Volume2 className="h-4 w-4 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <Label className="text-base font-medium">Push Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive browser push notifications
                    </p>
                  </div>
                </div>
                <Switch
                  checked={localPreferences.push_notifications}
                  onCheckedChange={(checked) =>
                    setLocalPreferences((prev) => ({ ...prev, push_notifications: checked }))
                  }
                  disabled={!localPreferences.notifications_enabled}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quiet Hours */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-950">
                  <Moon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <CardTitle>Quiet Hours</CardTitle>
                  <CardDescription>
                    Set specific hours when you don't want to receive notifications
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-base font-medium">Enable Quiet Hours</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically pause notifications during specified hours
                  </p>
                </div>
                <Switch
                  checked={localPreferences.quiet_hours_enabled}
                  onCheckedChange={(checked) =>
                    setLocalPreferences((prev) => ({ ...prev, quiet_hours_enabled: checked }))
                  }
                  disabled={!localPreferences.notifications_enabled}
                />
              </div>

              {localPreferences.quiet_hours_enabled && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <input
                      type="time"
                      value={localPreferences.quiet_hours_start}
                      onChange={(e) =>
                        setLocalPreferences((prev) => ({
                          ...prev,
                          quiet_hours_start: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <input
                      type="time"
                      value={localPreferences.quiet_hours_end}
                      onChange={(e) =>
                        setLocalPreferences((prev) => ({
                          ...prev,
                          quiet_hours_end: e.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notification Types */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-green-50 p-2 dark:bg-green-950">
                  <Settings className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>Notification Types</CardTitle>
                  <CardDescription>
                    Choose which types of notifications you want to receive
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.values(NOTIFICATION_TEMPLATES).map((template) => {
                  const IconComponent = notificationIcons[template.type];
                  return (
                    <div key={template.type} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'rounded-lg p-2',
                            `bg-${template.color}-50 dark:bg-${template.color}-950`,
                          )}
                        >
                          <IconComponent
                            className={cn(
                              'h-4 w-4',
                              `text-${template.color}-600 dark:text-${template.color}-400`,
                            )}
                          />
                        </div>
                        <div>
                          <div className="font-medium capitalize">
                            {template.type.replace(/_/g, ' ')}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {template.description}
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={isTypeEnabled(template.type)}
                        onCheckedChange={(checked) =>
                          handleTypePreferenceChange(template.type, checked)
                        }
                        disabled={!localPreferences.notifications_enabled}
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={localPreferences.notifications_enabled ? 'default' : 'secondary'}>
                  {localPreferences.notifications_enabled ? 'Enabled' : 'Disabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <Badge variant={localPreferences.email_notifications ? 'default' : 'secondary'}>
                  {localPreferences.email_notifications ? 'On' : 'Off'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Quiet Hours</span>
                <Badge variant={localPreferences.quiet_hours_enabled ? 'default' : 'secondary'}>
                  {localPreferences.quiet_hours_enabled ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Types Enabled</span>
                <Badge variant="outline">
                  {Object.values(localPreferences.type_preferences).filter(Boolean).length}/
                  {Object.keys(NOTIFICATION_TEMPLATES).length}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Help */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Need Help?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Configure your notification preferences to stay informed about important updates.
              </p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Quiet hours respect your timezone</span>
                </div>
                <div className="flex items-center gap-2">
                  <Bell className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Test notifications help verify settings
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Email notifications include action links
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setLocalPreferences((prev) => ({
                    ...prev,
                    type_preferences: Object.keys(NOTIFICATION_TEMPLATES).reduce(
                      (acc, key) => ({
                        ...acc,
                        [key]: true,
                      }),
                      {},
                    ),
                  }));
                }}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Enable All Types
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  setLocalPreferences((prev) => ({
                    ...prev,
                    type_preferences: {},
                  }));
                }}
              >
                <AlertCircle className="mr-2 h-4 w-4" />
                Disable All Types
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
