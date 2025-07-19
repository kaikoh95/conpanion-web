'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  CheckSquare,
  FileText,
  FileCheck,
  Shield,
  BookOpen,
  ArrowRight,
  Calendar,
  User,
  Users,
  RefreshCw,
} from 'lucide-react';
import { UserFilter } from './UserFilter';
import {
  getDashboardStats,
  getUserAssignedTasks,
  getUserAssignedForms,
  getUserSubmittedEntries,
  getUserSubmittedSiteDiaries,
  getUserRequestedApprovals,
  DashboardTask,
  DashboardForm,
  DashboardEntry,
  DashboardSiteDiary,
  DashboardApproval,
} from '@/lib/api/dashboard';
import { useProject } from '@/contexts/ProjectContext';
import { formatDistanceToNow } from 'date-fns';

interface StatItem {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  key: 'tasks' | 'forms' | 'entries' | 'siteDiaries' | 'approvals';
}

interface SectionData {
  tasks: DashboardTask[];
  forms: DashboardForm[];
  entries: DashboardEntry[];
  siteDiaries: DashboardSiteDiary[];
  approvals: DashboardApproval[];
}

interface StatsOverviewProps {
  onTaskClick?: (taskId: number) => void;
  onFormClick?: (formId: number) => void;
  onEntryClick?: (entryId: number) => void;
  onSiteDiaryClick?: (diaryId: number) => void;
  onApprovalClick?: (approvalId: number) => void;
  selectedUserId?: string;
  onUserChange?: (userId?: string) => void;
  searchTerm?: string;
  onSearchChange?: (searchTerm: string) => void;
}

