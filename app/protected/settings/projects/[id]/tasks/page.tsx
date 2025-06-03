'use client';

import React, { useEffect, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FolderOpen,
  CheckSquare,
  Plus,
  ArrowLeft,
  Edit,
  Trash2,
  Save,
  X,
  Flag,
  Circle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Project, ProjectMembership } from '@/lib/types/project';
import { taskSettingsAPI, TaskStatus, TaskPriority } from '@/lib/api/task-settings';

const DEFAULT_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#6b7280', // gray
];

export default function ProjectTaskSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { memberships } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [membership, setMembership] = useState<ProjectMembership | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Status state
  const [statuses, setStatuses] = useState<TaskStatus[]>([]);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [editingStatus, setEditingStatus] = useState<TaskStatus | null>(null);
  const [statusForm, setStatusForm] = useState({ name: '', color: DEFAULT_COLORS[0] });
  const [statusError, setStatusError] = useState<string | null>(null);

  // Priority state
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [showPriorityDialog, setShowPriorityDialog] = useState(false);
  const [editingPriority, setEditingPriority] = useState<TaskPriority | null>(null);
  const [priorityForm, setPriorityForm] = useState({ name: '', color: DEFAULT_COLORS[0] });
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const projectId = parseInt(params.id as string);
  const canEdit = membership?.role === 'owner' || membership?.role === 'admin';

  useEffect(() => {
    const loadProjectAndData = async () => {
      if (!projectId || isNaN(projectId)) {
        router.push('/protected/settings/projects');
        return;
      }

      try {
        setIsLoading(true);

        // Find the project in memberships first
        const foundMembership = memberships.find((m) => m.project_id === projectId);
        if (!foundMembership) {
          router.push('/protected/settings/projects');
          return;
        }

        setMembership(foundMembership);
        setProject(foundMembership.project);

        // Load data only if not already loaded
        if (!dataLoaded) {
          await loadStatuses();
          await loadPriorities();
          setDataLoaded(true);
        }
      } catch (error: any) {
        console.error('Failed to load project and task data:', error);
        router.push('/protected/settings/projects');
      } finally {
        setIsLoading(false);
      }
    };

    if (memberships.length > 0) {
      loadProjectAndData();
    }
  }, [memberships, projectId, router, dataLoaded]);

  const loadStatuses = async () => {
    try {
      const statusesData = await taskSettingsAPI.getProjectStatuses(projectId);
      setStatuses(statusesData);
    } catch (error) {
      console.error('Failed to load statuses:', error);
      setStatusError('Failed to load statuses');
    }
  };

  const loadPriorities = async () => {
    try {
      const prioritiesData = await taskSettingsAPI.getProjectPriorities(projectId);
      setPriorities(prioritiesData);
    } catch (error) {
      console.error('Failed to load priorities:', error);
      setPriorityError('Failed to load priorities');
    }
  };

  // Status CRUD operations
  const handleCreateStatus = async () => {
    if (!statusForm.name.trim()) {
      setStatusError('Status name is required');
      return;
    }

    if (statuses.some((s) => s.name.toLowerCase() === statusForm.name.toLowerCase())) {
      setStatusError('A status with this name already exists');
      return;
    }

    try {
      const newStatus = await taskSettingsAPI.createStatus({
        name: statusForm.name.trim(),
        color: statusForm.color,
        project_id: projectId,
      });

      setStatuses([...statuses, newStatus]);
      setShowStatusDialog(false);
      setStatusForm({ name: '', color: DEFAULT_COLORS[0] });
      setStatusError(null);
    } catch (error: any) {
      setStatusError(error.message || 'Failed to create status');
    }
  };

  const handleUpdateStatus = async () => {
    if (!editingStatus || !statusForm.name.trim()) {
      setStatusError('Status name is required');
      return;
    }

    if (
      statuses.some(
        (s) => s.id !== editingStatus.id && s.name.toLowerCase() === statusForm.name.toLowerCase(),
      )
    ) {
      setStatusError('A status with this name already exists');
      return;
    }

    try {
      await taskSettingsAPI.updateStatus(editingStatus.id, {
        name: statusForm.name.trim(),
        color: statusForm.color,
      });

      const updatedStatuses = statuses.map((s) =>
        s.id === editingStatus.id
          ? { ...s, name: statusForm.name.trim(), color: statusForm.color }
          : s,
      );

      setStatuses(updatedStatuses);
      setShowStatusDialog(false);
      setEditingStatus(null);
      setStatusForm({ name: '', color: DEFAULT_COLORS[0] });
      setStatusError(null);
    } catch (error: any) {
      setStatusError(error.message || 'Failed to update status');
    }
  };

  const handleDeleteStatus = async (status: TaskStatus) => {
    if (status.task_count && status.task_count > 0) {
      setStatusError(`Cannot delete status "${status.name}" as it has ${status.task_count} tasks`);
      return;
    }

    try {
      await taskSettingsAPI.deleteStatus(status.id);
      const filteredStatuses = statuses.filter((s) => s.id !== status.id);
      setStatuses(filteredStatuses);
    } catch (error: any) {
      setStatusError(error.message || 'Failed to delete status');
    }
  };

  // Priority CRUD operations
  const handleCreatePriority = async () => {
    if (!priorityForm.name.trim()) {
      setPriorityError('Priority name is required');
      return;
    }

    if (priorities.some((p) => p.name.toLowerCase() === priorityForm.name.toLowerCase())) {
      setPriorityError('A priority with this name already exists');
      return;
    }

    try {
      const newPriority = await taskSettingsAPI.createPriority({
        name: priorityForm.name.trim(),
        color: priorityForm.color,
        project_id: projectId,
      });

      setPriorities([...priorities, newPriority]);
      setShowPriorityDialog(false);
      setPriorityForm({ name: '', color: DEFAULT_COLORS[0] });
      setPriorityError(null);
    } catch (error: any) {
      setPriorityError(error.message || 'Failed to create priority');
    }
  };

  const handleUpdatePriority = async () => {
    if (!editingPriority || !priorityForm.name.trim()) {
      setPriorityError('Priority name is required');
      return;
    }

    if (
      priorities.some(
        (p) =>
          p.id !== editingPriority.id && p.name.toLowerCase() === priorityForm.name.toLowerCase(),
      )
    ) {
      setPriorityError('A priority with this name already exists');
      return;
    }

    try {
      await taskSettingsAPI.updatePriority(editingPriority.id, {
        name: priorityForm.name.trim(),
        color: priorityForm.color,
      });

      const updatedPriorities = priorities.map((p) =>
        p.id === editingPriority.id
          ? { ...p, name: priorityForm.name.trim(), color: priorityForm.color }
          : p,
      );

      setPriorities(updatedPriorities);
      setShowPriorityDialog(false);
      setEditingPriority(null);
      setPriorityForm({ name: '', color: DEFAULT_COLORS[0] });
      setPriorityError(null);
    } catch (error: any) {
      setPriorityError(error.message || 'Failed to update priority');
    }
  };

  const handleDeletePriority = async (priority: TaskPriority) => {
    if (priority.task_count && priority.task_count > 0) {
      setPriorityError(
        `Cannot delete priority "${priority.name}" as it has ${priority.task_count} tasks`,
      );
      return;
    }

    try {
      await taskSettingsAPI.deletePriority(priority.id);
      const filteredPriorities = priorities.filter((p) => p.id !== priority.id);
      setPriorities(filteredPriorities);
    } catch (error: any) {
      setPriorityError(error.message || 'Failed to delete priority');
    }
  };

  const openStatusDialog = (status?: TaskStatus) => {
    if (status) {
      setEditingStatus(status);
      setStatusForm({ name: status.name, color: status.color || DEFAULT_COLORS[0] });
    } else {
      setEditingStatus(null);
      setStatusForm({ name: '', color: DEFAULT_COLORS[0] });
    }
    setStatusError(null);
    setShowStatusDialog(true);
  };

  const openPriorityDialog = (priority?: TaskPriority) => {
    if (priority) {
      setEditingPriority(priority);
      setPriorityForm({ name: priority.name, color: priority.color || DEFAULT_COLORS[0] });
    } else {
      setEditingPriority(null);
      setPriorityForm({ name: '', color: DEFAULT_COLORS[0] });
    }
    setPriorityError(null);
    setShowPriorityDialog(true);
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading task settings...</p>
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
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/protected/settings/projects/${project.id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Project
            </Button>
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold">
              <CheckSquare className="h-8 w-8" />
              Task Settings
            </h1>
            <p className="text-muted-foreground">
              Manage task statuses and priorities for {project.name}
            </p>
          </div>
        </div>
      </div>

      {/* Error Messages */}
      {statusError && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{statusError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setStatusError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {priorityError && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive">{priorityError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setPriorityError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Task Statuses */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Circle className="h-5 w-5" />
                Task Statuses
              </CardTitle>
              <CardDescription>Manage the different states that tasks can be in</CardDescription>
            </div>
            {canEdit && (
              <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
                <DialogTrigger asChild>
                  <Button onClick={() => openStatusDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Status
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingStatus ? 'Edit Status' : 'Create New Status'}</DialogTitle>
                    <DialogDescription>
                      {editingStatus
                        ? 'Update the status name and color'
                        : 'Add a new status for tasks in this project'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="status-name">Status Name</Label>
                      <Input
                        id="status-name"
                        placeholder="e.g. In Review"
                        value={statusForm.name}
                        onChange={(e) =>
                          setStatusForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Color</Label>
                      <div className="flex flex-wrap gap-2">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`h-8 w-8 rounded-full border-2 ${
                              statusForm.color === color ? 'border-gray-900' : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setStatusForm((prev) => ({ ...prev, color }))}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={editingStatus ? handleUpdateStatus : handleCreateStatus}>
                      {editingStatus ? 'Update' : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Default</TableHead>
                {canEdit && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {statuses.map((status) => (
                <TableRow key={status.id}>
                  <TableCell className="font-medium">{status.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: status.color || '#6b7280' }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {status.color || 'No color'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{status.task_count || 0} tasks</Badge>
                  </TableCell>
                  <TableCell>
                    {status.is_default && <Badge variant="default">Default</Badge>}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openStatusDialog(status)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={status.task_count !== undefined && status.task_count > 0}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Status</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the status "{status.name}"? This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteStatus(status)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Task Priorities */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Flag className="h-5 w-5" />
                Task Priorities
              </CardTitle>
              <CardDescription>Manage priority levels for tasks in this project</CardDescription>
            </div>
            {canEdit && (
              <Dialog open={showPriorityDialog} onOpenChange={setShowPriorityDialog}>
                <DialogTrigger asChild>
                  <Button onClick={() => openPriorityDialog()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Priority
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingPriority ? 'Edit Priority' : 'Create New Priority'}
                    </DialogTitle>
                    <DialogDescription>
                      {editingPriority
                        ? 'Update the priority name and color'
                        : 'Add a new priority level for tasks in this project'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="priority-name">Priority Name</Label>
                      <Input
                        id="priority-name"
                        placeholder="e.g. Critical"
                        value={priorityForm.name}
                        onChange={(e) =>
                          setPriorityForm((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Color</Label>
                      <div className="flex flex-wrap gap-2">
                        {DEFAULT_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`h-8 w-8 rounded-full border-2 ${
                              priorityForm.color === color ? 'border-gray-900' : 'border-gray-300'
                            }`}
                            style={{ backgroundColor: color }}
                            onClick={() => setPriorityForm((prev) => ({ ...prev, color }))}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowPriorityDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={editingPriority ? handleUpdatePriority : handleCreatePriority}>
                      {editingPriority ? 'Update' : 'Create'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Priority</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Tasks</TableHead>
                <TableHead>Default</TableHead>
                {canEdit && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {priorities.map((priority) => (
                <TableRow key={priority.id}>
                  <TableCell className="font-medium">{priority.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-4 w-4 rounded-full border"
                        style={{ backgroundColor: priority.color || '#6b7280' }}
                      />
                      <span className="text-sm text-muted-foreground">
                        {priority.color || 'No color'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{priority.task_count || 0} tasks</Badge>
                  </TableCell>
                  <TableCell>
                    {priority.is_default && <Badge variant="default">Default</Badge>}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openPriorityDialog(priority)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={
                                priority.task_count !== undefined && priority.task_count > 0
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Priority</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete the priority "{priority.name}"? This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeletePriority(priority)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
