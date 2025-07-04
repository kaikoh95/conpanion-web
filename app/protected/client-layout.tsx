'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { ProjectProvider } from '@/contexts/ProjectContext';
import { NotificationProvider } from '@/contexts/NotificationContext';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [children]);

  // Handle click outside to close sidebar
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        isSidebarOpen &&
        sidebarRef.current &&
        !sidebarRef.current.contains(event.target as Node) &&
        toggleButtonRef.current &&
        !toggleButtonRef.current.contains(event.target as Node)
      ) {
        setIsSidebarOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSidebarOpen]);

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
    <OrganizationProvider>
      <ProjectProvider>
        <NotificationProvider>
          <div className="min-h-screen bg-background">
            <Sidebar isOpen={isSidebarOpen} ref={sidebarRef} onNavigate={handleCloseSidebar} />
            <TopBar
              isSidebarOpen={isSidebarOpen}
              onSidebarToggle={() => setIsSidebarOpen(!isSidebarOpen)}
              toggleButtonRef={toggleButtonRef}
            />
            <main className="pt-14 transition-[padding] duration-300 lg:pl-[var(--sidebar-width)]">
              <div className="p-4 md:p-6">{children}</div>
            </main>
          </div>
        </NotificationProvider>
      </ProjectProvider>
    </OrganizationProvider>
  );
}
