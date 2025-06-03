'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePathname, useRouter } from 'next/navigation';

interface SiteDiariesLayoutProps {
  children: React.ReactNode;
}

export default function SiteDiariesLayout({ children }: SiteDiariesLayoutProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Determine which tab is active based on the pathname
  const activeTab = pathname.includes('/templates') ? 'templates' : 'diaries';

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Site Diaries</h1>
        <p className="text-muted-foreground">Create and manage site diaries for your projects.</p>
      </div>

      <Tabs value={activeTab} className="w-full">
        <TabsList>
          <TabsTrigger value="diaries" onClick={() => router.push('/protected/site-diaries')}>
            Diaries
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            onClick={() => router.push('/protected/site-diaries/templates')}
          >
            Templates
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div>{children}</div>
    </div>
  );
}
