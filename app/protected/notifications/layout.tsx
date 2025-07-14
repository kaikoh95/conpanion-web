'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigationItems = [
  {
    name: 'All Notifications',
    href: '/protected/notifications',
    icon: Bell,
  },
  {
    name: 'Settings',
    href: '/protected/settings/notifications',
    icon: Settings,
  },
];

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Navigation Tabs - Mobile responsive */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex overflow-x-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 sm:py-4',
                  'min-w-max flex-shrink-0',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-gray-300 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{item.name}</span>
                <span className="sm:hidden">
                  {item.name === 'All Notifications' ? 'All' : item.name}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Page Content */}
      <div className="px-1 sm:px-0">{children}</div>
    </div>
  );
}
