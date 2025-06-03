'use client';
import { Database } from '@/lib/supabase/types.generated';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { useState } from 'react';
import { TaskDrawer } from './TaskDrawer';
import { TaskWithRelations } from '@/app/protected/tasks/models';
import StatusPill from './StatusPill';
import PriorityPill from './PriorityPill';
import { cn } from '@/lib/utils';

interface TaskCardProps {
  task: TaskWithRelations;
  status: Database['public']['Tables']['statuses']['Row'];
  priority: Database['public']['Tables']['priorities']['Row'];
  labels: Database['public']['Tables']['labels']['Row'][];
  assignees: { id: string; name: string; avatar_url?: string }[];
  allStatuses: Database['public']['Tables']['statuses']['Row'][];
  allPriorities: Database['public']['Tables']['priorities']['Row'][];
  refreshTasks: () => void;
  className?: string;
}

export function TaskCard({
  task,
  status,
  priority,
  labels,
  assignees,
  allStatuses,
  allPriorities,
  refreshTasks,
  className,
}: TaskCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Card
        className={cn(
          'w-full cursor-pointer shadow-sm transition-all hover:shadow-md',
          'border hover:border-blue-500',
          'border-border bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
          className,
        )}
        onClick={() => setIsModalOpen(true)}
      >
        <CardContent className="p-4">
          {/* Title and Priority */}
          <div className="mb-2 flex items-start justify-between">
            <h3 className="line-clamp-2 text-sm font-medium text-foreground">{task.title}</h3>
            <div onClick={(e) => e.stopPropagation()}>
              <PriorityPill
                priority={priority}
                taskId={task.id}
                allPriorities={allPriorities}
                refreshTasks={refreshTasks}
                className="ml-2"
              />
            </div>
          </div>

          {/* Description (if present) */}
          {task.description && (
            <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          )}

          {/* Status */}
          <div className="mb-3 flex flex-wrap gap-1">
            <div onClick={(e) => e.stopPropagation()}>
              <StatusPill
                status={status}
                taskId={task.id}
                allStatuses={allStatuses}
                refreshTasks={refreshTasks}
              />
            </div>

            {/* Labels are now only shown in the modal */}
          </div>

          {/* Footer: Assignees and Due Date */}
          <div className="flex items-center justify-between">
            <div className="flex -space-x-2">
              {assignees.slice(0, 3).map((assignee) => (
                <Avatar key={assignee.id} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={assignee.avatar_url} />
                  <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">
                    {assignee.name
                      ? assignee.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                      : '?'}
                  </AvatarFallback>
                </Avatar>
              ))}
              {assignees.length > 3 && (
                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-xs text-secondary-foreground">
                  +{assignees.length - 3}
                </div>
              )}
            </div>

            {task.due_date && (
              <div className="text-xs text-foreground">
                {format(new Date(task.due_date), 'MMMM do, yyyy')}
                <span className="ml-1">
                  ({formatDistanceToNow(new Date(task.due_date), { addSuffix: true })})
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isModalOpen && (
        <TaskDrawer
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          task={task}
          status={status}
          priority={priority}
          labels={labels}
          assignees={assignees}
          allStatuses={allStatuses}
          allPriorities={allPriorities}
          refreshTasks={refreshTasks}
        />
      )}
    </>
  );
}
