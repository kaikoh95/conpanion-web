'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, User, ArrowRight, Plus } from 'lucide-react';
import { getUserAssignedForms, DashboardForm } from '@/lib/api/dashboard';
import { formatDistanceToNow } from 'date-fns';
import { useProject } from '@/contexts/ProjectContext';

interface FormsSectionProps {
  onFormClick?: (formId: number) => void;
}

export function FormsSection({ onFormClick }: FormsSectionProps) {
  const [forms, setForms] = useState<DashboardForm[]>([]);
  const [loading, setLoading] = useState(true);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadForms = async () => {
      try {
        if (!currentProject?.id) {
          setForms([]);
          return;
        }

        const userForms = await getUserAssignedForms(currentProject.id, 5);
        setForms(userForms);
      } catch (error) {
        console.error('Error loading forms:', error);
      } finally {
        setLoading(false);
      }
    };

    loadForms();
  }, [currentProject?.id]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <FileText className="h-5 w-5 text-green-600" />
            Assigned Forms
          </CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
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
          <FileText className="h-5 w-5 text-green-600" />
          Assigned Forms
        </CardTitle>
        <Badge variant="secondary" className="text-xs">
          {forms.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="mb-3 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-2 text-sm text-muted-foreground">No forms assigned</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/forms">
                <Plus className="mr-1 h-3 w-3" />
                Browse Forms
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {forms.map((form) => (
                <button
                  key={form.id}
                  onClick={() => onFormClick?.(form.id)}
                  className="group block w-full text-left"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium group-hover:text-primary">
                          {form.name}
                        </h4>
                        {form.assigned_by && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            Assigned by {form.assigned_by.name}
                          </div>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created{' '}
                          {formatDistanceToNow(new Date(form.created_at), { addSuffix: true })}
                        </p>
                        {form.project && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {form.project.name}
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
                <Link href="/protected/forms">
                  View All Forms
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
