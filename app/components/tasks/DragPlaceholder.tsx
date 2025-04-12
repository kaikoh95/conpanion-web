'use client'

import { Card, CardContent } from '../ui/card'
import { cn } from '@/lib/utils'

interface DragPlaceholderProps {
  className?: string
  height?: number | string
}

export function DragPlaceholder({ className, height }: DragPlaceholderProps) {
  return (
    <Card 
      className={cn(
        "w-full border-2 border-dashed rounded-lg shadow-md transition-all",
        "border-blue-500 dark:border-blue-400",
        "bg-blue-50 dark:bg-blue-950/30",
        "animate-pulse",
        className
      )}
      style={{ 
        height: height ? `${height}px` : 'auto',
        minHeight: '120px', // Ensure minimum height
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1), 0 0 0 2px rgba(59, 130, 246, 0.3)'
      }}
    >
      <CardContent className="p-4">
        {/* Title and Priority placeholder */}
        <div className="flex items-start justify-between mb-2">
          <div className="h-5 w-3/4 bg-blue-200 dark:bg-blue-500/30 rounded"></div>
          <div className="h-5 w-6 bg-blue-200 dark:bg-blue-500/30 rounded-full ml-2"></div>
        </div>
        
        {/* Description placeholder */}
        <div className="h-4 w-full bg-blue-200 dark:bg-blue-500/30 rounded mb-1"></div>
        <div className="h-4 w-2/3 bg-blue-200 dark:bg-blue-500/30 rounded mb-3"></div>
        
        {/* Status placeholder */}
        <div className="flex mb-3">
          <div className="h-6 w-20 bg-blue-200 dark:bg-blue-500/30 rounded-full"></div>
        </div>
        
        {/* Footer: Assignees and Due Date placeholder */}
        <div className="flex justify-between items-center">
          <div className="flex -space-x-2">
            <div className="h-6 w-6 bg-blue-200 dark:bg-blue-500/30 rounded-full"></div>
            <div className="h-6 w-6 bg-blue-200 dark:bg-blue-500/30 rounded-full"></div>
          </div>
          <div className="h-4 w-20 bg-blue-200 dark:bg-blue-500/30 rounded"></div>
        </div>
      </CardContent>
    </Card>
  )
} 