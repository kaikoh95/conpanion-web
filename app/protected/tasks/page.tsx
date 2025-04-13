'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { TaskCard } from '@/app/components/tasks/TaskCard'
import { TaskColumnSkeleton } from '@/app/components/tasks/TaskColumnSkeleton'
import { TaskCardSkeleton } from '@/app/components/tasks/TaskCardSkeleton'
import { useTaskStatuses, useTaskPriorities, useTasks } from './hooks'
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddTaskDrawer } from '@/app/components/tasks/AddTaskDrawer'
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
  useDroppable
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TaskWithRelations } from './models'
import { cn } from "@/lib/utils"
import { getSupabaseClient } from "@/lib/supabase/client"
import { Database } from '@/lib/supabase/types.generated'

// Define types for task position data
type TaskPosition = {
  id: number;
  status_id: number;
  position: number;
};

export default function TasksPage() {
  const { statuses, loading: loadingStatuses } = useTaskStatuses({ projectId: 1 });
  const { priorities, loading: loadingPriorities } = useTaskPriorities({ projectId: 1 });
  const { tasks: remoteTasks, loading: loadingTasks, refresh: refreshTasks } = useTasks({ projectId: 1 });
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [isAddTaskDrawerOpen, setIsAddTaskDrawerOpen] = useState(false);
  const [dragOverInfo, setDragOverInfo] = useState<{
    overTaskId: number | null;
    overStatusId: number | null;
  }>({ overTaskId: null, overStatusId: null });
  
  // Get the active task
  const activeTask = useMemo(() => {
    if (!activeId) return null;
    return tasks.find(task => task.id === Number(activeId));
  }, [activeId, tasks]);

  // Generate ordered tasks for each status
  const tasksByStatus = useMemo(() => {
    const result: Record<number, TaskWithRelations[]> = {};
    
    if (statuses && tasks) {
      // Initialize empty arrays for each status
      statuses.forEach(status => {
        result[status.id] = [];
      });
      
      // Group tasks by status
      tasks.forEach(task => {
        if (task.status_id in result) {
          result[task.status_id].push(task);
        }
      });
      
      // Sort each group by position
      Object.keys(result).forEach(statusId => {
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
  
  // Configure sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
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
        overStatusId: statusId
      });
    } else {
      // Hovering over a task - use the task's status ID rather than task ID
      const overTask = tasks.find(task => task.id === Number(overId));
      if (overTask) {
        setDragOverInfo({
          overTaskId: Number(overId),
          overStatusId: overTask.status_id
        });
      }
    }
  };

  // Handle drag end and persistence
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || !active) {
      setActiveId(null);
      return;
    }
    
    const activeTaskId = Number(active.id);
    const activeTask = tasks.find(task => task.id === activeTaskId);
    
    if (!activeTask) {
      setActiveId(null);
      return;
    }
    
    try {
      // Check if we're dropping directly on a status column
      const isColumnDrop = typeof over.id === 'string' && over.id.startsWith('status-');
      
      if (isColumnDrop) {
        // Dropping directly on a column
        const dropStatusId = Number(over.id.toString().replace('status-', ''));
        
        if (activeTask.status_id !== dropStatusId) {
          // Only update if status changed
          await updateTaskStatus(activeTaskId, dropStatusId);
        } else {
          // We're dropping back in the same column - move to the end
          const tasksInColumn = tasksByStatus[dropStatusId] || [];
          if (tasksInColumn.length > 0) {
            const oldIndex = tasksInColumn.findIndex(t => t.id === activeTaskId);
            if (oldIndex !== -1) {
              await updateTaskOrder(dropStatusId, oldIndex, tasksInColumn.length - 1);
            }
          }
        }
      } else {
        // Dropping on another task
        const overTaskId = Number(over.id);
        const overTask = tasks.find(task => task.id === overTaskId);
        
        if (!overTask) {
          console.error('Cannot find drop target task');
          return;
        }
        
        if (activeTask.status_id !== overTask.status_id) {
          // Moving to a different column
          await updateTaskStatus(activeTaskId, overTask.status_id);
        } else {
          // Reordering within the same column
          const tasksInSameStatus = tasksByStatus[activeTask.status_id] || [];
          const oldIndex = tasksInSameStatus.findIndex(t => t.id === activeTaskId);
          const newIndex = tasksInSameStatus.findIndex(t => t.id === overTaskId);
          
          if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
            await updateTaskOrder(activeTask.status_id, oldIndex, newIndex);
          }
        }
      }
    } catch (error) {
      console.error('Error updating task', error);
    } finally {
      setActiveId(null);
      setDragOverInfo({ overTaskId: null, overStatusId: null });
    }
  };

  // Update task status and position in a new column
  const updateTaskStatus = async (taskId: number, newStatusId: number) => {
    const supabase = getSupabaseClient();
    
    // Get all tasks in the target status, ordered by position
    const tasksInTargetStatus = tasksByStatus[newStatusId] || [];
    
    // Calculate position (place at the end by default)
    let newPosition = tasksInTargetStatus.length > 0
      ? Math.max(...tasksInTargetStatus.map(t => t.position || 0)) + 1000
      : 1000;
    
    try {
      // First update the task's status
      await supabase
        .from('tasks')
        .update({ status_id: newStatusId })
        .eq('id', taskId);
      
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
        await supabase
          .from('entity_positions')
          .insert({
            entity_id: taskId,
            entity_type: 'task',
            context: 'kanban',
            position: newPosition,
            user_id: null // Explicitly set to null for global/shared order
          });
      }
      
      // Optimistically update the local state
      setTasks(tasks.map(task =>
        task.id === taskId
          ? { ...task, status_id: newStatusId, position: newPosition }
          : task
      ));
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  // Update task order within a column
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
      position: (index + 1) * 1000
    }));

    try {
      const supabase = getSupabaseClient();

      // Direct swap case - when swapping with just one other task
      if (Math.abs(oldIndex - newIndex) === 1) {
        const otherTaskIndex = oldIndex < newIndex ? oldIndex + 1 : oldIndex - 1;
        const otherTask = currentTasks[otherTaskIndex];
        
        // Get the positions from our calculated array
        const movedTaskNewPosition = taskPositions.find(tp => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;
        const otherTaskNewPosition = taskPositions.find(tp => tp.id === otherTask.id)?.position || (otherTaskIndex === newIndex ? (newIndex + 1) : (oldIndex + 1)) * 1000;
        
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
          await supabase
            .from('entity_positions')
            .insert({
              entity_id: movedTask.id,
              entity_type: 'task',
              context: 'kanban',
              position: movedTaskNewPosition,
              user_id: null
            });
        }
        
        // Update other task position
        if (otherTaskPos) {
          await supabase
            .from('entity_positions')
            .update({ position: otherTaskNewPosition })
            .eq('id', otherTaskPos.id);
        } else {
          await supabase
            .from('entity_positions')
            .insert({
              entity_id: otherTask.id,
              entity_type: 'task',
              context: 'kanban',
              position: otherTaskNewPosition,
              user_id: null
            });
        }
      } 
      // Moving more than one position - just update the dragged task for now
      // A more complete solution would update all affected tasks
      else {
        const movedTaskNewPosition = taskPositions.find(tp => tp.id === movedTask.id)?.position || (newIndex + 1) * 1000;
        
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
          await supabase
            .from('entity_positions')
            .insert({
              entity_id: movedTask.id,
              entity_type: 'task',
              context: 'kanban',
              position: movedTaskNewPosition,
              user_id: null
            });
        }
      }
      
      // Optimistically update local state with all new positions
      setTasks(tasks.map(task =>
        taskPositions.some(tp => tp.id === task.id)
          ? { ...task, position: taskPositions.find(tp => tp.id === task.id)!.position }
          : task
      ));
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
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <Button variant="default" disabled className="flex items-center gap-1">
            <Plus size={16} />
            Add Task
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
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
      <div className="flex justify-between items-center mb-6">
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
      
      {isAddTaskDrawerOpen ? (
        // Static view when drawer is open
        <TaskColumnsStatic 
          statuses={statuses}
          tasksByStatus={tasksByStatus}
          priorities={priorities}
          refreshTasks={refreshTasks}
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
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {statuses.map(status => (
              <TaskColumn
                key={status.id}
                status={status}
                tasks={tasksByStatus[status.id] || []}
                activeId={activeId}
                dragOverInfo={dragOverInfo}
                allStatuses={statuses}
                allPriorities={priorities}
                refreshTasks={refreshTasks}
              />
            ))}
          </div>
          
          {/* Drag overlay shows the task being dragged */}
          <DragOverlay adjustScale={false}>
            {activeTask && (
              <div className="w-full opacity-90">
                <TaskCard
                  task={activeTask}
                  status={statuses.find(s => s.id === activeTask.status_id) || statuses[0]}
                  priority={activeTask.priorities || { 
                    id: 0, name: 'No Priority', color: '#E2E8F0',
                    position: 0, is_default: false, project_id: 0, 
                    created_at: '', created_by: ''
                  }}
                  labels={activeTask.entity_labels
                    ?.map(el => el.labels)
                    .filter((label): label is NonNullable<typeof label> => label !== null) || []}
                  assignees={activeTask.entity_assignees?.map(ea => ({
                    id: ea.user_id,
                    name: ea.users.raw_user_meta_data.name,
                    avatar_url: ea.users.raw_user_meta_data.avatar_url,
                  })) || []}
                  allStatuses={statuses}
                  allPriorities={priorities}
                  refreshTasks={refreshTasks}
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
  refreshTasks 
}: { 
  statuses: Database['public']['Tables']['statuses']['Row'][], 
  tasksByStatus: Record<number, TaskWithRelations[]>, 
  priorities: Database['public']['Tables']['priorities']['Row'][], 
  refreshTasks: () => void 
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {statuses.map(status => (
            <div
              key={status.id}
          className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">{status.name}</h3>
                <div 
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: status.color || '#E2E8F0' }}
                />
              </div>
              
          <div className="space-y-4">
            {(tasksByStatus[status.id] || []).map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      status={status}
                priority={task.priorities || { 
                  id: 0, name: 'No Priority', color: '#E2E8F0',
                  position: 0, is_default: false, project_id: 0, 
                  created_at: '', created_by: ''
                }}
                labels={task.entity_labels
                  ?.map(el => el.labels)
                  .filter((label): label is NonNullable<typeof label> => label !== null) || []}
                assignees={task.entity_assignees?.map(ea => ({
                        id: ea.user_id,
                        name: ea.users.raw_user_meta_data.name,
                        avatar_url: ea.users.raw_user_meta_data.avatar_url,
                })) || []}
                allStatuses={statuses}
                allPriorities={priorities}
                refreshTasks={refreshTasks}
                    />
                  ))}
            
            {(tasksByStatus[status.id] || []).length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No tasks
              </div>
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
  refreshTasks
}: { 
  task: TaskWithRelations, 
  isActive: boolean,
  allStatuses: Database['public']['Tables']['statuses']['Row'][],
  allPriorities: Database['public']['Tables']['priorities']['Row'][],
  refreshTasks: () => void
}) {
  const { 
    attributes, 
    listeners, 
    setNodeRef, 
    transform, 
    transition, 
    isDragging 
  } = useSortable({
    id: task.id,
    data: task
  });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isActive || isDragging ? 0.4 : 1
  };
  
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={style}
      className={cn(
        "touch-none focus:outline-none",
        isDragging ? "z-10" : ""
      )}
    >
      <TaskCard
        task={task}
        status={allStatuses.find(s => s.id === task.status_id) || allStatuses[0]}
        priority={task.priorities || { 
          id: 0, name: 'No Priority', color: '#E2E8F0',
          position: 0, is_default: false, project_id: 0, 
          created_at: '', created_by: ''
        }}
        labels={task.entity_labels
          ?.map(el => el.labels)
          .filter((label): label is NonNullable<typeof label> => label !== null) || []}
        assignees={task.entity_assignees?.map(ea => ({
          id: ea.user_id,
          name: ea.users.raw_user_meta_data.name,
          avatar_url: ea.users.raw_user_meta_data.avatar_url,
        })) || []}
        allStatuses={allStatuses}
        allPriorities={allPriorities}
        refreshTasks={refreshTasks}
        className={cn(
          "cursor-grab active:cursor-grabbing",
          isDragging && "ring-2 ring-primary"
        )}
      />
    </div>
  );
}

