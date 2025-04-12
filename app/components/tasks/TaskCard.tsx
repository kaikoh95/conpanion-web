'use client'
import { Database } from '@/lib/supabase/types.generated'
import { formatDistanceToNow, format } from 'date-fns'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar'
import { useState } from 'react'
import { TaskDrawer } from './TaskDrawer'
import { TaskWithRelations } from '@/app/protected/tasks/models'
import StatusPill from './StatusPill'
import PriorityPill from './PriorityPill'
import { cn } from '@/lib/utils'

interface TaskCardProps {
  task: TaskWithRelations
  status: Database['public']['Tables']['statuses']['Row']
  priority: Database['public']['Tables']['priorities']['Row']
  labels: Database['public']['Tables']['labels']['Row'][]
  assignees: { id: string; name: string; avatar_url?: string }[]
  allStatuses: Database['public']['Tables']['statuses']['Row'][]
  allPriorities: Database['public']['Tables']['priorities']['Row'][]
  refreshTasks: () => void
  className?: string
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
  className
}: TaskCardProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Card 
        className={cn(
          "w-full shadow-sm hover:shadow-md transition-all cursor-pointer",
          "border hover:border-blue-500",
          "bg-gray-50 dark:bg-gray-800 border-border dark:border-gray-700",
          className
        )}
        onClick={() => setIsModalOpen(true)}
      >
        <CardContent className="p-4">
          {/* Title and Priority */}
          <div className="flex items-start justify-between mb-2">
            <h3 className="text-sm font-medium text-foreground line-clamp-2">{task.title}</h3>
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
            <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
              {task.description}
            </p>
          )}
          
          {/* Status */}
          <div className="flex flex-wrap gap-1 mb-3">
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
          <div className="flex justify-between items-center">
            <div className="flex -space-x-2">
              {assignees.slice(0, 3).map((assignee) => (
                <Avatar key={assignee.id} className="h-6 w-6 border-2 border-background">
                  <AvatarImage src={assignee.avatar_url} />
                  <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                    {assignee.name.split(' ').map(n => n[0]).join('')}
                  </AvatarFallback>
                </Avatar>
              ))}
              {assignees.length > 3 && (
                <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-xs text-secondary-foreground border-2 border-background">
                  +{assignees.length - 3}
                </div>
              )}
            </div>
            
            {task.due_date && (
              <div className="text-xs text-foreground">
                {format(new Date(task.due_date), 'MMMM do, yyyy')}
                <span className="ml-1">({formatDistanceToNow(new Date(task.due_date), { addSuffix: true })})</span>
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
  )
} 