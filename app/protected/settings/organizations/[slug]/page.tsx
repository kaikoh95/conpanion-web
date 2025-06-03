'use client';

import React, { useEffect, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Building2, Users, Settings, Save, ArrowLeft, Shield, Database } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Organization, OrganizationMembership } from '@/lib/types/organization';
import { organizationAPI } from '@/lib/api/organizations';

export default function OrganizationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { memberships, current, switchOrganization, updateOrganization } = useOrganization();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrganizationMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Form validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  const slug = params.slug as string;

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Organization name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Organization name must be at least 2 characters';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Organization name must be less than 50 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Clear save message after 5 seconds
  useEffect(() => {
    if (saveMessage) {
      const timer = setTimeout(() => {
        setSaveMessage(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveMessage]);

  useEffect(() => {
    const loadOrganization = async () => {
      const foundMembership = memberships.find((m) => m.organization.slug === slug);

      if (foundMembership) {
        setOrganization(foundMembership.organization);
        setMembership(foundMembership);
        setFormData({
          name: foundMembership.organization.name || '',
          description: foundMembership.organization.description || '',
        });

        // Load member count
        try {
          const members = await organizationAPI.getOrganizationMembers(
            foundMembership.organization_id,
          );
          setMemberCount(members.length);
        } catch (error) {
          console.error('Failed to load member count:', error);
        }
      } else {
        // Organization not found, redirect to organizations page
        router.push('/protected/settings/organizations');
      }
      setIsLoading(false);
    };

    if (memberships.length > 0) {
      loadOrganization();
    }
  }, [memberships, slug, router]);

  const handleSave = async () => {
    if (!organization) return;

    // Clear previous messages and errors
    setSaveMessage(null);
    setErrors({});

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      // Call the update organization API
      await updateOrganization(organization.id, {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
      });

      // Update local organization state
      setOrganization((prev) =>
        prev
          ? {
              ...prev,
              name: formData.name.trim(),
              description: formData.description?.trim() || null,
            }
          : null,
      );

      // Show success message
      setSaveMessage({
        type: 'success',
        text: 'Organization settings updated successfully!',
      });
    } catch (error: any) {
      console.error('Failed to save organization settings:', error);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Failed to save organization settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchToOrg = async () => {
    if (!organization || current?.id === organization.id) return;

    try {
      await switchOrganization(organization.id);
      alert('Switched to this organization!');
    } catch (error) {
      console.error('Failed to switch organization:', error);
      alert('Failed to switch organization');
    }
  };

  const canEdit = membership?.role === 'owner' || membership?.role === 'admin';

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading organization settings...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!organization || !membership) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Organization Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-destructive">
              The organization with slug "{slug}" was not found or you don't have access to it.
            </p>
            <Link href="/protected/settings/organizations">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Organizations
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href="/protected/settings/organizations">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="flex flex-col gap-2 text-2xl font-bold sm:flex-row sm:items-center sm:gap-2 sm:text-3xl">
                <div className="flex items-center gap-2">
                  <Building2 className="h-6 w-6 flex-shrink-0 sm:h-8 sm:w-8" />
                  <span className="truncate">{organization.name}</span>
                </div>
                {formData.name !== organization.name && (
                  <span className="text-sm font-normal text-muted-foreground">
                    (unsaved changes)
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Organization settings and configuration
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {current?.id !== organization.id && (
              <Button
                onClick={handleSwitchToOrg}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                Switch to This Org
              </Button>
            )}
            <Badge variant={current?.id === organization.id ? 'default' : 'outline'}>
              {current?.id === organization.id ? 'Current' : membership.role}
            </Badge>
          </div>
        </div>
      </div>

      {/* Quick Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Organization Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">{organization.slug}</div>
              <div className="text-xs text-muted-foreground">Slug</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">{membership.role}</div>
              <div className="text-xs text-muted-foreground">Your Role</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">{memberCount}</div>
              <div className="text-xs text-muted-foreground">Members</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">
                {organization.is_active ? 'Active' : 'Inactive'}
              </div>
              <div className="text-xs text-muted-foreground">Status</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            General Settings
          </CardTitle>
          <CardDescription>Basic organization information and configuration</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Organization Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, name: e.target.value }));
                // Clear error when user starts typing
                if (errors.name) {
                  setErrors((prev) => ({ ...prev, name: '' }));
                }
              }}
              disabled={!canEdit}
              className={errors.name ? 'border-destructive' : ''}
            />
            {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => {
                setFormData((prev) => ({ ...prev, description: e.target.value }));
                // Clear error when user starts typing
                if (errors.description) {
                  setErrors((prev) => ({ ...prev, description: '' }));
                }
              }}
              disabled={!canEdit}
              className={errors.description ? 'border-destructive' : ''}
              rows={3}
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
          </div>

          {/* Save Message */}
          {saveMessage && (
            <div
              className={`rounded-md border p-3 text-sm ${
                saveMessage.type === 'success'
                  ? 'border-green-200 bg-green-50 text-green-800'
                  : 'border-destructive/20 bg-destructive/10 text-destructive'
              }`}
            >
              {saveMessage.text}
            </div>
          )}

          {canEdit && (
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleSave}
                disabled={isSaving || !formData.name.trim()}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Members & Permissions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Members & Permissions
          </CardTitle>
          <CardDescription>Manage organization members and their permissions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-muted p-4">
              <div>
                <div className="font-medium">Your Role: {membership.role}</div>
                <div className="text-sm text-muted-foreground">
                  Joined {new Date(membership.joined_at).toLocaleDateString()}
                </div>
              </div>
              <Badge variant="outline">{membership.status}</Badge>
            </div>

            <div className="rounded-lg border p-4">
              <h4 className="mb-2 font-medium">Permission Levels</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <strong>Owner:</strong> Full access to all settings and billing
                </div>
                <div>
                  <strong>Admin:</strong> Manage members and organization settings
                </div>
                <div>
                  <strong>Member:</strong> Access to projects and collaboration features
                </div>
                <div>
                  <strong>Guest:</strong> Limited access to specific projects
                </div>
              </div>
            </div>

            {canEdit && (
              <Link
                href={`/protected/settings/organizations/${organization.slug}/members`}
                className="block"
              >
                <Button variant="outline" className="w-full">
                  <Users className="mr-2 h-4 w-4" />
                  Manage Members
                </Button>
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {membership.role === 'owner' && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Shield className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive p-4">
              <h4 className="mb-2 font-medium text-destructive">Delete Organization</h4>
              <p className="mb-4 text-sm text-muted-foreground">
                Permanently delete this organization and all its data. This action cannot be undone.
              </p>
              <Button variant="destructive" disabled>
                Delete Organization (Coming Soon)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
