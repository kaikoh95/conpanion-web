'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface NotificationBadgeProps {
  count: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function NotificationBadge({ count, size = 'md', className }: NotificationBadgeProps) {
  if (count <= 0) return null;

  const sizeClasses = {
    sm: 'h-4 w-4 text-xs',
    md: 'h-5 w-5 text-xs',
    lg: 'h-6 w-6 text-sm',
  };

  const positionClasses = {
    sm: '-top-1 -right-1',
    md: '-top-2 -right-2',
    lg: '-top-2 -right-2',
  };

  return (
    <span
      className={cn(
        'absolute flex items-center justify-center rounded-full bg-red-500 font-medium text-white',
        sizeClasses[size],
        positionClasses[size],
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
