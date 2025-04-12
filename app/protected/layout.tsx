'use client'
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Sidebar from '../components/layout/Sidebar';
import TopBar from '../components/layout/TopBar';
import { useAuth } from "@/hooks/useAuth";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (!user && !loading) {
    return redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <TopBar />
      <main className="transition-[padding-left] duration-300" style={{ paddingLeft: 'var(--sidebar-width)', paddingTop: '3.5rem' }}>
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  );
} 