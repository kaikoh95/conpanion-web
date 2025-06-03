'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { User, Save, Mail, Globe, Clock, Languages, AlertCircle, CheckCircle } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/organization';

export default function ProfileSettingsPage() {
  const { user, refreshUser } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    global_display_name: '',
    global_avatar_url: '',
    preferred_timezone: 'UTC',
    preferred_language: 'en',
  });

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load user profile data
  useEffect(() => {
    const supabase = getSupabaseClient();
    const loadProfile = async () => {
      if (!user?.id) return;

      try {
        setIsLoading(true);

        const { data: profileData, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error loading profile:', error);
          setSaveMessage({
            type: 'error',
            text: 'Failed to load profile data. Please try again.',
          });
          return;
        }

        if (profileData) {
          setProfile(profileData);
          setFormData({
            first_name: profileData.first_name || '',
            last_name: profileData.last_name || '',
            global_display_name: profileData.global_display_name || '',
            global_avatar_url: profileData.global_avatar_url || '',
            preferred_timezone: profileData.preferred_timezone || 'UTC',
            preferred_language: profileData.preferred_language || 'en',
          });
        }
      } catch (error) {
        console.error('Error loading profile:', error);
        setSaveMessage({
          type: 'error',
          text: 'Failed to load profile data. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [user?.id]);

  // Clear save message after 5 seconds
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => {
        setSaveMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // First name validation
    if (formData.first_name.trim() && formData.first_name.length < 2) {
      newErrors.first_name = 'First name must be at least 2 characters';
    } else if (formData.first_name.length > 30) {
      newErrors.first_name = 'First name must be less than 30 characters';
    }

    // Last name validation
    if (formData.last_name.trim() && formData.last_name.length < 2) {
      newErrors.last_name = 'Last name must be at least 2 characters';
    } else if (formData.last_name.length > 30) {
      newErrors.last_name = 'Last name must be less than 30 characters';
    }

    if (!formData.global_display_name.trim()) {
      newErrors.global_display_name = 'Display name is required';
    } else if (formData.global_display_name.length < 2) {
      newErrors.global_display_name = 'Display name must be at least 2 characters';
    } else if (formData.global_display_name.length > 50) {
      newErrors.global_display_name = 'Display name must be less than 50 characters';
    }

    if (formData.global_avatar_url && !isValidUrl(formData.global_avatar_url)) {
      newErrors.global_avatar_url = 'Please enter a valid URL';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isValidUrl = (string: string): boolean => {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  };

  const handleSave = async () => {
    if (!user?.id) return;

    // Clear previous messages and errors
    setSaveMessage(null);
    setErrors({});

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      console.log('Saving profile...', formData);
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_profiles')
        .update({
          first_name: formData.first_name.trim() || null,
          last_name: formData.last_name.trim() || null,
          global_display_name: formData.global_display_name.trim(),
          global_avatar_url: formData.global_avatar_url.trim() || null,
          preferred_timezone: formData.preferred_timezone,
          preferred_language: formData.preferred_language,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        setSaveMessage({
          type: 'error',
          text: error.message || 'Failed to update profile. Please try again.',
        });
        return;
      }

      // Update local profile state
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              first_name: formData.first_name.trim() || null,
              last_name: formData.last_name.trim() || null,
              global_display_name: formData.global_display_name.trim(),
              global_avatar_url: formData.global_avatar_url.trim() || null,
              preferred_timezone: formData.preferred_timezone,
              preferred_language: formData.preferred_language,
            }
          : null,
      );

      // Refresh auth user data to reflect changes
      await refreshUser();

      // Show success message
      setSaveMessage({
        type: 'success',
        text: 'Profile updated successfully!',
      });
    } catch (error: any) {
      console.error('Failed to save profile:', error);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Failed to update profile. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (profile) {
      setFormData({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        global_display_name: profile.global_display_name || '',
        global_avatar_url: profile.global_avatar_url || '',
        preferred_timezone: profile.preferred_timezone || 'UTC',
        preferred_language: profile.preferred_language || 'en',
      });
      setErrors({});
      setSaveMessage(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <User className="h-6 w-6 flex-shrink-0 sm:h-8 sm:w-8" />
            <span>Profile Settings</span>
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            Manage your personal information and preferences
          </p>
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <Card className={saveMessage.type === 'error' ? 'border-destructive' : 'border-green-500'}>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              {saveMessage.type === 'error' ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
              <p className={saveMessage.type === 'error' ? 'text-destructive' : 'text-green-600'}>
                {saveMessage.text}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>Your account details and authentication info</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                value={user?.email || profile?.email || 'Not available'}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here. Contact support if needed.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-id">User ID</Label>
              <Input
                id="user-id"
                value={user?.id || 'Not available'}
                disabled
                className="bg-muted font-mono text-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Profile Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>Update your name, display name and avatar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* First and Last Name */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="first-name">First Name</Label>
              <Input
                id="first-name"
                value={formData.first_name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, first_name: e.target.value }));
                  // Clear error when user starts typing
                  if (errors.first_name) {
                    setErrors((prev) => ({ ...prev, first_name: '' }));
                  }
                }}
                className={errors.first_name ? 'border-destructive' : ''}
                placeholder="Enter your first name"
              />
              {errors.first_name && <p className="text-sm text-destructive">{errors.first_name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="last-name">Last Name</Label>
              <Input
                id="last-name"
                value={formData.last_name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, last_name: e.target.value }));
                  // Clear error when user starts typing
                  if (errors.last_name) {
                    setErrors((prev) => ({ ...prev, last_name: '' }));
                  }
                }}
                className={errors.last_name ? 'border-destructive' : ''}
                placeholder="Enter your last name"
              />
              {errors.last_name && <p className="text-sm text-destructive">{errors.last_name}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="display-name">Display Name *</Label>
              <Input
                id="display-name"
                value={formData.global_display_name}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, global_display_name: e.target.value }));
                  // Clear error when user starts typing
                  if (errors.global_display_name) {
                    setErrors((prev) => ({ ...prev, global_display_name: '' }));
                  }
                }}
                className={errors.global_display_name ? 'border-destructive' : ''}
                placeholder="Enter your display name"
              />
              {errors.global_display_name && (
                <p className="text-sm text-destructive">{errors.global_display_name}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatar-url">Avatar URL</Label>
              <Input
                id="avatar-url"
                value={formData.global_avatar_url}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, global_avatar_url: e.target.value }));
                  // Clear error when user starts typing
                  if (errors.global_avatar_url) {
                    setErrors((prev) => ({ ...prev, global_avatar_url: '' }));
                  }
                }}
                className={errors.global_avatar_url ? 'border-destructive' : ''}
                placeholder="https://example.com/avatar.jpg"
              />
              {errors.global_avatar_url && (
                <p className="text-sm text-destructive">{errors.global_avatar_url}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Optional: Link to your profile picture
              </p>
            </div>
          </div>

          {/* Avatar Preview */}
          {formData.global_avatar_url && isValidUrl(formData.global_avatar_url) && (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="h-12 w-12 overflow-hidden rounded-full bg-muted">
                <img
                  src={formData.global_avatar_url}
                  alt="Avatar preview"
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Avatar Preview</p>
                <p className="text-xs text-muted-foreground">This is how your avatar will appear</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Preferences
          </CardTitle>
          <CardDescription>Customize your experience and regional settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Select
                value={formData.preferred_timezone}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, preferred_timezone: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                  <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                  <SelectItem value="America/Chicago">Central Time (US & Canada)</SelectItem>
                  <SelectItem value="America/Denver">Mountain Time (US & Canada)</SelectItem>
                  <SelectItem value="America/Los_Angeles">Pacific Time (US & Canada)</SelectItem>
                  <SelectItem value="Europe/London">London</SelectItem>
                  <SelectItem value="Europe/Paris">Paris</SelectItem>
                  <SelectItem value="Europe/Berlin">Berlin</SelectItem>
                  <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                  <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                  <SelectItem value="Asia/Kolkata">Mumbai</SelectItem>
                  <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select
                value={formData.preferred_language}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, preferred_language: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                  <SelectItem value="it">Italiano</SelectItem>
                  <SelectItem value="pt">Português</SelectItem>
                  <SelectItem value="zh">中文</SelectItem>
                  <SelectItem value="ja">日本語</SelectItem>
                  <SelectItem value="ko">한국어</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization Context */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Organization Context
          </CardTitle>
          <CardDescription>Your current organization and context information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Current Organization</Label>
              <div className="rounded-md border bg-muted p-3">
                <p className="text-sm font-medium">
                  {user?.activeOrganizationId
                    ? `Organization ID: ${user.activeOrganizationId}`
                    : 'Not set'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Switch organizations in Organization Settings
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Current Project</Label>
              <div className="rounded-md border bg-muted p-3">
                <p className="text-sm font-medium">
                  {user?.activeProjectId ? `Project ID: ${user.activeProjectId}` : 'Not set'}
                </p>
                <p className="text-xs text-muted-foreground">Switch projects in Project Settings</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isSaving}
              className="w-full sm:w-auto"
            >
              Reset Changes
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.global_display_name.trim()}
              className="w-full sm:w-auto"
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
