'use client';

import React, { useEffect, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  FolderOpen,
  Users,
  Settings,
  Save,
  ArrowLeft,
  Shield,
  Trash2,
  CheckSquare,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Project, ProjectMembership } from '@/lib/types/project';
import { projectAPI } from '@/lib/api/projects';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { memberships, current, switchProject, updateProject } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [membership, setMembership] = useState<ProjectMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
  });

  // Form validation
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const projectId = parseInt(params.id as string);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Project name must be at least 2 characters';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Project name must be less than 100 characters';
    }

    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    const loadProject = async () => {
      if (!projectId || isNaN(projectId)) {
        router.push('/protected/settings/projects');
        return;
      }

      try {
        setIsLoading(true);

        // Find the project in memberships first
        const foundMembership = memberships.find((m) => m.project_id === projectId);
        if (!foundMembership) {
          // User doesn't have access to this project
          router.push('/protected/settings/projects');
          return;
        }

        setMembership(foundMembership);
        setProject(foundMembership.project);

        // Set form data
        setFormData({
          name: foundMembership.project.name,
          description: foundMembership.project.description || '',
        });
      } catch (error: any) {
        console.error('Failed to load project:', error);
        router.push('/protected/settings/projects');
      } finally {
        setIsLoading(false);
      }
    };

    if (memberships.length > 0) {
      loadProject();
    }
  }, [memberships, projectId, router]);

  const handleSave = async () => {
    if (!project) return;

    // Clear previous messages and errors
    setSaveMessage(null);
    setErrors({});

    // Validate form
    if (!validateForm()) {
      return;
    }

    setIsSaving(true);
    try {
      // Call the update project API
      await updateProject(project.id, {
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
      });

      // Update local project state
      setProject((prev) =>
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
        text: 'Project settings updated successfully!',
      });
    } catch (error: any) {
      console.error('Failed to save project settings:', error);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Failed to save project settings. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchToProject = async () => {
    if (!project || current?.id === project.id) return;

    try {
      await switchProject(project.id);
      setSaveMessage({
        type: 'success',
        text: 'Switched to this project!',
      });
    } catch (error) {
      console.error('Failed to switch project:', error);
      setSaveMessage({
        type: 'error',
        text: 'Failed to switch project',
      });
    }
  };

  const handleDeleteProject = async () => {
    if (!project) return;

    setIsDeleting(true);
    try {
      // If this is the current project, we need to switch to another project first
      let switchedToNewProject = false;
      if (current?.id === project.id) {
        // Find another project to switch to
        const otherMembership = memberships.find((m) => m.project_id !== project.id);
        if (otherMembership) {
          await switchProject(otherMembership.project_id);
          switchedToNewProject = true;
        }
      }

      // Delete the project
      await projectAPI.deleteProject(project.id);

      // Navigate back to projects list
      router.push('/protected/settings/projects');

      // Show success message (though we're navigating away)
      setSaveMessage({
        type: 'success',
        text: 'Project deleted successfully!',
      });
    } catch (error: any) {
      console.error('Failed to delete project:', error);
      setSaveMessage({
        type: 'error',
        text: error.message || 'Failed to delete project. Please try again.',
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const canEdit = membership?.role === 'owner' || membership?.role === 'admin';

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading project...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!project || !membership) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Project Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              The requested project was not found or you don't have access to it.
            </p>
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
            <Link href="/protected/settings/projects">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="flex flex-col gap-2 text-2xl font-bold sm:flex-row sm:items-center sm:gap-2 sm:text-3xl">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-6 w-6 flex-shrink-0 sm:h-8 sm:w-8" />
                  <span className="truncate">{project.name}</span>
                </div>
                {formData.name !== project.name && (
                  <span className="text-sm font-normal text-muted-foreground">
                    (unsaved changes)
                  </span>
                )}
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Project settings and configuration
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {current?.id !== project.id && (
              <Button
                onClick={handleSwitchToProject}
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
              >
                <span className="sm:hidden">Switch to Project</span>
                <span className="hidden sm:inline">Switch to This Project</span>
              </Button>
            )}
            <Link
              href={`/protected/settings/projects/${project.id}/members`}
              className="block w-full sm:w-auto"
            >
              <Button variant="outline" className="w-full">
                <Users className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Members</span>
                <span className="hidden sm:inline">Manage Members</span>
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <Card className={saveMessage.type === 'error' ? 'border-destructive' : 'border-green-500'}>
          <CardContent className="pt-4">
            <p className={saveMessage.type === 'error' ? 'text-destructive' : 'text-green-600'}>
              {saveMessage.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Project Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Project Information</CardTitle>
              <CardDescription>Basic project details and configuration</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{membership.role}</Badge>
              {current?.id === project.id && <Badge variant="default">Current</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                disabled={!canEdit}
                className={errors.name ? 'border-destructive' : ''}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="created">Created</Label>
              <Input
                id="created"
                value={new Date(project.created_at).toLocaleDateString()}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              disabled={!canEdit}
              className={errors.description ? 'border-destructive' : ''}
              rows={3}
              placeholder="Describe your project..."
            />
            {errors.description && <p className="text-sm text-destructive">{errors.description}</p>}
          </div>

          {canEdit && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={handleSave} disabled={isSaving} className="w-full sm:w-auto">
                <Save className="mr-2 h-4 w-4" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setFormData({
                    name: project.name,
                    description: project.description || '',
                  });
                  setErrors({});
                  setSaveMessage(null);
                }}
                className="w-full sm:w-auto"
              >
                Reset
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Project Statistics</CardTitle>
          <CardDescription>Overview of project activity and data</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">-</div>
              <div className="text-sm text-muted-foreground">Tasks</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">-</div>
              <div className="text-sm text-muted-foreground">Forms</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">-</div>
              <div className="text-sm text-muted-foreground">Site Diaries</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold sm:text-2xl">
                {memberships.filter((m) => m.project_id === project.id).length || 1}
              </div>
              <div className="text-sm text-muted-foreground">Members</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Task Settings</CardTitle>
          <CardDescription>
            Configure task statuses, priorities, and other task-related settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <CheckSquare className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
                <div className="min-w-0 flex-1">
                  <h4 className="font-medium">Statuses & Priorities</h4>
                  <p className="text-sm text-muted-foreground">
                    Manage task statuses and priority levels for this project. Configure colors and
                    default values.
                  </p>
                </div>
              </div>
              <Link
                href={`/protected/settings/projects/${project.id}/tasks`}
                className="w-full sm:w-auto"
              >
                <Button variant="outline" className="w-full sm:w-auto">
                  <Settings className="mr-2 h-4 w-4" />
                  Manage
                </Button>
              </Link>
            </div>
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
            <CardDescription>Irreversible and destructive actions for this project</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border border-destructive/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <h4 className="font-medium">Delete Project</h4>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this project and all associated data. This cannot be undone.
                </p>
              </div>
              <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="w-full sm:w-auto">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Project
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Delete Project
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete <strong>"{project?.name}"</strong>?
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="rounded-md bg-destructive/10 p-4 text-sm">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-destructive">
                          This action cannot be undone
                        </h3>
                        <div className="mt-2 text-destructive/80">
                          <p>This will permanently delete:</p>
                          <ul className="mt-2 list-disc space-y-1 pl-5">
                            <li>All project data and settings</li>
                            <li>All tasks and their history</li>
                            <li>All forms and submissions</li>
                            <li>All site diary entries</li>
                            <li>All member access to this project</li>
                          </ul>
                          {current?.id === project?.id && (
                            <p className="mt-3 font-medium">
                              Note: This is your current project. You will be automatically switched
                              to another project if available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteProject}
                      disabled={isDeleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {isDeleting ? 'Deleting...' : 'Delete Project'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
