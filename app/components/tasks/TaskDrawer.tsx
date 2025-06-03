import { Database } from '@/lib/supabase/types.generated';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { X, Pencil, Check, Send, Plus, Trash2, ExternalLink } from 'lucide-react';
import StatusPill from './StatusPill';
import PriorityPill from './PriorityPill';
import { useState, useRef, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import {
  useTaskComments,
  TaskComment,
  useTaskMetadata,
  TaskMetadata,
} from '../../protected/tasks/hooks';
import { DatePicker } from '@/components/ui/date-picker';
import { TaskWithRelations } from '@/app/protected/tasks/models';
import { AssigneeSelector } from '@/components/AssigneeSelector';
import { ProjectMember } from '@/hooks/useProjectMembers';
import Link from 'next/link';

type Task = Database['public']['Tables']['tasks']['Row'];
type Status = Database['public']['Tables']['statuses']['Row'];
type Priority = Database['public']['Tables']['priorities']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];
type UserMetadata = {
  name: string;
  avatar_url?: string;
};

interface TaskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  task: TaskWithRelations;
  status: Status;
  priority: Priority;
  labels: Label[];
  assignees: { id: string; name: string; avatar_url?: string }[];
  allStatuses: Status[];
  allPriorities: Priority[];
  refreshTasks: () => void;
}

