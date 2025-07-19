'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, ArrowRight, Plus } from 'lucide-react';
import { getUserSubmittedSiteDiaries, DashboardSiteDiary } from '@/lib/api/dashboard';
import { formatDistanceToNow } from 'date-fns';
import { useProject } from '@/contexts/ProjectContext';

const getStatusColor = (status: string | null) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'declined':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'revision_requested':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'submitted':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'draft':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getStatusLabel = (status: string | null) => {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'declined':
      return 'Declined';
    case 'revision_requested':
      return 'Needs Revision';
    case 'submitted':
      return 'Under Review';
    case 'draft':
      return 'Draft';
    default:
      return 'Pending';
  }
};

interface SiteDiariesSectionProps {
  onSiteDiaryClick?: (diaryId: number) => void;
}

export function SiteDiariesSection({ onSiteDiaryClick }: SiteDiariesSectionProps) {
  const [siteDiaries, setSiteDiaries] = useState<DashboardSiteDiary[]>([]);
  const [loading, setLoading] = useState(true);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadSiteDiaries = async () => {
      try {
        if (!currentProject?.id) {
          setSiteDiaries([]);
          return;
        }

        const userSiteDiaries = await getUserSubmittedSiteDiaries(currentProject.id, 5);
        setSiteDiaries(userSiteDiaries);
      } catch (error) {
        console.error('Error loading site diaries:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSiteDiaries();
  }, [currentProject?.id]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <BookOpen className="h-5 w-5 text-indigo-600" />
            My Site Diaries
          </CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <BookOpen className="h-5 w-5 text-indigo-600" />
          My Site Diaries
        </CardTitle>
        <Badge variant="secondary" className="text-xs">
          {siteDiaries.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {siteDiaries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <BookOpen className="mb-3 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-2 text-sm text-muted-foreground">No site diaries created</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/site-diaries">
                <Plus className="mr-1 h-3 w-3" />
                Create Site Diary
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {siteDiaries.map((diary) => (
                <button
                  key={diary.id}
                  onClick={() => onSiteDiaryClick?.(diary.id)}
                  className="group block w-full text-left"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium group-hover:text-primary">
                          {diary.name || 'Untitled Site Diary'}
                        </h4>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {diary.template_name}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            className={`text-xs ${getStatusColor(diary.approval_status)}`}
                            variant="outline"
                          >
                            {getStatusLabel(diary.approval_status)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(diary.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        {diary.project && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {diary.project.name}
                          </p>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t pt-2">
              <Button asChild variant="ghost" size="sm" className="w-full justify-center">
                <Link href="/protected/site-diaries">
                  View All Site Diaries
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
