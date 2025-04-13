'use client';

import { Search, Bell, User, Menu } from 'lucide-react';
import { signOutAction } from '@/app/actions';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { Button } from '@/components/ui/button';
import { RefObject } from 'react';

interface TopBarProps {
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
  toggleButtonRef: RefObject<HTMLButtonElement | null>;
}

export default function TopBar({ isSidebarOpen, onSidebarToggle, toggleButtonRef }: TopBarProps) {
  return (
    <header 
      className="h-14 bg-background/80 dark:bg-background/95 border-b flex items-center justify-between px-4 fixed top-0 right-0 left-0 z-20 lg:left-[var(--sidebar-width)]"
    >
      <div className="flex items-center gap-4">
        <Button
          ref={toggleButtonRef}
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onSidebarToggle}
        >
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle menu</span>
        </Button>

        <div className="relative flex-1 max-w-md hidden md:block">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <input
            type="text"
            placeholder="Search everything..."
            className="w-full pl-10 pr-4 py-1.5 text-sm bg-muted/50 rounded-md focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <ThemeSwitcher />
        <button className="p-2 text-muted-foreground hover:bg-muted/50 rounded-lg">
          <Bell className="w-5 h-5" />
        </button>
        <div className="relative group">
          <button className="flex items-center space-x-1 p-1 hover:bg-muted/50 rounded-lg">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
              <User className="w-5 h-5" />
            </div>
          </button>
          <div className="absolute right-0 top-full mt-2 w-48 bg-background/95 backdrop-blur-sm rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="p-2">
              <button className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 rounded">
                Profile Settings
              </button>
              <form action={signOutAction}>
                <button type="submit" className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-muted/50 rounded">
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
} 