export function TaskDrawer({
  isOpen,
  onClose,
  task,
  status,
  priority,
  labels,
  assignees,
  allStatuses,
  allPriorities,
  refreshTasks,
}: TaskDrawerProps) {
  const { user } = useAuth();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(task.description || '');
  const [savingDescription, setSavingDescription] = useState(false);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  // Label creation popup state
  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#3B82F6'); // Default blue color
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);

  // Metadata collapsed state
  const [metadataCollapsed, setMetadataCollapsed] = useState(true);

  // Use the task metadata hook
  const {
    metadata,
    loading: loadingMetadata,
    error: metadataError,
    setMetadataValue,
  } = useTaskMetadata(task.id);

  const [editingEstimatedHours, setEditingEstimatedHours] = useState(false);
  const [estimatedHoursValue, setEstimatedHoursValue] = useState<string>('');
  const [editingActualHours, setEditingActualHours] = useState(false);
  const [actualHoursValue, setActualHoursValue] = useState<string>('');
  const [savingMetadata, setSavingMetadata] = useState(false);

  // Use the task comments hook
  const {
    comments,
    loading: loadingComments,
    error: commentError,
    adding: addingComment,
    addComment,
    refresh: refreshComments,
  } = useTaskComments(task.id);

  // Local state for comment input
  const [commentValue, setCommentValue] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Custom metadata state
  const [showAddMetadataForm, setShowAddMetadataForm] = useState(false);
  const [newMetadataTitle, setNewMetadataTitle] = useState('');
  const [newMetadataValue, setNewMetadataValue] = useState('');
  const [editingMetadataId, setEditingMetadataId] = useState<number | null>(null);

  // Add due date editing state
  const [editingDueDate, setEditingDueDate] = useState(false);
  const [dueDateValue, setDueDateValue] = useState<Date | undefined>(
    task.due_date ? new Date(task.due_date) : undefined,
  );
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  // Refresh comments when modal is opened
  useEffect(() => {
    if (isOpen) {
      refreshComments();
    }
  }, [isOpen, refreshComments]);

  // Update estimated/actual hours from metadata when loaded
  useEffect(() => {
    if (metadata) {
      const metadataObj = metadata.reduce(
        (acc, item) => {
          acc[item.title] = item.value;
          return acc;
        },
        {} as Record<string, string | null>,
      );

      setEstimatedHoursValue(metadataObj['estimated_hours'] || '');
      setActualHoursValue(metadataObj['actual_hours'] || '');
    }
  }, [metadata]);

  // Focus the input when editing starts
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [editingTitle]);

  // Focus the textarea when editing starts
  useEffect(() => {
    if (editingDescription && descriptionInputRef.current) {
      descriptionInputRef.current.focus();
    }
  }, [editingDescription]);

  const handleAddComment = async () => {
    if (!commentValue.trim()) return;

    const result = await addComment(commentValue);
    if (result.success) {
      setCommentValue('');
    }
  };

  const handleTitleSave = async () => {
    if (titleValue.trim() === '') {
      setTitleError('Title cannot be empty');
      return;
    }

    if (titleValue === task.title) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    setTitleError(null);

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('tasks')
        .update({
          title: titleValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) {
        console.error('Error updating task title:', error);
        setTitleError('Failed to update title');
        setSavingTitle(false);
      } else {
        refreshTasks();
        setEditingTitle(false);
        setSavingTitle(false);
      }
    } catch (err) {
      console.error('Exception updating task title:', err);
      setTitleError('An unexpected error occurred');
      setSavingTitle(false);
    }
  };

  const handleDescriptionSave = async () => {
    // No validation needed - description can be empty
    if (descriptionValue === (task.description || '')) {
      setEditingDescription(false);
      return;
    }

    setSavingDescription(true);
    setDescriptionError(null);

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('tasks')
        .update({
          description: descriptionValue,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) {
        console.error('Error updating task description:', error);
        setDescriptionError('Failed to update description');
        setSavingDescription(false);
      } else {
        refreshTasks();
        setEditingDescription(false);
        setSavingDescription(false);
      }
    } catch (err) {
      console.error('Exception updating task description:', err);
      setDescriptionError('An unexpected error occurred');
      setSavingDescription(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setTitleValue(task.title);
      setEditingTitle(false);
      setTitleError(null);
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDescriptionValue(task.description || '');
      setEditingDescription(false);
      setDescriptionError(null);
    } else if (e.key === 'Enter' && e.ctrlKey) {
      // Use Ctrl+Enter to save, since regular Enter is used for newlines
      handleDescriptionSave();
    }
  };

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      // Use Ctrl+Enter to submit comment
      handleAddComment();
    }
  };

  const handleCreateLabel = async () => {
    if (!labelName.trim()) {
      setLabelError('Label name is required');
      return;
    }

    setSavingLabel(true);
    setLabelError(null);

    try {
      const supabase = getSupabaseClient();

      // First check if the label already exists
      const { data: existingLabels, error: searchError } = await supabase
        .from('labels')
        .select('id')
        .ilike('name', labelName.trim())
        .limit(1);

      if (searchError) {
        console.error('Error searching for existing label:', searchError);
        setLabelError('Failed to check for existing labels');
        setSavingLabel(false);
        return;
      }

      let labelId: number;

      // If label doesn't exist, try to create it
      if (!existingLabels || existingLabels.length === 0) {
        try {
          const { data: labelData, error: labelError } = await supabase
            .from('labels')
            .insert({
              name: labelName.trim(),
              color: labelColor,
              created_by: user?.id ?? '',
              project_id: user?.activeProjectId ?? 0,
            })
            .select('id')
            .single();

          if (labelError) {
            // Check if this is an RLS policy violation
            if (labelError.code === '42501') {
              setLabelError(
                "You don't have permission to create new labels. Please contact an administrator.",
              );
              setSavingLabel(false);
              return;
            }

            console.error('Error creating label:', labelError);
            setLabelError('Failed to create label');
            setSavingLabel(false);
            return;
          }

          labelId = labelData.id;
        } catch (err) {
          console.error('Exception creating label:', err);
          setLabelError("You don't have permission to create new labels");
          setSavingLabel(false);
          return;
        }
      } else {
        // Use the existing label
        labelId = existingLabels[0].id;
      }

      // Then associate the label with the task
      const { error: taskLabelError } = await supabase.from('entity_labels').insert({
        entity_type: 'tasks',
        entity_id: task.id,
        label_id: labelId,
        created_by: user?.id ?? '',
      });

      if (taskLabelError) {
        console.error('Error associating label with task:', taskLabelError);
        setLabelError('Failed to associate label with task');
        setSavingLabel(false);
        return;
      }

      // Reset form and close popup
      setLabelName('');
      setLabelColor('#3B82F6');
      setShowLabelPopup(false);

      // Refresh tasks to show the new label
      refreshTasks();
    } catch (err) {
      console.error('Exception in label handling:', err);
      setLabelError('An unexpected error occurred');
    } finally {
      setSavingLabel(false);
    }
  };

  const handleEstimatedHoursSave = async () => {
    const hours = estimatedHoursValue.trim() ? parseFloat(estimatedHoursValue) : null;

    // If invalid number, clear the error and cancel edit mode
    if (
      estimatedHoursValue.trim() &&
      (isNaN(Number(estimatedHoursValue)) || Number(estimatedHoursValue) < 0)
    ) {
      setEditingEstimatedHours(false);
      setEstimatedHoursValue(metadata.find((m) => m.title === 'estimated_hours')?.value || '');
      return;
    }

    // If no change, just exit edit mode
    const currentEstimatedHours = metadata.find((m) => m.title === 'estimated_hours')?.value;
    if (
      (hours === null && !currentEstimatedHours) ||
      (hours !== null && currentEstimatedHours && hours === parseFloat(currentEstimatedHours))
    ) {
      setEditingEstimatedHours(false);
      return;
    }

    try {
      await setMetadataValue('estimated_hours', hours?.toString() || null);
      setEditingEstimatedHours(false);
      refreshTasks();
    } catch (err) {
      console.error('Error saving estimated hours:', err);
    }
  };

  const handleActualHoursSave = async () => {
    const hours = actualHoursValue.trim() ? parseFloat(actualHoursValue) : null;

    // If invalid number, clear the error and cancel edit mode
    if (
      actualHoursValue.trim() &&
      (isNaN(Number(actualHoursValue)) || Number(actualHoursValue) < 0)
    ) {
      setEditingActualHours(false);
      setActualHoursValue(metadata.find((m) => m.title === 'actual_hours')?.value || '');
      return;
    }

    // If no change, just exit edit mode
    const currentActualHours = metadata.find((m) => m.title === 'actual_hours')?.value;
    if (
      (hours === null && !currentActualHours) ||
      (hours !== null && currentActualHours && hours === parseFloat(currentActualHours))
    ) {
      setEditingActualHours(false);
      return;
    }

    try {
      await setMetadataValue('actual_hours', hours?.toString() || null);
      setEditingActualHours(false);
      refreshTasks();
    } catch (err) {
      console.error('Error saving actual hours:', err);
    }
  };

  const handleEstimatedHoursKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEstimatedHoursSave();
    } else if (e.key === 'Escape') {
      setEstimatedHoursValue(metadata.find((m) => m.title === 'estimated_hours')?.value || '');
      setEditingEstimatedHours(false);
    }
  };

  const handleActualHoursKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleActualHoursSave();
    } else if (e.key === 'Escape') {
      setActualHoursValue(metadata.find((m) => m.title === 'actual_hours')?.value || '');
      setEditingActualHours(false);
    }
  };

  // Better typing for the input handlers
  const handleEstimatedHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setEstimatedHoursValue(value);
    }
  };

  const handleActualHoursChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Only allow numbers and decimal point
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setActualHoursValue(value);
    }
  };

  // Handle custom metadata
  const handleAddMetadata = async () => {
    if (!newMetadataTitle.trim() || !newMetadataValue.trim()) return;

    setSavingMetadata(true);
    try {
      await setMetadataValue(newMetadataTitle.trim(), newMetadataValue.trim());
      setNewMetadataTitle('');
      setNewMetadataValue('');
      setShowAddMetadataForm(false);
      refreshTasks();
    } catch (err) {
      console.error('Error adding metadata:', err);
    } finally {
      setSavingMetadata(false);
    }
  };

  const handleEditMetadata = async (id: number, title: string, value: string) => {
    try {
      await setMetadataValue(title, value);
      setEditingMetadataId(null);
      setNewMetadataValue('');
      refreshTasks();
    } catch (err) {
      console.error('Error editing metadata:', err);
    }
  };

  const handleDeleteMetadata = async (title: string) => {
    try {
      await setMetadataValue(title, null);
      refreshTasks();
    } catch (err) {
      console.error('Error deleting metadata:', err);
    }
  };

  // Add due date save handler
  const handleDueDateSave = async () => {
    if (dueDateValue === (task.due_date ? new Date(task.due_date) : undefined)) {
      setEditingDueDate(false);
      return;
    }

    setSavingDueDate(true);
    setDueDateError(null);

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('tasks')
        .update({
          due_date: dueDateValue ? dueDateValue.toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      if (error) {
        console.error('Error updating task due date:', error);
        setDueDateError('Failed to update due date');
        setSavingDueDate(false);
      } else {
        refreshTasks();
        setEditingDueDate(false);
        setSavingDueDate(false);
      }
    } catch (err) {
      console.error('Exception updating task due date:', err);
      setDueDateError('An unexpected error occurred');
      setSavingDueDate(false);
    }
  };

  const handleAssigneeAdd = async (member: ProjectMember) => {
    if (!user?.id) return;
    setAssigneeError(null);

    try {
      const supabase = getSupabaseClient();

      // Check if already assigned
      if (assignees.some((a) => a.id === member.id)) {
        return;
      }

      const { error } = await supabase.from('entity_assignees').insert({
        assigned_by: user.id,
        entity_id: task.id,
        entity_type: 'task',
        user_id: member.id,
      });

      if (error) {
        console.error('Error adding assignee:', error);
        setAssigneeError('Failed to add assignee');
        return;
      }

      refreshTasks();
    } catch (err) {
      console.error('Exception adding assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  const handleAssigneeRemove = async (memberId: string) => {
    setAssigneeError(null);

    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('entity_assignees')
        .delete()
        .eq('entity_type', 'task')
        .eq('entity_id', task.id)
        .eq('user_id', memberId);

      if (error) {
        console.error('Error removing assignee:', error);
        setAssigneeError('Failed to remove assignee');
        return;
      }

      refreshTasks();
    } catch (err) {
      console.error('Exception removing assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px]">
        <div className="flex h-full flex-col">
          {/* Header */}
          <SheetHeader className="border-b border-border pb-4">
            <div className="mb-3 flex items-center gap-2">
              <StatusPill
                status={status}
                taskId={task.id}
                allStatuses={allStatuses}
                refreshTasks={refreshTasks}
                className="px-3 py-1"
              />
              <PriorityPill
                priority={priority}
                taskId={task.id}
                allPriorities={allPriorities}
                refreshTasks={refreshTasks}
                className="px-3 py-1"
              />
              <Link href={`/protected/tasks/${task.id}`} className="ml-auto">
                <Button size="sm" variant="outline" className="flex items-center gap-1">
                  <ExternalLink size={14} />
                  <span>Open full page</span>
                </Button>
              </Link>
            </div>
            {editingTitle ? (
              <div className="flex flex-col">
                <div className="flex items-center">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={titleValue}
                    onChange={(e) => setTitleValue(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    className="mr-2 w-full rounded-md bg-muted px-2 py-1 text-lg font-semibold text-foreground"
                    placeholder="Task title"
                    disabled={savingTitle}
                  />
                  <Button
                    onClick={handleTitleSave}
                    disabled={savingTitle}
                    size="sm"
                    variant="ghost"
                    className="text-green-500 hover:text-green-400"
                  >
                    <Check size={20} />
                  </Button>
                </div>
                {titleError && <p className="mt-1 text-xs text-red-500">{titleError}</p>}
              </div>
            ) : (
              <div className="flex items-center">
                <SheetTitle className="mr-2 text-lg font-semibold text-foreground">
                  {task.title}
                </SheetTitle>
                <Button
                  onClick={() => setEditingTitle(true)}
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground opacity-50 hover:opacity-100"
                >
                  <Pencil size={14} />
                </Button>
              </div>
            )}
          </SheetHeader>

          {/* Content */}
          <div className="flex-1 space-y-6 overflow-y-auto p-4">
            {/* Description */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
                {!editingDescription && (
                  <button
                    onClick={() => setEditingDescription(true)}
                    className="rounded-full p-1 text-muted-foreground opacity-50 transition-colors hover:bg-muted hover:text-foreground hover:opacity-100"
                    aria-label="Edit description"
                  >
                    <Pencil size={14} />
                  </button>
                )}
              </div>

              {editingDescription ? (
                <div className="flex flex-col">
                  <div className="flex items-start">
                    <textarea
                      ref={descriptionInputRef}
                      value={descriptionValue}
                      onChange={(e) => setDescriptionValue(e.target.value)}
                      onKeyDown={handleDescriptionKeyDown}
                      className="mr-2 min-h-[100px] w-full resize-y rounded-md border border-muted-foreground/20 bg-muted p-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Add a description..."
                      disabled={savingDescription}
                    />
                    <Button
                      onClick={handleDescriptionSave}
                      disabled={savingDescription}
                      size="sm"
                      variant="ghost"
                      className="mt-1 text-green-500 hover:text-green-400"
                    >
                      <Check size={20} />
                    </Button>
                  </div>
                  {descriptionError && (
                    <p className="mt-1 text-xs text-red-500">{descriptionError}</p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Use Ctrl+Enter to save, Esc to cancel
                  </p>
                </div>
              ) : (
                <div className="whitespace-pre-line rounded-md border border-muted-foreground/20 bg-muted/50 p-3 text-foreground">
                  {task.description || 'No description provided'}
                </div>
              )}
            </div>

            {/* Dates */}
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:gap-6">
                <div className="mb-4 flex-1 md:mb-0">
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Created</h3>
                  <div className="text-foreground">{format(new Date(task.created_at), 'PPP')}</div>
                </div>
                <div className="flex-1">
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">Updated</h3>
                  <div className="text-foreground">
                    {format(new Date(task.updated_at), 'PPP')}
                    <span className="ml-2 text-muted-foreground">
                      ({formatDistanceToNow(new Date(task.updated_at), { addSuffix: true })})
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">Due Date</h3>
                  <Button
                    onClick={() => setEditingDueDate(!editingDueDate)}
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground opacity-50 hover:opacity-100"
                  >
                    {editingDueDate ? <X size={14} /> : <Pencil size={14} />}
                  </Button>
                </div>

                {editingDueDate ? (
                  <div className="flex flex-col">
                    <div className="flex items-center">
                      <div className="mr-2 flex-1">
                        <DatePicker
                          date={dueDateValue}
                          setDate={setDueDateValue}
                          disabled={savingDueDate}
                          placeholder="No due date"
                        />
                      </div>
                      <Button
                        onClick={handleDueDateSave}
                        disabled={savingDueDate}
                        size="sm"
                        variant="ghost"
                        className="text-green-500 hover:text-green-400"
                      >
                        <Check size={20} />
                      </Button>
                    </div>
                    {dueDateError && <p className="mt-1 text-xs text-red-500">{dueDateError}</p>}
                  </div>
                ) : (
                  <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3 text-foreground">
                    {task.due_date ? (
                      <>
                        {format(new Date(task.due_date), 'MMMM do, yyyy')}
                        <span className="ml-2 text-muted-foreground">
                          ({formatDistanceToNow(new Date(task.due_date), { addSuffix: true })})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No due date set</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Add the AssigneeSelector in the correct location */}
            <div>
              <AssigneeSelector
                assignees={assignees}
                onAssign={handleAssigneeAdd}
                onUnassign={handleAssigneeRemove}
                error={assigneeError}
                disabled={!user?.id}
              />
            </div>

            {/* Labels */}
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">Labels</h3>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {labels.length > 0 ? (
                  <>
                    {labels.map((label) => {
                      const labelColor = label.color || '#E2E8F0';
                      return (
                        <Badge
                          key={label.id}
                          variant="outline"
                          style={{
                            backgroundColor: `${labelColor}20`,
                            borderColor: labelColor,
                            color: labelColor,
                          }}
                          className="mb-1 max-w-[120px] truncate px-1.5 py-0.5 text-xs sm:max-w-[180px] sm:px-2 sm:py-1 md:max-w-[220px]"
                        >
                          {label.name}
                        </Badge>
                      );
                    })}
                  </>
                ) : null}

                <button
                  className="mb-1 flex h-6 w-6 items-center justify-center rounded-full border border-muted-foreground/20 bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground sm:h-7 sm:w-7"
                  aria-label="Add label"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowLabelPopup(true);
                  }}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Custom Metadata Section - replaces the previous "Time estimates" section */}
            <div className="border-t border-border pt-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center">
                  <h3 className="text-sm font-medium text-muted-foreground">Additional Fields</h3>
                  <button
                    onClick={() => setMetadataCollapsed(!metadataCollapsed)}
                    className="ml-2 text-muted-foreground hover:text-foreground"
                  >
                    {metadataCollapsed ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-chevron-right"
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="lucide lucide-chevron-down"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    )}
                  </button>
                </div>
                {!showAddMetadataForm && (
                  <button
                    onClick={() => setShowAddMetadataForm(true)}
                    className="flex items-center text-sm text-blue-500 hover:text-blue-400"
                  >
                    <Plus size={14} className="mr-1" />
                    <span>Add Field</span>
                  </button>
                )}
              </div>

              {/* Add Metadata Form */}
              {showAddMetadataForm && (
                <>
                  {/* Intra-drawer overlay for metadata form */}
                  <div
                    className="fixed inset-0 bg-transparent"
                    style={{
                      pointerEvents: 'auto',
                      touchAction: 'none',
                      zIndex: 55,
                    }}
                    aria-hidden="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAddMetadataForm(false);
                    }}
                  />

                  <div className="relative z-[56] mb-3 rounded-md bg-muted/50 p-3">
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label
                            htmlFor="metadata-title"
                            className="mb-1 block text-xs text-muted-foreground"
                          >
                            Field Name
                          </label>
                          <input
                            id="metadata-title"
                            type="text"
                            value={newMetadataTitle}
                            onChange={(e) => setNewMetadataTitle(e.target.value)}
                            className="w-full rounded border border-muted-foreground/20 bg-muted px-2 py-1 text-sm text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., priority_score"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="metadata-value"
                            className="mb-1 block text-xs text-muted-foreground"
                          >
                            Value
                          </label>
                          <input
                            id="metadata-value"
                            type="text"
                            value={newMetadataValue}
                            onChange={(e) => setNewMetadataValue(e.target.value)}
                            className="w-full rounded border border-muted-foreground/20 bg-muted px-2 py-1 text-sm text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="e.g., 8.5"
                          />
                        </div>
                      </div>
                      <div className="mt-1 flex justify-end gap-2">
                        <button
                          onClick={() => setShowAddMetadataForm(false)}
                          className="rounded-md bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/80"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleAddMetadata}
                          disabled={
                            !newMetadataTitle.trim() || !newMetadataValue.trim() || savingMetadata
                          }
                          className={`rounded-md bg-blue-500 px-2 py-1 text-xs text-white transition-colors hover:bg-blue-600 ${
                            !newMetadataTitle.trim() || !newMetadataValue.trim()
                              ? 'cursor-not-allowed opacity-50'
                              : ''
                          }`}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Metadata List */}
              <div className="space-y-2">
                {loadingMetadata ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-8 rounded bg-muted"></div>
                    <div className="h-8 rounded bg-muted"></div>
                  </div>
                ) : (
                  <>
                    {/* Show all metadata items (or only top 2 when collapsed) */}
                    <div className="grid grid-cols-1 gap-2">
                      {metadata
                        .slice(
                          0,
                          metadataCollapsed ? Math.min(2, metadata.length) : metadata.length,
                        )
                        .map((item: TaskMetadata) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between rounded-md bg-muted/50 p-2"
                          >
                            {editingMetadataId === item.id ? (
                              <div className="flex flex-1 items-center gap-2">
                                <input
                                  type="text"
                                  value={newMetadataValue}
                                  onChange={(e) => setNewMetadataValue(e.target.value)}
                                  className="flex-1 rounded bg-muted px-2 py-1 text-sm text-foreground"
                                  autoFocus
                                />
                                <button
                                  onClick={() =>
                                    handleEditMetadata(item.id, item.title, newMetadataValue)
                                  }
                                  className="p-1 text-blue-500 hover:text-blue-400"
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingMetadataId(null);
                                    setNewMetadataValue('');
                                  }}
                                  className="p-1 text-muted-foreground hover:text-foreground"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex-1">
                                  <div className="text-xs text-muted-foreground">{item.title}</div>
                                  <div className="truncate text-sm font-medium text-foreground">
                                    {item.title.includes('hours') && item.value
                                      ? `${item.value} hours`
                                      : item.value}
                                  </div>
                                </div>
                                <div className="flex items-center">
                                  <button
                                    onClick={() => {
                                      setEditingMetadataId(item.id);
                                      setNewMetadataValue(item.value || '');
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    <Pencil size={14} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteMetadata(item.title)}
                                    className="p-1 text-muted-foreground hover:text-red-400"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                    </div>

                    {/* Show count of hidden fields when collapsed */}
                    {metadataCollapsed && metadata.length > 2 && (
                      <div className="text-center">
                        <button
                          onClick={() => setMetadataCollapsed(false)}
                          className="text-sm text-muted-foreground hover:text-foreground"
                        >
                          Show {metadata.length - 2} more field
                          {metadata.length - 2 !== 1 ? 's' : ''}
                        </button>
                      </div>
                    )}

                    {/* Show message when no metadata and not showing form */}
                    {metadata.length === 0 && !showAddMetadataForm && (
                      <div className="py-2 text-center text-sm text-muted-foreground">
                        No fields. Click "Add Field" to add information.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Comments Section */}
            <div className="border-t border-border pt-4">
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">Comments</h3>

              {/* Comments List */}
              <div className="mb-4 space-y-4">
                {loadingComments ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-pulse text-muted-foreground">Loading comments...</div>
                  </div>
                ) : comments.length > 0 ? (
                  comments.map((comment: TaskComment) => (
                    <div key={comment.id} className="rounded-md bg-muted/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={comment.user_avatar} />
                          <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                            {comment.user_name
                              ? comment.user_name
                                  .split(' ')
                                  .map((n: string) => n[0])
                                  .join('')
                              : '?'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium text-foreground">
                          {comment.user_name || 'Unknown User'}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="whitespace-pre-line text-sm text-foreground">
                        {comment.content}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-muted-foreground">No comments yet</div>
                )}
              </div>

              {/* Add Comment */}
              {user && (
                <div className="flex flex-col">
                  <div className="flex items-start">
                    <Avatar className="mr-2 mt-1 h-8 w-8">
                      <AvatarImage src={user.user_metadata?.avatar_url} />
                      <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                        {(user.user_metadata?.name || 'U').charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-1 flex-col">
                      <textarea
                        ref={commentInputRef}
                        value={commentValue}
                        onChange={(e) => setCommentValue(e.target.value)}
                        onKeyDown={handleCommentKeyDown}
                        className="min-h-[80px] w-full resize-y rounded-md border border-muted-foreground/20 bg-muted p-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Add a comment..."
                        disabled={addingComment}
                      />
                      {commentError && <p className="mt-1 text-xs text-red-500">{commentError}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">Use Ctrl+Enter to submit</p>
                    </div>
                    <button
                      onClick={handleAddComment}
                      disabled={addingComment || !commentValue.trim()}
                      className={`ml-2 mt-1 rounded-full p-2 transition-colors hover:bg-muted ${
                        commentValue.trim()
                          ? 'text-blue-500 hover:text-blue-400'
                          : 'cursor-not-allowed text-muted-foreground'
                      }`}
                      aria-label="Send comment"
                    >
                      <Send size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Label Creation Popup */}
          {showLabelPopup && (
            <>
              {/* Intra-drawer overlay to block interactions with drawer content when popup is active */}
              <div
                className="absolute inset-0 z-[55] bg-transparent"
                style={{
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLabelPopup(false);
                }}
              />

              <div
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLabelPopup(false);
                }}
              >
                <div
                  className="w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="font-medium text-foreground">Create New Label</h3>
                    <button
                      onClick={() => setShowLabelPopup(false)}
                      className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      aria-label="Close"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    {/* Label Name Input */}
                    <div>
                      <label
                        htmlFor="label-name"
                        className="mb-1 block text-sm font-medium text-muted-foreground"
                      >
                        Label Name
                      </label>
                      <input
                        id="label-name"
                        type="text"
                        value={labelName}
                        onChange={(e) => setLabelName(e.target.value)}
                        className="w-full rounded-md border border-muted-foreground/20 bg-muted px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter label name"
                        disabled={savingLabel}
                      />
                    </div>

                    {/* Color Picker */}
                    <div>
                      <label
                        htmlFor="label-color"
                        className="mb-1 block text-sm font-medium text-muted-foreground"
                      >
                        Label Color
                      </label>
                      <div className="flex items-center">
                        <input
                          id="label-color"
                          type="color"
                          value={labelColor}
                          onChange={(e) => setLabelColor(e.target.value)}
                          className="h-10 w-12 cursor-pointer rounded-md border border-muted-foreground/20 bg-muted p-1"
                          disabled={savingLabel}
                        />
                        <span className="ml-3 text-foreground">{labelColor}</span>
                      </div>
                    </div>

                    {/* Label Preview */}
                    <div>
                      <label className="mb-2 block text-sm font-medium text-muted-foreground">
                        Preview
                      </label>
                      <div className="flex items-center">
                        <Badge
                          variant="outline"
                          style={{
                            backgroundColor: `${labelColor}20`,
                            borderColor: labelColor,
                          }}
                          className="border px-2 py-1 text-xs text-black dark:text-white"
                        >
                          {labelName || 'Label Preview'}
                        </Badge>
                      </div>
                    </div>

                    {labelError && <p className="text-xs text-red-500">{labelError}</p>}

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        onClick={() => setShowLabelPopup(false)}
                        className="rounded-md border border-muted-foreground/20 bg-muted px-4 py-2 text-foreground transition-colors hover:bg-muted/80"
                        disabled={savingLabel}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateLabel}
                        disabled={savingLabel || !labelName.trim()}
                        className={`rounded-md bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600 ${
                          !labelName.trim() ? 'cursor-not-allowed opacity-50' : ''
                        }`}
                      >
                        {savingLabel ? 'Creating...' : 'Create Label'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
