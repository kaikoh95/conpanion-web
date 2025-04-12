import { Skeleton } from "../ui/skeleton"
import { TaskCardSkeleton } from "./TaskCardSkeleton"

export function TaskColumnSkeleton() {
  return (
    <div className="bg-gray-50 dark:bg-card border border-border dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-24 bg-muted dark:bg-gray-700" />
        <Skeleton className="w-6 h-6 rounded-full bg-muted dark:bg-gray-700" />
      </div>
      
      <div className="space-y-4">
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </div>
    </div>
  )
} 