export function StatsOverview({
  onTaskClick,
  onFormClick,
  onEntryClick,
  onSiteDiaryClick,
  onApprovalClick,
  selectedUserId,
  onUserChange,
  searchTerm,
  onSearchChange,
}: StatsOverviewProps) {
  const [stats, setStats] = useState<{
    totalTasks: number;
    totalForms: number;
    totalEntries: number;
    totalApprovals: number;
    totalSiteDiaries: number;
  } | null>(null);
  const [sectionData, setSectionData] = useState<SectionData>({
    tasks: [],
    forms: [],
    entries: [],
    siteDiaries: [],
    approvals: [],
  });
  const [loadingData, setLoadingData] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadStatsAndData = async () => {
      if (!currentProject?.id) {
        setStats(null);
        setSectionData({
          tasks: [],
          forms: [],
          entries: [],
          siteDiaries: [],
          approvals: [],
        });
        setLoading(false);
        return;
      }

      // Set all sections to loading
      setLoading(true);
      setLoadingData({
        stats: true,
        tasks: true,
        forms: true,
        entries: true,
        siteDiaries: true,
        approvals: true,
      });

      // Reset section data immediately
      setSectionData({
        tasks: [],
        forms: [],
        entries: [],
        siteDiaries: [],
        approvals: [],
      });

      // Load stats first (fastest, most important)
      try {
        const dashboardStats = await getDashboardStats(
          currentProject.id,
          selectedUserId,
          searchTerm,
        );
        setStats(dashboardStats);
        setLoadingData((prev) => ({ ...prev, stats: false }));
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
        setLoadingData((prev) => ({ ...prev, stats: false }));
      }

      // Load each section individually
      const loadSection = async (section: keyof SectionData, loadFn: () => Promise<any[]>) => {
        try {
          const data = await loadFn();
          setSectionData((prev) => ({ ...prev, [section]: data }));
        } catch (error) {
          console.error(`Error loading ${section} data:`, error);
        } finally {
          setLoadingData((prev) => ({ ...prev, [section]: false }));
        }
      };

      // Load all sections concurrently but independently
      Promise.all([
        loadSection('tasks', () =>
          getUserAssignedTasks(currentProject.id, 5, selectedUserId, searchTerm),
        ),
        loadSection('forms', () =>
          getUserAssignedForms(currentProject.id, 5, selectedUserId, searchTerm),
        ),
        loadSection('entries', () =>
          getUserSubmittedEntries(currentProject.id, 5, selectedUserId, searchTerm),
        ),
        loadSection('siteDiaries', () =>
          getUserSubmittedSiteDiaries(currentProject.id, 5, selectedUserId, searchTerm),
        ),
        loadSection('approvals', () =>
          getUserRequestedApprovals(currentProject.id, 5, selectedUserId, searchTerm),
        ),
      ]).finally(() => {
        setLoading(false);
      });
    };

    loadStatsAndData();
  }, [currentProject?.id, selectedUserId, searchTerm]);

  const refreshSectionData = async (section: keyof SectionData) => {
    if (!currentProject?.id) return;

    setLoadingData((prev) => ({ ...prev, [section]: true }));

    try {
      let data: any[] = [];
      switch (section) {
        case 'tasks':
          data = await getUserAssignedTasks(currentProject.id, 5, selectedUserId, searchTerm);
          break;
        case 'forms':
          data = await getUserAssignedForms(currentProject.id, 5, selectedUserId, searchTerm);
          break;
        case 'entries':
          data = await getUserSubmittedEntries(currentProject.id, 5, selectedUserId, searchTerm);
          break;
        case 'siteDiaries':
          data = await getUserSubmittedSiteDiaries(
            currentProject.id,
            5,
            selectedUserId,
            searchTerm,
          );
          break;
        case 'approvals':
          data = await getUserRequestedApprovals(currentProject.id, 5, selectedUserId, searchTerm);
          break;
        default:
          data = [];
      }

      setSectionData((prev) => ({ ...prev, [section]: data }));

      // Also refresh stats to keep counts in sync with filtered results
      const updatedStats = await getDashboardStats(currentProject.id, selectedUserId, searchTerm);
      setStats(updatedStats);
    } catch (error) {
      console.error(`Error refreshing ${section} data:`, error);
    } finally {
      setLoadingData((prev) => ({ ...prev, [section]: false }));
    }
  };

  const statItems: StatItem[] = [
    {
      title: 'Assigned Tasks',
      value: stats?.totalTasks || 0,
      icon: CheckSquare,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      key: 'tasks',
    },
    {
      title: 'Assigned Forms',
      value: stats?.totalForms || 0,
      icon: FileText,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      key: 'forms',
    },
    {
      title: 'My Submissions',
      value: stats?.totalEntries || 0,
      icon: FileCheck,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      key: 'entries',
    },
    {
      title: 'Site Diaries',
      value: stats?.totalSiteDiaries || 0,
      icon: BookOpen,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      key: 'siteDiaries',
    },
    {
      title: 'Approval Requests',
      value: stats?.totalApprovals || 0,
      icon: Shield,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      key: 'approvals',
    },
  ];

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

  const getEntityTypeLabel = (entityType: string) => {
    switch (entityType) {
      case 'site_diary':
        return 'Site Diary';
      case 'form':
        return 'Form';
      case 'entries':
        return 'Entry';
      case 'tasks':
        return 'Task';
      default:
        return entityType;
    }
  };

  const renderSectionContent = (section: keyof SectionData, item: StatItem) => {
    const refreshButton = (
      <div className="flex justify-end p-4 pb-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshSectionData(section)}
          disabled={loadingData[section]}
          className="h-8"
        >
          <RefreshCw className={`mr-2 h-3 w-3 ${loadingData[section] ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    );

    if (loadingData[section]) {
      return (
        <div>
          {refreshButton}
          <div className="space-y-3 px-4 pb-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex-1">
                  <Skeleton className="mb-2 h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-8 w-8" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    const data = sectionData[section];

    if (data.length === 0) {
      return (
        <div>
          {refreshButton}
          <div className="p-4 pt-0 text-center text-muted-foreground">
            <p>No {item.title.toLowerCase()} found</p>
          </div>
        </div>
      );
    }

    switch (section) {
      case 'tasks':
        return (
          <div>
            {refreshButton}
            <div className="space-y-2 px-4 pb-4">
              {(data as DashboardTask[]).map((task) => (
                <button
                  key={task.id}
                  onClick={() => onTaskClick?.(task.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{task.title}</h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {task.status && (
                          <Badge
                            variant="secondary"
                            className="text-xs"
                            style={{
                              backgroundColor: task.status.color
                                ? `${task.status.color}20`
                                : undefined,
                              color: task.status.color || undefined,
                            }}
                          >
                            {task.status.name}
                          </Badge>
                        )}
                        {task.due_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            Due {formatDistanceToNow(new Date(task.due_date), { addSuffix: true })}
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'forms':
        return (
          <div>
            {refreshButton}
            <div className="space-y-2 px-4 pb-4">
              {(data as DashboardForm[]).map((form) => (
                <button
                  key={form.id}
                  onClick={() => onFormClick?.(form.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{form.name}</h4>
                      {form.assigned_by && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          Assigned by {form.assigned_by.name}
                        </div>
                      )}
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'entries':
        return (
          <div>
            {refreshButton}
            <div className="space-y-2 px-4 pb-4">
              {(data as DashboardEntry[]).map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => onEntryClick?.(entry.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">
                        {entry.name || 'Untitled Entry'}
                      </h4>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {entry.form_name}
                      </p>
                      <Badge
                        className={`mt-1 text-xs ${getStatusColor(entry.approval_status)}`}
                        variant="outline"
                      >
                        {getStatusLabel(entry.approval_status)}
                      </Badge>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'siteDiaries':
        return (
          <div>
            {refreshButton}
            <div className="space-y-2 px-4 pb-4">
              {(data as DashboardSiteDiary[]).map((diary) => (
                <button
                  key={diary.id}
                  onClick={() => onSiteDiaryClick?.(diary.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">
                        {diary.name || 'Untitled Site Diary'}
                      </h4>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {diary.template_name}
                      </p>
                      <Badge
                        className={`mt-1 text-xs ${getStatusColor(diary.approval_status)}`}
                        variant="outline"
                      >
                        {getStatusLabel(diary.approval_status)}
                      </Badge>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      case 'approvals':
        return (
          <div>
            {refreshButton}
            <div className="space-y-2 px-4 pb-4">
              {(data as DashboardApproval[]).map((approval) => (
                <button
                  key={approval.id}
                  onClick={() => onApprovalClick?.(approval.id)}
                  className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium">{approval.entity_title}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getEntityTypeLabel(approval.entity_type)} •{' '}
                        {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge
                          className={`text-xs ${getStatusColor(approval.status)}`}
                          variant="outline"
                        >
                          {getStatusLabel(approval.status)}
                        </Badge>
                        {approval.pending_count > 0 && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" />
                            {approval.pending_count} pending
                          </div>
                        )}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (!currentProject) {
    return (
      <Card>
        <CardHeader>
          {onUserChange && onSearchChange && (
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              {/* Search Bar Skeleton */}
              <div className="w-full lg:max-w-[30%]">
                <div className="relative">
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              </div>

              {/* Member Filter Skeleton */}
              <div className="flex min-w-fit flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <div className="flex flex-wrap gap-2">
                  {/* All button skeleton */}
                  <div className="flex flex-col items-center gap-1">
                    <Skeleton className="h-8 w-12 rounded-md" />
                    <Skeleton className="h-3 w-6 rounded" />
                  </div>
                  {/* Avatar skeletons with labels */}
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-3 w-8 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div>
                  <Skeleton className="mb-1 h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        {onUserChange && onSearchChange && (
          <UserFilter
            selectedUserId={selectedUserId}
            onUserChange={onUserChange}
            searchTerm={searchTerm}
            onSearchChange={onSearchChange}
          />
        )}
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="w-full">
          {statItems.map((item, i) => {
            const Icon = item.icon;
            return (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex w-full items-center justify-between pr-4">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-md p-2 ${item.bgColor}`}>
                        <Icon className={`h-5 w-5 ${item.color}`} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-medium">{item.title}</p>
                        <div className="text-xs text-muted-foreground">
                          {loadingData.stats ? (
                            <Skeleton className="h-3 w-20" />
                          ) : (
                            `${item.value === 1 ? '1 item' : `${item.value} items`} total`
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold">
                        {loadingData.stats ? <Skeleton className="h-8 w-12" /> : item.value}
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>{renderSectionContent(item.key, item)}</AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
