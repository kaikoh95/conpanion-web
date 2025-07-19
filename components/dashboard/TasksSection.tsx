'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckSquare, Calendar, ArrowRight, Plus } from 'lucide-react';
import { getUserAssignedTasks, DashboardTask } from '@/lib/api/dashboard';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/ProjectContext';

interface TasksSectionProps {
  onTaskClick?: (taskId: number) => void;
}

export function TasksSection({ onTaskClick }: TasksSectionProps) {
  const [tasks, setTasks] = useState<DashboardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadTasks = async () => {
      try {
        if (!currentProject?.id) {
          setTasks([]);
          return;
        }

        const userTasks = await getUserAssignedTasks(currentProject.id, 5);
        setTasks(userTasks);
      } catch (error) {
        console.error('Error loading tasks:', error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [currentProject?.id]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <CheckSquare className="h-5 w-5 text-blue-600" />
            My Tasks
          </CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
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
          <CheckSquare className="h-5 w-5 text-blue-600" />
          My Tasks
        </CardTitle>
        <Badge variant="secondary" className="text-xs">
          {tasks.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckSquare className="mb-3 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-2 text-sm text-muted-foreground">No tasks assigned</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/tasks">
                <Plus className="mr-1 h-3 w-3" />
                Create Task
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id)}
                  className="group block w-full text-left"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium group-hover:text-primary">
                          {task.title}
                        </h4>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {task.status && (
                            <Badge
                              variant="secondary"
                              className="text-xs"
                              style={{
                                backgroundColor: task.status.color
                                  ? `${task.status.color}20`
                                  : undefined,
                                color: task.status.color || undefined,
                                borderColor: task.status.color
                                  ? `${task.status.color}40`
                                  : undefined,
                              }}
                            >
                              {task.status.name}
                            </Badge>
                          )}
                          {task.priority && (
                            <Badge
                              variant="outline"
                              className="text-xs"
                              style={{
                                borderColor: task.priority.color || undefined,
                                color: task.priority.color || undefined,
                              }}
                            >
                              {task.priority.name}
                            </Badge>
                          )}
                        </div>
                        {task.due_date && (
                          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Due {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                          </div>
                        )}
                        {task.project && (
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {task.project.name}
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
                <Link href="/protected/tasks">
                  View All Tasks
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
