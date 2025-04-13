'use client'
import { redirect } from "next/navigation";
import ClientLayout from './client-layout';
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

  return <ClientLayout>{children}</ClientLayout>;
} 