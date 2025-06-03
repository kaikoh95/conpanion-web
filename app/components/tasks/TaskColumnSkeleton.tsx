import { Skeleton } from '../ui/skeleton';
import { TaskCardSkeleton } from './TaskCardSkeleton';

export function TaskColumnSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-gray-50 p-4 dark:border-gray-700 dark:bg-card">
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-24 bg-muted dark:bg-gray-700" />
        <Skeleton className="h-6 w-6 rounded-full bg-muted dark:bg-gray-700" />
      </div>

      <div className="space-y-4">
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </div>
    </div>
  );
}
