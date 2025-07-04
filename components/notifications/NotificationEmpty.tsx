'use client';

import React from 'react';
import { Bell } from 'lucide-react';

export function NotificationEmpty() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-muted/50 p-4">
        <Bell className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 font-medium text-foreground">No notifications</h3>
      <p className="text-sm text-muted-foreground">
        You're all caught up! Check back later for new updates.
      </p>
    </div>
  );
}
