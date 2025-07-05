'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createClient } from '@/utils/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Bell, BellOff } from 'lucide-react';
import type { NotificationPreference, NotificationType } from '@/lib/types/notifications';
import { useServiceWorker } from '@/hooks/useServiceWorker';

const notificationTypes: { type: NotificationType; label: string; description: string }[] = [
  {
    type: 'system',
    label: 'System Notifications',
    description: 'Important system updates and maintenance alerts (cannot be disabled)',
  },
  {
    type: 'organization_added',
    label: 'Organization Invitations',
    description: 'When you are added to an organization',
  },
  {
    type: 'project_added',
    label: 'Project Invitations',
    description: 'When you are added to a project',
  },
  {
    type: 'task_assigned',
    label: 'Task Assignments',
    description: 'When a task is assigned to you',
  },
  {
    type: 'task_updated',
    label: 'Task Updates',
    description: 'When a task you are assigned to is updated',
  },
  {
    type: 'task_comment',
    label: 'Task Comments',
    description: 'When someone comments on your tasks',
  },
  {
    type: 'comment_mention',
    label: 'Mentions',
    description: 'When you are mentioned in a comment',
  },
  {
    type: 'approval_requested',
    label: 'Approval Requests',
    description: 'When someone requests your approval',
  },
  {
    type: 'approval_status_changed',
    label: 'Approval Status Updates',
    description: 'When your approval requests are updated',
  },
];

export default function NotificationPreferencesPage() {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Record<NotificationType, NotificationPreference>>({} as any);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();
  const { 
    isSupported: isPushSupported, 
    isSubscribed, 
    subscribeToPush, 
    unsubscribeFromPush,
    permissionState 
  } = useServiceWorker();

  useEffect(() => {
    loadPreferences();
  }, [user]);

  const loadPreferences = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

      // Create a map of preferences by type
      const prefsMap: Record<string, NotificationPreference> = {};
      
      // Initialize with defaults for all types
      notificationTypes.forEach(({ type }) => {
        prefsMap[type] = {
          id: '',
          user_id: user.id,
          type,
          email_enabled: true,
          push_enabled: true,
          in_app_enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      });

      // Override with saved preferences
      data?.forEach((pref: any) => {
        prefsMap[pref.type] = pref;
      });

      setPreferences(prefsMap as Record<NotificationType, NotificationPreference>);
    } catch (error) {
      console.error('Error loading preferences:', error);
      toast.error('Failed to load notification preferences');
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = async (
    type: NotificationType,
    channel: 'email_enabled' | 'push_enabled' | 'in_app_enabled',
    value: boolean
  ) => {
    if (!user) return;

    // System notifications cannot be disabled
    if (type === 'system' && !value) {
      toast.error('System notifications cannot be disabled');
      return;
    }

    setIsSaving(true);
    try {
      const existingPref = preferences[type];
      
      // Prepare the updated preference
      const updatedPref = {
        ...existingPref,
        [channel]: value,
        updated_at: new Date().toISOString(),
      };

      // Upsert the preference
      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.id,
          type,
          email_enabled: updatedPref.email_enabled,
          push_enabled: updatedPref.push_enabled,
          in_app_enabled: updatedPref.in_app_enabled,
        }, {
          onConflict: 'user_id,type',
        });

      if (error) throw error;

      // Update local state
      setPreferences((prev: Record<NotificationType, NotificationPreference>) => ({
        ...prev,
        [type]: updatedPref,
      }));

      toast.success('Preference updated');
    } catch (error) {
      console.error('Error updating preference:', error);
      toast.error('Failed to update preference');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Notification Preferences</h1>
        <p className="text-muted-foreground mt-2">
          Manage how you receive notifications for different events
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notification Types</CardTitle>
          <CardDescription>
            Choose how you want to be notified for each type of event
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {notificationTypes.map(({ type, label, description }) => {
            const pref = preferences[type];
            const isSystem = type === 'system';
            
            return (
              <div key={type} className="space-y-4 border-b pb-6 last:border-0">
                <div>
                  <h3 className="font-medium">{label}</h3>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${type}-in-app`}
                      checked={pref?.in_app_enabled ?? true}
                      onCheckedChange={(checked) => updatePreference(type, 'in_app_enabled', checked)}
                      disabled={isSaving || isSystem}
                    />
                    <Label htmlFor={`${type}-in-app`} className="cursor-pointer">
                      In-App
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${type}-email`}
                      checked={pref?.email_enabled ?? true}
                      onCheckedChange={(checked) => updatePreference(type, 'email_enabled', checked)}
                      disabled={isSaving || isSystem}
                    />
                    <Label htmlFor={`${type}-email`} className="cursor-pointer">
                      Email
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id={`${type}-push`}
                      checked={pref?.push_enabled ?? true}
                      onCheckedChange={(checked) => updatePreference(type, 'push_enabled', checked)}
                      disabled={isSaving || isSystem}
                    />
                    <Label htmlFor={`${type}-push`} className="cursor-pointer">
                      Push
                    </Label>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Browser Notifications</CardTitle>
          <CardDescription>
            Enable browser notifications to receive alerts even when the app is not open
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Browser Notifications</Label>
              <p className="text-sm text-muted-foreground">
                {permissionState === 'granted' 
                  ? 'Permission granted' 
                  : permissionState === 'denied'
                  ? 'Permission denied - please enable in browser settings'
                  : 'Click to enable browser notifications'}
              </p>
            </div>
            <Button
              variant={permissionState === 'granted' ? 'secondary' : 'default'}
              onClick={() => {
                if (window.Notification && window.Notification.permission === 'default') {
                  window.Notification.requestPermission().then((permission) => {
                    if (permission === 'granted') {
                      toast.success('Browser notifications enabled');
                    } else {
                      toast.error('Browser notifications were not enabled');
                    }
                  });
                } else if (window.Notification && window.Notification.permission === 'granted') {
                  toast.info('Browser notifications are already enabled');
                } else {
                  toast.error('Your browser does not support notifications');
                }
              }}
              disabled={permissionState === 'denied'}
            >
              {permissionState === 'granted' ? (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Enabled
                </>
              ) : (
                <>
                  <BellOff className="h-4 w-4 mr-2" />
                  Enable Notifications
                </>
              )}
            </Button>
          </div>

          {isPushSupported && permissionState === 'granted' && (
            <div className="flex items-center justify-between pt-4 border-t">
              <div className="space-y-1">
                <Label>Push Notifications</Label>
                <p className="text-sm text-muted-foreground">
                  {isSubscribed 
                    ? 'Receive notifications even when the browser is closed' 
                    : 'Enable push notifications for this device'}
                </p>
              </div>
              <Switch
                checked={isSubscribed}
                onCheckedChange={(checked) => {
                  if (checked) {
                    subscribeToPush();
                  } else {
                    unsubscribeFromPush();
                  }
                }}
              />
            </div>
          )}

          {!isPushSupported && (
            <div className="text-sm text-muted-foreground">
              Push notifications are not supported in your browser
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}