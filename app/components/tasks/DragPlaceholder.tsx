'use client';

import { Card, CardContent } from '../ui/card';
import { cn } from '@/lib/utils';

interface DragPlaceholderProps {
  className?: string;
  height?: number | string;
}

export function DragPlaceholder({ className, height }: DragPlaceholderProps) {
  return (
    <Card
      className={cn(
        'w-full rounded-lg border-2 border-dashed shadow-md transition-all',
        'border-blue-500 dark:border-blue-400',
        'bg-blue-50 dark:bg-blue-950/30',
        'animate-pulse',
        className,
      )}
      style={{
        height: height ? `${height}px` : 'auto',
        minHeight: '120px', // Ensure minimum height
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1), 0 0 0 2px rgba(59, 130, 246, 0.3)',
      }}
    >
      <CardContent className="p-4">
        {/* Title and Priority placeholder */}
        <div className="mb-2 flex items-start justify-between">
          <div className="h-5 w-3/4 rounded bg-blue-200 dark:bg-blue-500/30"></div>
          <div className="ml-2 h-5 w-6 rounded-full bg-blue-200 dark:bg-blue-500/30"></div>
        </div>

        {/* Description placeholder */}
        <div className="mb-1 h-4 w-full rounded bg-blue-200 dark:bg-blue-500/30"></div>
        <div className="mb-3 h-4 w-2/3 rounded bg-blue-200 dark:bg-blue-500/30"></div>

        {/* Status placeholder */}
        <div className="mb-3 flex">
          <div className="h-6 w-20 rounded-full bg-blue-200 dark:bg-blue-500/30"></div>
        </div>

        {/* Footer: Assignees and Due Date placeholder */}
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            <div className="h-6 w-6 rounded-full bg-blue-200 dark:bg-blue-500/30"></div>
            <div className="h-6 w-6 rounded-full bg-blue-200 dark:bg-blue-500/30"></div>
          </div>
          <div className="h-4 w-20 rounded bg-blue-200 dark:bg-blue-500/30"></div>
        </div>
      </CardContent>
    </Card>
  );
}