// Add this component before the TaskColumn component
function TaskPlaceholder() {
  return (
    <div className="border-2 border-dashed border-primary/40 bg-primary/5 rounded-lg p-3 animate-pulse">
      <div className="h-4 w-3/4 bg-primary/10 rounded mb-3"></div>
      <div className="h-3 w-1/2 bg-primary/10 rounded mb-2"></div>
      <div className="h-3 w-full bg-primary/10 rounded"></div>
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
  refreshTasks
}: {
  status: Database['public']['Tables']['statuses']['Row'],
  tasks: TaskWithRelations[],
  activeId: UniqueIdentifier | null,
  dragOverInfo: { overTaskId: number | null, overStatusId: number | null },
  allStatuses: Database['public']['Tables']['statuses']['Row'][],
  allPriorities: Database['public']['Tables']['priorities']['Row'][],
  refreshTasks: () => void
}) {
  // Set up the column as a droppable area
  const { setNodeRef } = useDroppable({
    id: `status-${status.id}`,
    data: {
      type: 'status',
      status
    }
  });
  
  // Filter out active task to prevent duplicates
  const visibleTasks = tasks.filter(task => 
    activeId === null || task.id !== Number(activeId)
  );

  // Check if this column is the target for the dragged task
  const isColumnActive = dragOverInfo.overStatusId === status.id;
  const isActiveTaskFromSameColumn = activeId !== null && tasks.some(task => task.id === Number(activeId));
  
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
      placeholderIndex = visibleTasks.findIndex(task => task.id === dragOverInfo.overTaskId);
      showPlaceholder = placeholderIndex !== -1;
    }
  }
  
  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "bg-card border border-border rounded-lg p-4 min-h-[12rem] flex flex-col transition-colors duration-200",
        isColumnActive && "ring-2 ring-primary/50 bg-primary/5"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">{status.name}</h3>
        <div 
          className="w-6 h-6 rounded-full"
          style={{ backgroundColor: status.color || '#E2E8F0' }}
        />
      </div>
      
      {/* Sortable task list */}
      <SortableContext 
        items={visibleTasks.map(task => task.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-3">
          {visibleTasks.map((task, index) => (
            <React.Fragment key={task.id}>
              {/* Show placeholder before this task if needed */}
              {showPlaceholder && placeholderIndex === index && (
                <TaskPlaceholder />
              )}
              
              <SortableTaskCard
                task={task}
                isActive={activeId === task.id}
                allStatuses={allStatuses}
                allPriorities={allPriorities}
                refreshTasks={refreshTasks}
              />
            </React.Fragment>
          ))}
          
          {/* Show placeholder at the end if needed */}
          {showPlaceholder && placeholderIndex >= visibleTasks.length && (
            <TaskPlaceholder />
          )}
          
          {/* Empty state */}
          {visibleTasks.length === 0 && !showPlaceholder && (
            <div className={cn(
              "text-center py-8 text-muted-foreground text-sm border-2 border-dashed rounded-lg",
              isColumnActive ? "bg-primary/5 border-primary/30" : "border-border"
            )}>
              {isColumnActive ? "Drop task here" : "No tasks"}
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
} 