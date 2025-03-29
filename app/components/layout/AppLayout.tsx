import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <TopBar />
      <main className="pl-16 pt-14">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
} 