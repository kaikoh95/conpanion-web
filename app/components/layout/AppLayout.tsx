import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useState, useRef } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  return (
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
  );
}
