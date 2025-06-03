'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { format, formatDistanceToNow } from 'date-fns';
import { Pencil, Check, Send, Plus, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { DatePicker } from '@/components/ui/date-picker';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { AssigneeSelector, type AssigneeSelectorProps } from '@/components/AssigneeSelector';
import { ProjectMember } from '@/hooks/useProjectMembers';
import {
  useTask,
  useTaskComments,
  useTaskMetadata,
  useTaskStatuses,
  useTaskPriorities,
} from '../hooks';
import StatusPill from '@/app/components/tasks/StatusPill';
import PriorityPill from '@/app/components/tasks/PriorityPill';
import { TaskWithRelations } from '../models';
import { Database } from '@/lib/supabase/types.generated';

type Status = Database['public']['Tables']['statuses']['Row'];
type Priority = Database['public']['Tables']['priorities']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];

export default function TaskPage() {
  const params = useParams();
  const taskId = params.id as string;
  const numericTaskId = Number(taskId);
  const { user } = useAuth();

  // Task data - use numeric task ID for all hooks
  const {
    task,
    loading: loadingTask,
    error: taskError,
    refresh: refreshTask,
  } = useTask(numericTaskId);
  const { statuses } = useTaskStatuses();
  const { priorities } = useTaskPriorities();

  // State variables
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState('');
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
  } = useTaskMetadata(numericTaskId);

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
  } = useTaskComments(numericTaskId);

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
  const [dueDateValue, setDueDateValue] = useState<Date | undefined>(undefined);
  const [savingDueDate, setSavingDueDate] = useState(false);
  const [dueDateError, setDueDateError] = useState<string | null>(null);

  const [assigneeError, setAssigneeError] = useState<string | null>(null);

  // Update state when task data is loaded
  useEffect(() => {
    if (task) {
      setTitleValue(task.title);
      setDescriptionValue(task.description || '');
      setDueDateValue(task.due_date ? new Date(task.due_date) : undefined);
    }
  }, [task]);

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

  // Refresh comments when component mounts
  useEffect(() => {
    refreshComments();
  }, [refreshComments]);

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

    if (titleValue === task?.title) {
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
        .eq('id', numericTaskId);

      if (error) {
        console.error('Error updating task title:', error);
        setTitleError('Failed to update title');
        setSavingTitle(false);
      } else {
        refreshTask();
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
    if (descriptionValue === (task?.description || '')) {
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
        .eq('id', numericTaskId);

      if (error) {
        console.error('Error updating task description:', error);
        setDescriptionError('Failed to update description');
        setSavingDescription(false);
      } else {
        refreshTask();
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
      setTitleValue(task?.title || '');
      setEditingTitle(false);
      setTitleError(null);
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setDescriptionValue(task?.description || '');
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

  const handleDueDateSave = async () => {
    if (task?.due_date === (dueDateValue?.toISOString() || null)) {
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
          due_date: dueDateValue?.toISOString() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', numericTaskId);

      if (error) {
        console.error('Error updating due date:', error);
        setDueDateError('Failed to update due date');
        setSavingDueDate(false);
      } else {
        refreshTask();
        setEditingDueDate(false);
        setSavingDueDate(false);
      }
    } catch (err) {
      console.error('Exception updating due date:', err);
      setDueDateError('An unexpected error occurred');
      setSavingDueDate(false);
    }
  };

  const handleAssigneeAdd = async (member: ProjectMember) => {
    try {
      const supabase = getSupabaseClient();

      // Check if already assigned
      if (task?.assignees.includes(member.id)) {
        return;
      }

      const { error } = await supabase.from('entity_assignees').insert({
        entity_type: 'task',
        entity_id: numericTaskId,
        user_id: member.id,
        assigned_by: user?.id || '',
      });

      if (error) {
        console.error('Error adding assignee:', error);
        setAssigneeError('Failed to add assignee');
        return;
      }

      refreshTask();
    } catch (err) {
      console.error('Exception adding assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  const handleAssigneeRemove = async (memberId: string) => {
    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from('entity_assignees')
        .delete()
        .eq('entity_type', 'task')
        .eq('entity_id', numericTaskId)
        .eq('user_id', memberId);

      if (error) {
        console.error('Error removing assignee:', error);
        setAssigneeError('Failed to remove assignee');
        return;
      }

      refreshTask();
    } catch (err) {
      console.error('Exception removing assignee:', err);
      setAssigneeError('An unexpected error occurred');
    }
  };

  // If loading, show skeleton
  if (loadingTask) {
    return (
      <div className="container mx-auto max-w-4xl p-4">
        <div className="h-8 w-40 animate-pulse rounded bg-muted"></div>
        <div className="mt-4 h-20 animate-pulse rounded bg-muted"></div>
        <div className="mt-4 h-40 animate-pulse rounded bg-muted"></div>
      </div>
    );
  }

  // If task not found or error
  if (!task || taskError) {
    return (
      <div className="container mx-auto max-w-4xl p-4">
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <h2 className="text-lg font-medium text-red-800 dark:text-red-200">
            {taskError || 'Task not found'}
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">
            The requested task could not be loaded. Please try again or go back to the task list.
          </p>
        </div>
      </div>
    );
  }

  // Find the current status and priority
  const status = statuses.find((s) => s.id === task.status_id) || {
    id: 0,
    name: 'No Status',
    color: '#E2E8F0',
    position: 0,
    is_default: false,
    project_id: 0,
    created_at: '',
    created_by: '',
  };

  const priority = task.priorities || {
    id: 0,
    name: 'No Priority',
    color: '#E2E8F0',
    position: 0,
    is_default: false,
    project_id: 0,
    created_at: '',
    created_by: '',
  };

  const labels =
    task.entity_labels
      ?.map((el) => el.labels)
      .filter((label): label is NonNullable<typeof label> => label !== null) || [];

  const assignees =
    task.entity_assignees?.map((ea) => ({
      id: ea.user_id,
      name: ea.users.user_profiles?.global_display_name || ea.users.raw_user_meta_data.name,
      avatar_url:
        ea.users.user_profiles?.global_avatar_url || ea.users.raw_user_meta_data.avatar_url,
    })) || [];

  return (
    <div className="container mx-auto max-w-4xl p-4">
      <div className="flex h-full flex-col rounded-lg border border-border bg-background shadow-sm">
        {/* Header */}
        <div className="border-b border-border p-6 pb-4">
          <div className="mb-3 flex items-center gap-2">
            <StatusPill
              status={status}
              taskId={task.id}
              allStatuses={statuses}
              refreshTasks={refreshTask}
              className="px-3 py-1"
            />
            <PriorityPill
              priority={priority}
              taskId={task.id}
              allPriorities={priorities}
              refreshTasks={refreshTask}
              className="px-3 py-1"
            />
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
              <h1 className="mr-2 text-lg font-semibold text-foreground">{task.title}</h1>
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
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
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

          {/* Assignees */}
          <div>
            <AssigneeSelector
              assignees={assignees}
              onAssign={handleAssigneeAdd}
              onUnassign={handleAssigneeRemove}
              error={assigneeError}
            />
          </div>

          {/* Labels */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Labels</h3>
            </div>

            <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3">
              <div className="mb-3 flex flex-wrap gap-2">
                {labels.map((label) => (
                  <Badge
                    key={label.id}
                    style={{
                      backgroundColor: label.color || '#E2E8F0',
                      color: 'white',
                    }}
                    className="px-2 py-1"
                  >
                    {label.name}
                  </Badge>
                ))}
                {labels.length === 0 && (
                  <span className="text-sm text-muted-foreground">No labels</span>
                )}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Comments</h3>

            <div className="space-y-4">
              {loadingComments ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-16 rounded bg-muted"></div>
                  <div className="h-16 rounded bg-muted"></div>
                </div>
              ) : comments.length === 0 ? (
                <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-4 text-center text-muted-foreground">
                  No comments yet
                </div>
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={comment.user_avatar} />
                            <AvatarFallback className="text-xs">
                              {comment.user_name
                                ?.split(' ')
                                .map((n) => n[0])
                                .join('') || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{comment.user_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="whitespace-pre-line text-sm">{comment.content}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add comment */}
              <div className="mt-4">
                <div className="flex items-start gap-2">
                  <textarea
                    value={commentValue}
                    onChange={(e) => setCommentValue(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    className="min-h-[60px] w-full resize-y rounded-md border border-muted-foreground/20 bg-muted p-3 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add a comment..."
                    disabled={addingComment}
                  />
                  <Button
                    onClick={handleAddComment}
                    disabled={addingComment || !commentValue.trim()}
                    className="mt-1"
                  >
                    <Send size={14} className="mr-1" />
                    Send
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Use Ctrl+Enter to send</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
