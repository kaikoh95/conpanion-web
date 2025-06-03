'use client';

import * as React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';
import { cn } from '@/lib/utils';

interface AvatarGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  avatars: {
    name: string;
    image?: string;
  }[];
  max?: number;
}

export function AvatarGroup({ avatars, max = 4, className, ...props }: AvatarGroupProps) {
  const slicedAvatars = avatars.slice(0, max);
  const remainingAvatars = avatars.length - max;

  return (
    <div className={cn('flex -space-x-2', className)} {...props}>
      {slicedAvatars.map((avatar, i) => (
        <Avatar key={i} className="border-2 border-background">
          {avatar.image && <AvatarImage src={avatar.image} alt={avatar.name} />}
          <AvatarFallback>{avatar.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      ))}
      {remainingAvatars > 0 && (
        <Avatar className="border-2 border-background">
          <AvatarFallback>+{remainingAvatars}</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
