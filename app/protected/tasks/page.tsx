'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { TaskCard } from '@/app/components/tasks/TaskCard';
import { TaskColumnSkeleton } from '@/app/components/tasks/TaskColumnSkeleton';
import { TaskCardSkeleton } from '@/app/components/tasks/TaskCardSkeleton';
import { useTaskStatuses, useTaskPriorities, useTasks } from './hooks';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddTaskDrawer } from '@/app/components/tasks/AddTaskDrawer';
import {
  DndContext,
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCorners,
  DragStartEvent,
  DragEndEvent,
  DragOverEvent,
  UniqueIdentifier,
  useDraggable,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { TaskWithRelations } from './models';
import { cn } from '@/lib/utils';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types.generated';
import { toast } from 'sonner';

// Define types for task position data
type TaskPosition = {
  id: number;
  status_id: number;
  position: number;
};

export default function TasksPage() {
  const { statuses, loading: loadingStatuses } = useTaskStatuses();
  const { priorities, loading: loadingPriorities } = useTaskPriorities();
  const { tasks: remoteTasks, loading: loadingTasks, refresh: refreshTasks } = useTasks();
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [isAddTaskDrawerOpen, setIsAddTaskDrawerOpen] = useState(false);
  const [isAnyTaskDrawerOpen, setIsAnyTaskDrawerOpen] = useState(false);
  const [isDragProcessing, setIsDragProcessing] = useState(false);
  const [dragOverInfo, setDragOverInfo] = useState<{
    overTaskId: number | null;
    overStatusId: number | null;
  }>({ overTaskId: null, overStatusId: null });

  // Get the active task
  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return tasks.find((task) => task.id === Number(activeId));
  }, [activeId, tasks]);

  // Function to update a specific task in the local state
  const updateTaskInState = useCallback((taskId: number, updates: Partial<TaskWithRelations>) => {
    setTasks((prevTasks) =>
      prevTasks.map((task) => (task.id === taskId ? { ...task, ...updates } : task)),
    );
  }, []);

  // Generate ordered tasks for each status
  const tasksByStatus = useMemo(() => {
    const result: Record<number, TaskWithRelations[]> = {};

    if (statuses && tasks) {
      // Initialize empty arrays for each status
      statuses.forEach((status) => {
        result[status.id] = [];
      });

      // Group tasks by status
      tasks.forEach((task) => {
        if (task.status_id in result) {
          result[task.status_id].push(task);
        }
      });

      // Sort each group by position
      Object.keys(result).forEach((statusId) => {
        result[Number(statusId)].sort((a, b) => (a.position || 0) - (b.position || 0));
      });
    }

    return result;
  }, [statuses, tasks]);

  // Sync remote data to local state
  useEffect(() => {
    if (remoteTasks) {
      setTasks(remoteTasks);
    }
  }, [remoteTasks]);

  // Configure sensors for drag and drop with better mobile support
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require more distance to activate drag - prevents accidental drags
      activationConstraint: { distance: 15 },
    }),
    useSensor(TouchSensor, {
      // Higher delay and tolerance to allow scrolling
      activationConstraint: {
        delay: 500, // Longer delay to distinguish from scroll
        tolerance: 10, // More tolerance for finger movement during delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id);
  };

  // Handle drag over for visual feedback
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;

    if (!over || !active) return;

    const activeId = active.id;
    const overId = over.id;

    // Check if hovering over a status column
    if (typeof overId === 'string' && overId.startsWith('status-')) {
      const statusId = Number(overId.replace('status-', ''));
      setDragOverInfo({
        overTaskId: null,
        overStatusId: statusId,
      });
    } else {
      // Hovering over a task - use the task's status ID rather than task ID
      const overTask = tasks.find((task) => task.id === Number(overId));
      if (overTask) {
        setDragOverInfo({
          overTaskId: Number(overId),
          overStatusId: overTask.status_id,
        });
      }
    }
  };

  // Handle drag end with optimistic updates
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !active || isDragProcessing) {
      setActiveId(null);
      return;
    }

    const activeTaskId = Number(active.id);
    const activeTask = tasks.find((task) => task.id === activeTaskId);

    if (!activeTask) {
      setActiveId(null);
      return;
    }

    // Set processing state to prevent rapid consecutive drags
    setIsDragProcessing(true);

    // Set minimum buffer to prevent spam drag operations (600ms)
    const dragBufferTimeout = setTimeout(() => {
      setIsDragProcessing(false);
    }, 600);

    // Store original state for potential rollback
    const originalTasks = [...tasks];

    try {
      // Check if we're dropping directly on a status column
      const isColumnDrop = typeof over.id === 'string' && over.id.startsWith('status-');

      if (isColumnDrop) {
        // Dropping directly on a column
        const dropStatusId = Number(over.id.toString().replace('status-', ''));

        if (activeTask.status_id !== dropStatusId) {
          // Update status - optimistic update first
          updateTaskStatusOptimistic(activeTaskId, dropStatusId, originalTasks, dragBufferTimeout);
        } else {
          // We're dropping back in the same column - move to the end
          const tasksInColumn = tasksByStatus[dropStatusId] || [];
          if (tasksInColumn.length > 0) {
            const oldIndex = tasksInColumn.findIndex((t) => t.id === activeTaskId);
            if (oldIndex !== -1) {
              updateTaskOrderOptimistic(
                dropStatusId,
                oldIndex,
                tasksInColumn.length - 1,
                originalTasks,
                dragBufferTimeout,
              );
            }
          }
        }
      } else {
        // Dropping on another task
        const overTaskId = Number(over.id);
        const overTask = tasks.find((task) => task.id === overTaskId);

        if (!overTask) {
          console.error('Cannot find drop target task');
          return;
        }

        if (activeTask.status_id !== overTask.status_id) {
          // Moving to a different column - optimistic update first
          updateTaskStatusOptimistic(
            activeTaskId,
            overTask.status_id,
            originalTasks,
            dragBufferTimeout,
          );
        } else {
          // Reordering within the same column - optimistic update first
          const tasksInSameStatus = tasksByStatus[activeTask.status_id] || [];
          const oldIndex = tasksInSameStatus.findIndex((t) => t.id === activeTaskId);
          const newIndex = tasksInSameStatus.findIndex((t) => t.id === overTaskId);

          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            updateTaskOrderOptimistic(
              activeTask.status_id,
              oldIndex,
              newIndex,
              originalTasks,
              dragBufferTimeout,
            );
          }
        }
      }
    } catch (error) {
      console.error('Error in drag end handler:', error);
      // Rollback to original state
      setTasks(originalTasks);
      // Clear drag processing state
      if (dragBufferTimeout) {
        clearTimeout(dragBufferTimeout);
      }
      setIsDragProcessing(false);
    } finally {
      setActiveId(null);
      setDragOverInfo({ overTaskId: null, overStatusId: null });
    }
  };

  // Optimistic update for task status change
  const updateTaskStatusOptimistic = (
    taskId: number,
    newStatusId: number,
    originalTasks: TaskWithRelations[],
    dragBufferTimeout?: NodeJS.Timeout,
  ) => {
    // Get all tasks in the target status, ordered by position
    const tasksInTargetStatus = tasksByStatus[newStatusId] || [];

    // Calculate position (place at the end by default)
    const newPosition =
      tasksInTargetStatus.length > 0
        ? Math.max(...tasksInTargetStatus.map((t) => t.position || 0)) + 1000
        : 1000;

    // Update local state immediately
    setTasks((prevTasks) =>
      prevTasks.map((task) =>
        task.id === taskId ? { ...task, status_id: newStatusId, position: newPosition } : task,
      ),
    );

    // Run database update in background
    updateTaskStatusInBackground(
      taskId,
      newStatusId,
      newPosition,
      originalTasks,
      dragBufferTimeout,
    );
  };

  // Background database update for task status
  const updateTaskStatusInBackground = async (
    taskId: number,
    newStatusId: number,
    newPosition: number,
    originalTasks: TaskWithRelations[],
    dragBufferTimeout?: NodeJS.Timeout,
  ) => {
    const supabase = getSupabaseClient();

    try {
      // First update the task's status
      const { error: statusError } = await supabase
        .from('tasks')
        .update({ status_id: newStatusId })
        .eq('id', taskId);

      if (statusError) throw statusError;

      // Check if position record already exists
      const { data: existingPosition } = await supabase
        .from('entity_positions')
        .select('id')
        .eq('entity_id', taskId)
        .eq('entity_type', 'task')
        .eq('context', 'kanban')
        .is('user_id', null)
        .single();

      if (existingPosition) {
        // Update existing record
        const { error: positionError } = await supabase
          .from('entity_positions')
          .update({ position: newPosition })
          .eq('id', existingPosition.id);

        if (positionError) throw positionError;
      } else {
        // Create new record
        const { error: insertError } = await supabase.from('entity_positions').insert({
          entity_id: taskId,
          entity_type: 'task',
          context: 'kanban',
          position: newPosition,
          user_id: null,
        });

        if (insertError) throw insertError;
      }

      console.log('Task status updated successfully in background');
    } catch (error) {
      console.error('Error updating task status in background:', error);
      // Rollback to original state
      setTasks(originalTasks);
      // Show error notification to user
      toast.error('Failed to update task status. Changes have been reverted.');
    } finally {
      // Clear the drag buffer timeout if operation completes before buffer expires
      if (dragBufferTimeout) {
        clearTimeout(dragBufferTimeout);
        setIsDragProcessing(false);
      }
    }
  };

  // Legacy function for compatibility (keeping for other potential uses)
  const updateTaskStatus = async (taskId: number, newStatusId: number) => {
    const supabase = getSupabaseClient();

    // Get all tasks in the target status, ordered by position
    const tasksInTargetStatus = tasksByStatus[newStatusId] || [];

    // Calculate position (place at the end by default)
    let newPosition =
      tasksInTargetStatus.length > 0
        ? Math.max(...tasksInTargetStatus.map((t) => t.position || 0)) + 1000
        : 1000;

    try {
      // First update the task's status
      await supabase.from('tasks').update({ status_id: newStatusId }).eq('id', taskId);

      // Check if position record already exists
      const { data: existingPosition } = await supabase
        .from('entity_positions')
        .select('id')
        .eq('entity_id', taskId)
        .eq('entity_type', 'task')
        .eq('context', 'kanban')
        .is('user_id', null)
        .single();

      if (existingPosition) {
        // Update existing record
        await supabase
          .from('entity_positions')
          .update({ position: newPosition })
          .eq('id', existingPosition.id);
      } else {
        // Create new record only if needed
        await supabase.from('entity_positions').insert({
          entity_id: taskId,
          entity_type: 'task',
          context: 'kanban',
          position: newPosition,
          user_id: null, // Explicitly set to null for global/shared order
        });
      }

      // Optimistically update the local state
      setTasks(
        tasks.map((task) =>
          task.id === taskId ? { ...task, status_id: newStatusId, position: newPosition } : task,
        ),
      );
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  // Optimistic update for task order within a column
  const updateTaskOrderOptimistic = (
    statusId: number,
    oldIndex: number,
    newIndex: number,
    originalTasks: TaskWithRelations[],
    dragBufferTimeout?: NodeJS.Timeout,
  ) => {
    // Get the ordered tasks for this status
    const currentTasks = [...(tasksByStatus[statusId] || [])];

    // Safety checks
    if (oldIndex < 0 || oldIndex >= currentTasks.length) {
      console.error('Invalid oldIndex:', oldIndex, 'for tasks length:', currentTasks.length);
      return;
    }

    if (newIndex < 0 || newIndex >= currentTasks.length) {
      console.error('Invalid newIndex:', newIndex, 'for tasks length:', currentTasks.length);
      return;
    }

    // Get the task that's being moved
    const movedTask = currentTasks[oldIndex];
    if (!movedTask) {
      console.error('Cannot find task to move at index', oldIndex);
      return;
    }

    // Reorder tasks
    const reorderedTasks = arrayMove(currentTasks, oldIndex, newIndex);

    // Calculate new positions with even spacing (1000 units apart by default)
    const taskPositions: TaskPosition[] = reorderedTasks.map((task, index) => ({
      id: task.id,
      status_id: statusId,
      position: (index + 1) * 1000,
    }));

    // Update local state immediately with all new positions
    setTasks((prevTasks) =>
      prevTasks.map((task) => {
        const newPosition = taskPositions.find((tp) => tp.id === task.id)?.position;
        return newPosition !== undefined ? { ...task, position: newPosition } : task;
      }),
    );

    // Run database update in background
    updateTaskOrderInBackground(
      statusId,
      oldIndex,
      newIndex,
      taskPositions,
      originalTasks,
      dragBufferTimeout,
    );
  };

  // Background database update for task order
  const updateTaskOrderInBackground = async (
    statusId: number,
    oldIndex: number,
    newIndex: number,
    taskPositions: TaskPosition[],
    originalTasks: TaskWithRelations[],
    dragBufferTimeout?: NodeJS.Timeout,
  ) => {
    const supabase = getSupabaseClient();
    const currentTasks = [...(tasksByStatus[statusId] || [])];
    const movedTask = currentTasks[oldIndex];

    try {
      // Direct swap case - when swapping with just one other task
      if (Math.abs(oldIndex - newIndex) === 1) {
        const otherTaskIndex = oldIndex < newIndex ? oldIndex + 1 : oldIndex - 1;
        const otherTask = currentTasks[otherTaskIndex];

        // Get the positions from our calculated array
        const movedTaskNewPosition =
          taskPositions.find((tp) => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;
        const otherTaskNewPosition =
          taskPositions.find((tp) => tp.id === otherTask.id)?.position ||
          (otherTaskIndex === newIndex ? newIndex + 1 : oldIndex + 1) * 1000;

        // Update both tasks' positions
        const [movedTaskPosResult, otherTaskPosResult] = await Promise.all([
          supabase
            .from('entity_positions')
            .select('id')
            .eq('entity_id', movedTask.id)
            .eq('entity_type', 'task')
            .eq('context', 'kanban')
            .is('user_id', null)
            .single(),
          supabase
            .from('entity_positions')
            .select('id')
            .eq('entity_id', otherTask.id)
            .eq('entity_type', 'task')
            .eq('context', 'kanban')
            .is('user_id', null)
            .single(),
        ]);

        const updatePromises = [];

        // Update moved task position
        if (movedTaskPosResult.data) {
          updatePromises.push(
            supabase
              .from('entity_positions')
              .update({ position: movedTaskNewPosition })
              .eq('id', movedTaskPosResult.data.id),
          );
        } else {
          updatePromises.push(
            supabase.from('entity_positions').insert({
              entity_id: movedTask.id,
              entity_type: 'task',
              context: 'kanban',
              position: movedTaskNewPosition,
              user_id: null,
            }),
          );
        }

        // Update other task position
        if (otherTaskPosResult.data) {
          updatePromises.push(
            supabase
              .from('entity_positions')
              .update({ position: otherTaskNewPosition })
              .eq('id', otherTaskPosResult.data.id),
          );
        } else {
          updatePromises.push(
            supabase.from('entity_positions').insert({
              entity_id: otherTask.id,
              entity_type: 'task',
              context: 'kanban',
              position: otherTaskNewPosition,
              user_id: null,
            }),
          );
        }

        const updateResults = await Promise.all(updatePromises);
        const hasError = updateResults.some((result) => result.error);
        if (hasError) {
          throw new Error('Failed to update task positions');
        }
      } else {
        // Moving more than one position - just update the dragged task for now
        const movedTaskNewPosition =
          taskPositions.find((tp) => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;

        // Check if position record already exists for moved task
        const { data: existingPosition } = await supabase
          .from('entity_positions')
          .select('id')
          .eq('entity_id', movedTask.id)
          .eq('entity_type', 'task')
          .eq('context', 'kanban')
          .is('user_id', null)
          .single();

        if (existingPosition) {
          // Update existing record
          const { error } = await supabase
            .from('entity_positions')
            .update({ position: movedTaskNewPosition })
            .eq('id', existingPosition.id);

          if (error) throw error;
        } else {
          // Create new record
          const { error } = await supabase.from('entity_positions').insert({
            entity_id: movedTask.id,
            entity_type: 'task',
            context: 'kanban',
            position: movedTaskNewPosition,
            user_id: null,
          });

          if (error) throw error;
        }
      }

      console.log('Task order updated successfully in background');
    } catch (error) {
      console.error('Error updating task order in background:', error);
      // Rollback to original state
      setTasks(originalTasks);
      // Show error notification to user
      toast.error('Failed to update task order. Changes have been reverted.');
    } finally {
      // Clear the drag buffer timeout if operation completes before buffer expires
      if (dragBufferTimeout) {
        clearTimeout(dragBufferTimeout);
        setIsDragProcessing(false);
      }
    }
  };

  // Legacy function for compatibility (keeping for other potential uses)
  const updateTaskOrder = async (statusId: number, oldIndex: number, newIndex: number) => {
    // Get the ordered tasks for this status
    const currentTasks = [...(tasksByStatus[statusId] || [])];

    // Safety checks
    if (oldIndex < 0 || oldIndex >= currentTasks.length) {
      console.error('Invalid oldIndex:', oldIndex, 'for tasks length:', currentTasks.length);
      return;
    }

    if (newIndex < 0 || newIndex >= currentTasks.length) {
      console.error('Invalid newIndex:', newIndex, 'for tasks length:', currentTasks.length);
      return;
    }

    // Get the task that's being moved
    const movedTask = currentTasks[oldIndex];
    if (!movedTask) {
      console.error('Cannot find task to move at index', oldIndex);
      return;
    }

    // Reorder tasks
    const reorderedTasks = arrayMove(currentTasks, oldIndex, newIndex);

    // Calculate new positions with even spacing (1000 units apart by default)
    const taskPositions: TaskPosition[] = reorderedTasks.map((task, index) => ({
      id: task.id,
      status_id: statusId,
      position: (index + 1) * 1000,
    }));

    try {
      const supabase = getSupabaseClient();

      // Direct swap case - when swapping with just one other task
      if (Math.abs(oldIndex - newIndex) === 1) {
        const otherTaskIndex = oldIndex < newIndex ? oldIndex + 1 : oldIndex - 1;
        const otherTask = currentTasks[otherTaskIndex];

        // Get the positions from our calculated array
        const movedTaskNewPosition =
          taskPositions.find((tp) => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;
        const otherTaskNewPosition =
          taskPositions.find((tp) => tp.id === otherTask.id)?.position ||
          (otherTaskIndex === newIndex ? newIndex + 1 : oldIndex + 1) * 1000;

        // Update both tasks' positions
        const { data: movedTaskPos } = await supabase
          .from('entity_positions')
          .select('id')
          .eq('entity_id', movedTask.id)
          .eq('entity_type', 'task')
          .eq('context', 'kanban')
          .is('user_id', null)
          .single();

        const { data: otherTaskPos } = await supabase
          .from('entity_positions')
          .select('id')
          .eq('entity_id', otherTask.id)
          .eq('entity_type', 'task')
          .eq('context', 'kanban')
          .is('user_id', null)
          .single();

        // Update moved task position
        if (movedTaskPos) {
          await supabase
            .from('entity_positions')
            .update({ position: movedTaskNewPosition })
            .eq('id', movedTaskPos.id);
        } else {
          await supabase.from('entity_positions').insert({
            entity_id: movedTask.id,
            entity_type: 'task',
            context: 'kanban',
            position: movedTaskNewPosition,
            user_id: null,
          });
        }

        // Update other task position
        if (otherTaskPos) {
          await supabase
            .from('entity_positions')
            .update({ position: otherTaskNewPosition })
            .eq('id', otherTaskPos.id);
        } else {
          await supabase.from('entity_positions').insert({
            entity_id: otherTask.id,
            entity_type: 'task',
            context: 'kanban',
            position: otherTaskNewPosition,
            user_id: null,
          });
        }
      }
      // Moving more than one position - just update the dragged task for now
      // A more complete solution would update all affected tasks
      else {
        const movedTaskNewPosition =
          taskPositions.find((tp) => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;

        // Check if position record already exists for moved task
        const { data: existingPosition } = await supabase
          .from('entity_positions')
          .select('id')
          .eq('entity_id', movedTask.id)
          .eq('entity_type', 'task')
          .eq('context', 'kanban')
          .is('user_id', null)
          .single();

        if (existingPosition) {
          // Update existing record
          await supabase
            .from('entity_positions')
            .update({ position: movedTaskNewPosition })
            .eq('id', existingPosition.id);
        } else {
          // Create new record only if needed
          await supabase.from('entity_positions').insert({
            entity_id: movedTask.id,
            entity_type: 'task',
            context: 'kanban',
            position: movedTaskNewPosition,
            user_id: null,
          });
        }
      }

      // Optimistically update local state with all new positions
      setTasks(
        tasks.map((task) =>
          taskPositions.some((tp) => tp.id === task.id)
            ? { ...task, position: taskPositions.find((tp) => tp.id === task.id)!.position }
            : task,
        ),
      );
    } catch (error) {
      console.error('Error updating task position:', error);
    }
  };

  // Check if the page is in a loading state
  const loading = loadingStatuses || loadingPriorities || loadingTasks;

  // Loading skeleton view
  if (loading) {
    return (
      <div className="p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <Button variant="default" disabled className="flex items-center gap-1">
            <Plus size={16} />
            Add Task
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
          <TaskColumnSkeleton />
          <TaskColumnSkeleton />
          <TaskColumnSkeleton />
          <TaskColumnSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tasks</h1>
        <Button
          variant="default"
          className="flex items-center gap-1"
          onClick={() => setIsAddTaskDrawerOpen(true)}
        >
          <Plus size={16} />
          Add Task
        </Button>
      </div>

      {isAddTaskDrawerOpen || isAnyTaskDrawerOpen ? (
        // Static view when any drawer is open - prevents pointer events interference
        <TaskColumnsStatic
          statuses={statuses}
          tasksByStatus={tasksByStatus}
          priorities={priorities}
          refreshTasks={refreshTasks}
          onTaskDrawerStateChange={setIsAnyTaskDrawerOpen}
          onTaskUpdate={updateTaskInState}
        />
      ) : (
        // Interactive drag-and-drop view
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {statuses.map((status) => (
              <TaskColumn
                key={status.id}
                status={status}
                tasks={tasksByStatus[status.id] || []}
                activeId={activeId}
                dragOverInfo={dragOverInfo}
                allStatuses={statuses}
                allPriorities={priorities}
                refreshTasks={refreshTasks}
                onDrawerStateChange={setIsAnyTaskDrawerOpen}
                onTaskUpdate={updateTaskInState}
              />
            ))}
          </div>

          {/* Drag overlay shows the task being dragged */}
          <DragOverlay adjustScale={false}>
            {activeTask && (
              <div className="w-full opacity-90">
                <TaskCard
                  task={activeTask}
                  status={statuses.find((s) => s.id === activeTask.status_id) || statuses[0]}
                  priority={
                    activeTask.priorities || {
                      id: 0,
                      name: 'No Priority',
                      color: '#E2E8F0',
                      position: 0,
                      is_default: false,
                      project_id: 0,
                      created_at: '',
                      created_by: '',
                    }
                  }
                  labels={
                    activeTask.entity_labels
                      ?.map((el) => el.labels)
                      .filter((label): label is NonNullable<typeof label> => label !== null) || []
                  }
                  assignees={
                    activeTask.entity_assignees?.map((ea) => ({
                      id: ea.user_id,
                      name:
                        ea.users.user_profiles?.global_display_name ||
                        ea.users.raw_user_meta_data.name,
                      avatar_url:
                        ea.users.user_profiles?.global_avatar_url ||
                        ea.users.raw_user_meta_data.avatar_url,
                    })) || []
                  }
                  allStatuses={statuses}
                  allPriorities={priorities}
                  refreshTasks={refreshTasks}
                  onDrawerStateChange={() => {}} // Disable drawer interaction during drag
                  className="cursor-grabbing shadow-lg"
                />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add Task Drawer */}
      <AddTaskDrawer
        isOpen={isAddTaskDrawerOpen}
        onClose={() => setIsAddTaskDrawerOpen(false)}
        allStatuses={statuses}
        allPriorities={priorities}
        refreshTasks={refreshTasks}
      />

      {/* Full-screen overlay when drawer is open */}
      {isAddTaskDrawerOpen && (
        <div
          className="fixed inset-0 bg-transparent"
          style={{ pointerEvents: 'auto', zIndex: 45 }}
          onClick={() => setIsAddTaskDrawerOpen(false)}
        />
      )}
    </div>
  );
}

// Static view of columns when add drawer is open
function TaskColumnsStatic({
  statuses,
  tasksByStatus,
  priorities,
  refreshTasks,
  onTaskDrawerStateChange,
  onTaskUpdate,
}: {
  statuses: Database['public']['Tables']['statuses']['Row'][];
  tasksByStatus: Record<number, TaskWithRelations[]>;
  priorities: Database['public']['Tables']['priorities']['Row'][];
  refreshTasks: () => void;
  onTaskDrawerStateChange?: (isOpen: boolean) => void;
  onTaskUpdate?: (taskId: number, updates: Partial<TaskWithRelations>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {statuses.map((status) => (
        <div key={status.id} className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-medium">{status.name}</h3>
            <div
              className="h-6 w-6 rounded-full"
              style={{ backgroundColor: status.color || '#E2E8F0' }}
            />
          </div>

          <div className="space-y-4">
            {(tasksByStatus[status.id] || []).map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                status={status}
                priority={
                  task.priorities || {
                    id: 0,
                    name: 'No Priority',
                    color: '#E2E8F0',
                    position: 0,
                    is_default: false,
                    project_id: 0,
                    created_at: '',
                    created_by: '',
                  }
                }
                labels={
                  task.entity_labels
                    ?.map((el) => el.labels)
                    .filter((label): label is NonNullable<typeof label> => label !== null) || []
                }
                assignees={
                  task.entity_assignees?.map((ea) => ({
                    id: ea.user_id,
                    name:
                      ea.users.user_profiles?.global_display_name ||
                      ea.users.raw_user_meta_data.name,
                    avatar_url:
                      ea.users.user_profiles?.global_avatar_url ||
                      ea.users.raw_user_meta_data.avatar_url,
                  })) || []
                }
                allStatuses={statuses}
                allPriorities={priorities}
                refreshTasks={refreshTasks}
                onDrawerStateChange={onTaskDrawerStateChange}
                onTaskUpdate={onTaskUpdate}
              />
            ))}

            {(tasksByStatus[status.id] || []).length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">No tasks</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Sortable task card
function SortableTaskCard({
  task,
  isActive,
  allStatuses,
  allPriorities,
  refreshTasks,
  onDrawerStateChange,
  onTaskUpdate,
}: {
  task: TaskWithRelations;
  isActive: boolean;
  allStatuses: Database['public']['Tables']['statuses']['Row'][];
  allPriorities: Database['public']['Tables']['priorities']['Row'][];
  refreshTasks: () => void;
  onDrawerStateChange?: (isOpen: boolean) => void;
  onTaskUpdate?: (taskId: number, updates: Partial<TaskWithRelations>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: task,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isActive || isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn('touch-none focus:outline-none', isDragging ? 'z-10' : '')}
    >
      <TaskCard
        task={task}
        status={allStatuses.find((s) => s.id === task.status_id) || allStatuses[0]}
        priority={
          task.priorities || {
            id: 0,
            name: 'No Priority',
            color: '#E2E8F0',
            position: 0,
            is_default: false,
            project_id: 0,
            created_at: '',
            created_by: '',
          }
        }
        labels={
          task.entity_labels
            ?.map((el) => el.labels)
            .filter((label): label is NonNullable<typeof label> => label !== null) || []
        }
        assignees={
          task.entity_assignees?.map((ea) => ({
            id: ea.user_id,
            name: ea.users.user_profiles?.global_display_name || ea.users.raw_user_meta_data.name,
            avatar_url:
              ea.users.user_profiles?.global_avatar_url || ea.users.raw_user_meta_data.avatar_url,
          })) || []
        }
        allStatuses={allStatuses}
        allPriorities={allPriorities}
        refreshTasks={refreshTasks}
        onDrawerStateChange={onDrawerStateChange}
        onTaskUpdate={onTaskUpdate}
        className={cn('cursor-grab active:cursor-grabbing', isDragging && 'ring-2 ring-primary')}
      />
    </div>
  );
}

// Add this component before the TaskColumn component
function TaskPlaceholder() {
  return (
    <div className="animate-pulse rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3">
      <div className="mb-3 h-4 w-3/4 rounded bg-primary/10"></div>
      <div className="mb-2 h-3 w-1/2 rounded bg-primary/10"></div>
      <div className="h-3 w-full rounded bg-primary/10"></div>
    </div>
  );
}

// Now, update the TaskColumn component for better drag and drop handling:
function TaskColumn({
  status,
  tasks,
  activeId,
  dragOverInfo,
  allStatuses,
  allPriorities,
  refreshTasks,
  onDrawerStateChange,
  onTaskUpdate,
}: {
  status: Database['public']['Tables']['statuses']['Row'];
  tasks: TaskWithRelations[];
  activeId: UniqueIdentifier | null;
  dragOverInfo: { overTaskId: number | null; overStatusId: number | null };
  allStatuses: Database['public']['Tables']['statuses']['Row'][];
  allPriorities: Database['public']['Tables']['priorities']['Row'][];
  refreshTasks: () => void;
  onDrawerStateChange?: (isOpen: boolean) => void;
  onTaskUpdate?: (taskId: number, updates: Partial<TaskWithRelations>) => void;
}) {
  // Set up the column as a droppable area
  const { setNodeRef } = useDroppable({
    id: `status-${status.id}`,
    data: {
      type: 'status',
      status,
    },
  });

  // Filter out active task to prevent duplicates
  const visibleTasks = tasks.filter((task) => activeId === null || task.id !== Number(activeId));

  // Check if this column is the target for the dragged task
  const isColumnActive = dragOverInfo.overStatusId === status.id;
  const isActiveTaskFromSameColumn =
    activeId !== null && tasks.some((task) => task.id === Number(activeId));

  // Determine if and where to show placeholder
  let placeholderIndex = -1;
  let showPlaceholder = false;

  if (isColumnActive && activeId !== null) {
    if (!isActiveTaskFromSameColumn) {
      // Coming from another column - show placeholder at the end
      showPlaceholder = true;
      placeholderIndex = visibleTasks.length;
    } else if (dragOverInfo.overTaskId !== null) {
      // Reordering within same column - show placeholder at specific position
      placeholderIndex = visibleTasks.findIndex((task) => task.id === dragOverInfo.overTaskId);
      showPlaceholder = placeholderIndex !== -1;
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[12rem] flex-col rounded-lg border border-border bg-card p-4 transition-colors duration-200',
        isColumnActive && 'bg-primary/5 ring-2 ring-primary/50',
      )}
    >
      {/* Column header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium">{status.name}</h3>
        <div
          className="h-6 w-6 rounded-full"
          style={{ backgroundColor: status.color || '#E2E8F0' }}
        />
      </div>

      {/* Sortable task list */}
      <SortableContext
        items={visibleTasks.map((task) => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3">
          {visibleTasks.map((task, index) => (
            <React.Fragment key={task.id}>
              {/* Show placeholder before this task if needed */}
              {showPlaceholder && placeholderIndex === index && <TaskPlaceholder />}

              <SortableTaskCard
                task={task}
                isActive={activeId === task.id}
                allStatuses={allStatuses}
                allPriorities={allPriorities}
                refreshTasks={refreshTasks}
                onDrawerStateChange={onDrawerStateChange}
                onTaskUpdate={onTaskUpdate}
              />
            </React.Fragment>
          ))}

          {/* Show placeholder at the end if needed */}
          {showPlaceholder && placeholderIndex >= visibleTasks.length && <TaskPlaceholder />}

          {/* Empty state */}
          {visibleTasks.length === 0 && !showPlaceholder && (
            <div
              className={cn(
                'rounded-lg border-2 border-dashed py-8 text-center text-sm text-muted-foreground',
                isColumnActive ? 'border-primary/30 bg-primary/5' : 'border-border',
              )}
            >
              {isColumnActive ? 'Drop task here' : 'No tasks'}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
