'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CheckSquare, FileText, Book, Settings, List } from 'lucide-react';
import { useState, useEffect, forwardRef } from 'react';

const navItems = [
  { name: 'Home', icon: Home, href: '/protected' },
  { name: 'Tasks', icon: CheckSquare, href: '/protected/tasks' },
  { name: 'Forms', icon: FileText, href: '/protected/forms' },
  { name: 'Entries', icon: List, href: '/protected/entries' },
  { name: 'Site Diaries', icon: Book, href: '/protected/site-diaries' },
];

interface SidebarProps {
  isOpen?: boolean;
  onNavigate?: () => void;
}

const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(({ isOpen, onNavigate }, ref) => {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Track screen size for responsive behavior
  useEffect(() => {
    const checkIsMobile = () => {
      setIsMobile(window.innerWidth < 1024); // lg breakpoint is 1024px
    };

    // Initial check
    checkIsMobile();

    // Listen for window resize
    window.addEventListener('resize', checkIsMobile);

    // Cleanup
    return () => window.removeEventListener('resize', checkIsMobile);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isExpanded ? '16rem' : '4rem');
  }, [isExpanded]);

  const handleClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  // Determine when to show text
  const shouldShowText = (isMobile && isOpen) || (!isMobile && isExpanded);

  return (
    <>
      <aside
        ref={ref}
        className={`fixed inset-y-0 left-0 z-30 flex w-[16rem] -translate-x-full flex-col overflow-hidden border-r bg-background py-4 transition-all duration-300 dark:bg-background lg:w-16 lg:translate-x-0 lg:hover:w-64 ${isOpen ? 'translate-x-0' : ''} ${isExpanded ? 'lg:w-64' : ''} `}
        onMouseEnter={() => !isMobile && setIsExpanded(true)}
        onMouseLeave={() => !isMobile && setIsExpanded(false)}
      >
        <nav className="mt-4 flex flex-1 flex-col space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/protected' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleClick}
                className={`relative mx-2 flex items-center rounded-lg px-3 py-2 ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                } `}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {shouldShowText && (
                  <span className="ml-3 whitespace-nowrap text-sm">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/protected/settings"
          onClick={handleClick}
          className="relative mx-2 flex items-center rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <Settings className="h-5 w-5 shrink-0" />
          {shouldShowText && <span className="ml-3 whitespace-nowrap text-sm">Settings</span>}
        </Link>
      </aside>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-background/80 backdrop-blur-sm lg:hidden"
          aria-hidden="true"
        />
      )}
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
