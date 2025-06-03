'use client';
import { Database } from '@/lib/supabase/types.generated';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { X, Pencil, Check, Send, Plus, Calendar } from 'lucide-react';
import StatusPill from './StatusPill';
import PriorityPill from './PriorityPill';
import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useTaskMetadata } from '../../protected/tasks/hooks';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { AssigneeSelector } from '@/components/AssigneeSelector';

type Status = Database['public']['Tables']['statuses']['Row'];
type Priority = Database['public']['Tables']['priorities']['Row'];
type Label = Database['public']['Tables']['labels']['Row'];

interface AddTaskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  allStatuses: Status[];
  allPriorities: Priority[];
  refreshTasks: () => void;
}

export function AddTaskDrawer({
  isOpen,
  onClose,
  allStatuses,
  allPriorities,
  refreshTasks,
}: AddTaskDrawerProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [statusId, setStatusId] = useState<number | null>(
    allStatuses.find((s) => s.is_default)?.id || allStatuses[0]?.id || null,
  );
  const [priorityId, setPriorityId] = useState<number | null>(
    allPriorities.find((p) => p.is_default)?.id || allPriorities[0]?.id || null,
  );
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Label creation popup state
  const [selectedLabels, setSelectedLabels] = useState<Label[]>([]);
  const [showLabelPopup, setShowLabelPopup] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#3B82F6'); // Default blue color
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [availableLabels, setAvailableLabels] = useState<Label[]>([]);

  // Get all labels for selection
  useEffect(() => {
    if (isOpen) {
      fetchLabels();
    }
  }, [isOpen]);

  const fetchLabels = async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.from('labels').select('*').order('name');

      if (error) {
        console.error('Error fetching labels:', error);
      } else {
        setAvailableLabels(data || []);
      }
    } catch (err) {
      console.error('Exception fetching labels:', err);
    }
  };

  // Custom metadata state
  const [customMetadata, setCustomMetadata] = useState<Array<{ title: string; value: string }>>([]);
  const [showAddMetadataForm, setShowAddMetadataForm] = useState(false);
  const [newMetadataTitle, setNewMetadataTitle] = useState('');
  const [newMetadataValue, setNewMetadataValue] = useState('');

  // Estimate hours fields
  const [estimatedHours, setEstimatedHours] = useState<string>('');
  const [manpower, setManpower] = useState<string>('');

  // Add assignees state
  const [assignees, setAssignees] = useState<{ id: string; name: string; avatar_url?: string }[]>(
    [],
  );

  const handleCreateTask = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    if (!statusId || !priorityId || !user?.id) {
      setError('Status, priority and user ID are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      // 1. Create the task
      const now = new Date().toISOString();
      const { data: taskData, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          status_id: statusId,
          priority_id: priorityId,
          due_date: dueDate ? dueDate.toISOString() : null,
          created_at: now,
          updated_at: now,
          created_by: user?.id,
          project_id: user?.activeProjectId,
        })
        .select('id')
        .single();

      if (taskError) {
        console.error('Error creating task:', taskError);
        setError('Failed to create task');
        setSaving(false);
        return;
      }

      const taskId = taskData.id;

      // 2. Add assignees if any are selected
      if (assignees.length > 0) {
        const assigneeRecords = assignees.map((assignee) => ({
          assigned_by: user.id,
          entity_id: taskId,
          entity_type: 'task',
          user_id: assignee.id,
        }));

        const { error: assigneeError } = await supabase
          .from('entity_assignees')
          .insert(assigneeRecords);

        if (assigneeError) {
          console.error('Error adding assignees:', assigneeError);
        }
      }

      // 3. Add labels if any are selected
      if (selectedLabels.length > 0) {
        const labelLinks = selectedLabels.map((label) => ({
          entity_type: 'tasks',
          entity_id: taskId,
          label_id: label.id,
          created_by: user.id,
        }));

        const { error: labelError } = await supabase.from('entity_labels').insert(labelLinks);

        if (labelError) {
          console.error('Error adding labels:', labelError);
        }
      }

      // 4. Add metadata including estimated_hours and actual_hours
      const metadata = [...customMetadata];

      if (estimatedHours.trim()) {
        metadata.push({
          title: 'estimated_hours',
          value: estimatedHours.trim(),
        });
      }

      if (manpower.trim()) {
        metadata.push({
          title: 'manpower',
          value: manpower.trim(),
        });
      }

      if (metadata.length > 0) {
        const metadataRecords = metadata.map((item) => ({
          task_id: taskId,
          title: item.title,
          value: item.value,
          created_at: now,
          updated_at: now,
          created_by: user?.id,
        }));

        const { error: metadataError } = await supabase
          .from('task_metadata')
          .insert(metadataRecords);

        if (metadataError) {
          console.error('Error adding metadata:', metadataError);
        }
      }

      // Refresh tasks and close the drawer
      refreshTasks();
      resetForm();
      onClose();
    } catch (err) {
      console.error('Exception creating task:', err);
      setError('An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setStatusId(allStatuses.find((s) => s.is_default)?.id || allStatuses[0]?.id || null);
    setPriorityId(allPriorities.find((p) => p.is_default)?.id || allPriorities[0]?.id || null);
    setDueDate(undefined);
    setSelectedLabels([]);
    setCustomMetadata([]);
    setEstimatedHours('');
    setManpower('');
    setAssignees([]);
    setError(null);
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

      if (!user?.id) {
        setLabelError('User ID is required');
        setSavingLabel(false);
        return;
      }

      const { data: existingLabels, error: searchError } = await supabase
        .from('labels')
        .select('*')
        .ilike('name', labelName.trim())
        .limit(1);

      if (searchError) {
        console.error('Error searching for existing label:', searchError);
        setLabelError('Failed to check for existing labels');
        setSavingLabel(false);
        return;
      }

      // If label exists, use it
      if (existingLabels && existingLabels.length > 0) {
        const existingLabel = existingLabels[0];

        // Check if it's already selected
        if (!selectedLabels.some((l) => l.id === existingLabel.id)) {
          setSelectedLabels([...selectedLabels, existingLabel]);
        }

        // Reset form and close popup
        setLabelName('');
        setLabelColor('#3B82F6');
        setShowLabelPopup(false);
        setSavingLabel(false);
        return;
      }

      // If label doesn't exist, create it
      const { data: newLabel, error: labelError } = await supabase
        .from('labels')
        .insert({
          name: labelName.trim(),
          color: labelColor,
          created_by: user.id,
          project_id: user.activeProjectId,
        })
        .select('*')
        .single();

      if (labelError) {
        // Check if this is an RLS policy violation
        if (labelError.code === '42501') {
          setLabelError(
            "You don't have permission to create new labels. Please contact an administrator.",
          );
        } else {
          console.error('Error creating label:', labelError);
          setLabelError('Failed to create label');
        }
        setSavingLabel(false);
        return;
      }

      // Add the new label to selected labels
      setSelectedLabels([...selectedLabels, newLabel]);

      // Also add to available labels for future selection
      setAvailableLabels([...availableLabels, newLabel]);

      // Reset form and close popup
      setLabelName('');
      setLabelColor('#3B82F6');
      setShowLabelPopup(false);
    } catch (err) {
      console.error('Exception in label handling:', err);
      setLabelError('An unexpected error occurred');
    } finally {
      setSavingLabel(false);
    }
  };

  const handleAddMetadata = () => {
    if (!newMetadataTitle.trim() || !newMetadataValue.trim()) return;

    setCustomMetadata([
      ...customMetadata,
      {
        title: newMetadataTitle.trim(),
        value: newMetadataValue.trim(),
      },
    ]);

    setNewMetadataTitle('');
    setNewMetadataValue('');
    setShowAddMetadataForm(false);
  };

  const handleRemoveMetadata = (index: number) => {
    const newMetadata = [...customMetadata];
    newMetadata.splice(index, 1);
    setCustomMetadata(newMetadata);
  };

  const handleSelectLabel = (label: Label) => {
    if (selectedLabels.some((l) => l.id === label.id)) {
      setSelectedLabels(selectedLabels.filter((l) => l.id !== label.id));
    } else {
      setSelectedLabels([...selectedLabels, label]);
    }
  };

  const handleRemoveLabel = (labelId: number) => {
    setSelectedLabels(selectedLabels.filter((l) => l.id !== labelId));
  };

  // Handle numeric input for hours
  const handleHoursChange = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
  ) => {
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setter(value);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop with "inert" attribute to block all interactions */}
      <div
        className={`fixed inset-0 z-40 bg-black/70 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        style={{ touchAction: 'none' }}
        // This will disable all interactions with elements behind the modal
        aria-hidden={isOpen ? 'true' : 'false'}
        tabIndex={-1}
      />

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full transform border-l border-border bg-card shadow-xl transition-transform duration-300 ease-in-out sm:max-w-lg md:max-w-xl lg:max-w-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
        aria-modal="true"
        role="dialog"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-border bg-card p-4">
          <h2 className="text-xl font-semibold text-foreground">Create New Task</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          {/* Title */}
          <div>
            <label
              htmlFor="task-title"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Title <span className="text-red-500">*</span>
            </label>
            <input
              id="task-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-muted-foreground/20 bg-muted px-3 py-2 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task title"
              disabled={saving}
            />
          </div>

          {/* Description */}
          <div>
            <label
              htmlFor="task-description"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Description
            </label>
            <textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px] w-full resize-y rounded-md border border-muted-foreground/20 bg-muted px-3 py-2 text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter task description"
              disabled={saving}
            />
          </div>

          {/* Status and Priority */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Status</label>
              <div className="rounded-md border border-muted-foreground/20 bg-muted p-3">
                {statusId ? (
                  <div className="flex flex-wrap gap-2">
                    {allStatuses.map((status) => {
                      const bgColor = status.color || '#E2E8F0';
                      const textColor = 'black'; // Always use dark text for better visibility
                      return (
                        <div
                          key={status.id}
                          onClick={() => setStatusId(status.id)}
                          className={`flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 transition-colors ${
                            statusId === status.id
                              ? 'ring-2 ring-ring ring-offset-1'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: bgColor,
                            borderColor: bgColor,
                            color: textColor,
                          }}
                        >
                          {status.name}
                          {status.is_default && <span className="ml-1 text-xs">(Default)</span>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No statuses available</div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Priority
              </label>
              <div className="rounded-md border border-muted-foreground/20 bg-muted p-3">
                {priorityId ? (
                  <div className="flex flex-wrap gap-2">
                    {allPriorities.map((priority) => {
                      const bgColor = priority.color || '#E2E8F0';
                      const textColor = 'black'; // Always use dark text for better visibility
                      return (
                        <div
                          key={priority.id}
                          onClick={() => setPriorityId(priority.id)}
                          className={`flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1 transition-colors ${
                            priorityId === priority.id
                              ? 'ring-2 ring-ring ring-offset-1'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                          style={{
                            backgroundColor: bgColor,
                            borderColor: bgColor,
                            color: textColor,
                          }}
                        >
                          {priority.name}
                          {priority.is_default && <span className="ml-1 text-xs">(Default)</span>}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-muted-foreground">No priorities available</div>
                )}
              </div>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label
              htmlFor="due-date"
              className="mb-2 block text-sm font-medium text-muted-foreground"
            >
              Due Date
            </label>
            <div className="rounded-md border border-muted-foreground/20">
              <DatePicker
                date={dueDate}
                setDate={setDueDate}
                disabled={saving}
                placeholder="Select due date"
                className="text-foreground"
              />
            </div>
          </div>

          {/* Assignees */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">
              Assignees
            </label>
            <div className="rounded-md border border-muted-foreground/20 bg-muted p-3">
              <AssigneeSelector
                assignees={assignees}
                onAssign={(assignee) => {
                  setAssignees([...assignees, assignee]);
                }}
                onUnassign={(assigneeId) => {
                  setAssignees(assignees.filter((a) => a.id !== assigneeId));
                }}
                disabled={saving}
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="mb-2 block text-sm font-medium text-muted-foreground">Labels</label>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                Add labels to categorize this task
              </div>
              <button
                onClick={() => setShowLabelPopup(true)}
                className="flex items-center text-sm text-blue-500 hover:text-blue-400"
                disabled={saving}
              >
                <Plus size={14} className="mr-1" />
                <span>Create Label</span>
              </button>
            </div>

            {/* Selected labels */}
            {selectedLabels.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {selectedLabels.map((label) => {
                  const labelColor = label.color || '#E2E8F0';
                  return (
                    <Badge
                      key={label.id}
                      variant="outline"
                      style={{
                        backgroundColor: `${labelColor}20`,
                        borderColor: labelColor,
                        color: 'black',
                      }}
                      className="flex cursor-pointer items-center gap-1 border px-2 py-1 text-xs"
                    >
                      {label.name}
                      <button
                        onClick={() => handleRemoveLabel(label.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X size={12} />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            ) : (
              <div className="mb-3 text-muted-foreground">No labels selected</div>
            )}

            {/* Available labels for quick selection */}
            {availableLabels.length > 0 && (
              <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3">
                <div className="mb-2 text-xs text-muted-foreground">Available Labels</div>
                <div className="flex flex-wrap gap-2">
                  {availableLabels
                    .filter((label) => !selectedLabels.some((l) => l.id === label.id))
                    .map((label) => {
                      const labelColor = label.color || '#E2E8F0';
                      return (
                        <Badge
                          key={label.id}
                          variant="outline"
                          style={{
                            backgroundColor: `${labelColor}20`,
                            borderColor: labelColor,
                          }}
                          className="cursor-pointer border px-2 py-1 text-xs text-black hover:ring-1 hover:ring-muted-foreground dark:text-white"
                          onClick={() => handleSelectLabel(label)}
                        >
                          {label.name}
                        </Badge>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Additional Fields */}
          <div className="border-t border-border pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Additional Fields</h3>
              {!showAddMetadataForm && (
                <button
                  onClick={() => setShowAddMetadataForm(true)}
                  className="flex items-center text-sm text-blue-500 hover:text-blue-400"
                  disabled={saving}
                >
                  <Plus size={14} className="mr-1" />
                  <span>Add Field</span>
                </button>
              )}
            </div>

            {/* Time Tracking Fields */}
            <div className="mb-4 grid grid-cols-1 gap-3">
              <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3">
                <div className="mb-1 text-xs text-muted-foreground">Estimated Hours</div>
                <input
                  type="text"
                  value={estimatedHours}
                  onChange={(e) => handleHoursChange(e.target.value, setEstimatedHours)}
                  className="w-full rounded border border-muted-foreground/20 bg-muted px-3 py-1 text-sm text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 4.5"
                  disabled={saving}
                />
              </div>

              <div className="rounded-md border border-muted-foreground/20 bg-muted/50 p-3">
                <div className="mb-1 text-xs text-muted-foreground">Manpower</div>
                <input
                  type="text"
                  value={manpower}
                  onChange={(e) => handleHoursChange(e.target.value, setManpower)}
                  className="w-full rounded border border-muted-foreground/20 bg-muted px-3 py-1 text-sm text-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 3.25"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Add Metadata Form */}
            {showAddMetadataForm && (
              <div className="mb-3 rounded-md border border-muted-foreground/20 bg-muted/50 p-3">
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
                      disabled={saving}
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
                      disabled={saving}
                    />
                  </div>
                </div>
                <div className="mt-1 flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddMetadataForm(false)}
                    className="rounded-md border border-muted-foreground/20 bg-muted px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/80"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddMetadata}
                    disabled={!newMetadataTitle.trim() || !newMetadataValue.trim() || saving}
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
            )}

            {/* Custom Metadata List */}
            {customMetadata.length > 0 && (
              <div className="mb-3 space-y-2">
                {customMetadata.map((item, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-md border border-muted-foreground/20 bg-muted/50 p-2"
                  >
                    <div className="flex-1">
                      <div className="text-xs text-muted-foreground">{item.title}</div>
                      <div className="truncate text-sm font-medium text-foreground">
                        {item.value}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveMetadata(index)}
                      className="p-1 text-muted-foreground hover:text-red-400"
                      disabled={saving}
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* No fields message */}
            {customMetadata.length === 0 &&
              !estimatedHours &&
              !manpower &&
              !showAddMetadataForm && (
                <div className="py-2 text-center text-sm text-muted-foreground">
                  Add fields to store custom information about this task.
                </div>
              )}
          </div>

          {/* Error message */}
          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-border bg-card/80 p-4">
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-blue-500 hover:bg-blue-600"
              onClick={handleCreateTask}
              disabled={saving || !title.trim()}
            >
              {saving ? 'Creating...' : 'Create Task'}
            </Button>
          </div>
        </div>

        {/* Label Creation Popup */}
        {showLabelPopup && (
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
        )}
      </div>
    </>
  );
}
