'use client';

import { Card, CardContent } from '../ui/card';
import { cn } from '@/lib/utils';

interface TaskCardSkeletonProps {
  className?: string;
}

export function TaskCardSkeleton({ className }: TaskCardSkeletonProps) {
  return (
    <Card
      className={cn(
        'w-full shadow-sm',
        'border',
        'border-border bg-gray-50 dark:border-gray-700 dark:bg-gray-800',
        className,
      )}
    >
      <CardContent className="p-4">
        {/* Title and Priority placeholder */}
        <div className="mb-2 flex items-start justify-between">
          <div className="h-5 w-3/4 animate-pulse rounded bg-primary/10 dark:bg-gray-700"></div>
          <div className="ml-2 h-5 w-6 animate-pulse rounded-full bg-primary/10 dark:bg-gray-700"></div>
        </div>

        {/* Description placeholder */}
        <div className="mb-1 h-4 w-full animate-pulse rounded bg-primary/10 dark:bg-gray-700"></div>
        <div className="mb-3 h-4 w-2/3 animate-pulse rounded bg-primary/10 dark:bg-gray-700"></div>

        {/* Status placeholder */}
        <div className="mb-3 flex">
          <div className="h-6 w-20 animate-pulse rounded-full bg-primary/10 dark:bg-gray-700"></div>
        </div>

        {/* Footer: Assignees and Due Date placeholder */}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            <div className="h-6 w-6 animate-pulse rounded-full bg-primary/10 dark:bg-gray-700"></div>
            <div className="h-6 w-6 animate-pulse rounded-full bg-primary/10 dark:bg-gray-700"></div>
          </div>
          <div className="h-4 w-20 animate-pulse rounded bg-primary/10 dark:bg-gray-700"></div>
        </div>
      </CardContent>
    </Card>
  );
}
