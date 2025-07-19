'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useProject } from '@/contexts/ProjectContext';
import { StatsOverview } from '@/components/dashboard/StatsOverview';
// Import drawer components
import { TaskDrawer } from '@/app/components/tasks/TaskDrawer';
import { ViewSiteDiary } from '@/app/protected/site-diaries/view-site-diary';
import { ApprovalDetailDrawer } from '@/components/approvals/ApprovalDetailDrawer';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Pencil, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { getFormById } from '@/lib/api/forms';
import { getFormEntryById, updateFormEntry } from '@/lib/api/form-entries';
import { FormResponse, FormItem } from '@/lib/types/form';
import { FormEntryResponse, FormEntryAnswer } from '@/lib/types/form-entry';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useTasks, useTaskStatuses, useTaskPriorities } from '@/app/protected/tasks/hooks';
import { TaskWithRelations } from '@/app/protected/tasks/models';
import {
  DashboardTask,
  DashboardForm,
  DashboardEntry,
  DashboardSiteDiary,
  DashboardApproval,
} from '@/lib/api/dashboard';
import { Skeleton } from '@/components/ui/skeleton';

type DrawerType = 'task' | 'form' | 'entry' | 'site-diary' | 'approval' | null;

interface DrawerState {
  type: DrawerType;
  id: number | null;
}

// Component that uses useSearchParams - needs to be wrapped in Suspense
function DashboardContent() {
  const { user, loading } = useAuth();
  const { current: currentProject, isLoading: loadingProject } = useProject();
  const router = useRouter();
  const searchParams = useSearchParams();

  // User filter state
  const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
  const [hasInitializedUserFilter, setHasInitializedUserFilter] = useState(false);

  // Search state
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Function to update URL with current filter state
  // URL structure: ?user={userId|all}&search={searchTerm}
  // Examples: ?user=all, ?user=123abc, ?search=task, ?user=all&search=form
  const updateURL = useCallback(
    (userId?: string, search?: string) => {
      try {
        const params = new URLSearchParams();

        if (userId) {
          params.set('user', userId);
        } else {
          params.set('user', 'all');
        }

        if (search && search.trim() !== '') {
          params.set('search', search.trim());
        }

        const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
        router.replace(newUrl, { scroll: false });
      } catch (error) {
        console.error('Error updating URL:', error);
      }
    },
    [router],
  );

  // Initialize filters from URL params or default to current user
  useEffect(() => {
    if (user && !hasInitializedUserFilter && !loading) {
      const urlUserId = searchParams.get('user');
      const urlSearchTerm = searchParams.get('search') || '';

      // Set search term from URL
      setSearchTerm(urlSearchTerm);

      // Set user filter: URL param, or default to current user, or undefined for "all"
      if (urlUserId) {
        setSelectedUserId(urlUserId === 'all' ? undefined : urlUserId);
      } else {
        // Default to current user if no URL param
        setSelectedUserId(user.id);
        // Update URL to reflect the default
        updateURL(user.id, urlSearchTerm);
      }

      setHasInitializedUserFilter(true);
    }
  }, [user, loading, hasInitializedUserFilter, searchParams, updateURL]);

  // Wrapper functions that update both state and URL
  const handleUserChange = (userId?: string) => {
    setSelectedUserId(userId);
    updateURL(userId, searchTerm);
  };

  const handleSearchChange = (search: string) => {
    setSearchTerm(search);
    // Debounce URL updates for search to avoid too many updates while typing
    if (search.trim() === '' || search.length >= 2) {
      updateURL(selectedUserId, search);
    }
  };

  // Drawer state management
  const [drawerState, setDrawerState] = useState<DrawerState>({
    type: null,
    id: null,
  });

  // Task drawer related state
  const { tasks, refresh: refreshTasks } = useTasks();
  const { statuses } = useTaskStatuses();
  const { priorities } = useTaskPriorities();
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);

  // Form drawer state
  const [formDetail, setFormDetail] = useState<FormResponse | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  // Entry drawer state
  const [entryDetail, setEntryDetail] = useState<FormEntryResponse | null>(null);
  const [loadingEntry, setLoadingEntry] = useState(false);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [submittedByName, setSubmittedByName] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedAnswers, setEditedAnswers] = useState<Record<number, any>>({});
  const [editedEntryName, setEditedEntryName] = useState<string>('');
  const [formErrors, setFormErrors] = useState<Record<number, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Handle opening drawers
  const openTaskDrawer = (taskId: number) => {
    const task = tasks?.find((t) => t.id === taskId);
    if (task) {
      setSelectedTask(task);
      setDrawerState({ type: 'task', id: taskId });
    }
  };

  const openFormDrawer = async (formId: number) => {
    setLoadingForm(true);
    try {
      const data = await getFormById(formId);
      setFormDetail(data);
      setDrawerState({ type: 'form', id: formId });
    } catch (error) {
      console.error('Error loading form:', error);
      toast.error('Failed to load form');
    } finally {
      setLoadingForm(false);
    }
  };

  const openEntryDrawer = async (entryId: number) => {
    setLoadingEntry(true);
    try {
      const entryData = await getFormEntryById(entryId);
      setEntryDetail(entryData);

      if (entryData) {
        setEditedEntryName(entryData.entry.name || '');

        const answersMap: Record<number, any> = {};
        entryData.answers.forEach((answer: FormEntryAnswer) => {
          answersMap[answer.item_id] = answer.answer_value;
        });
        setEditedAnswers(answersMap);

        // Fetch form to get questions/items
        const formData = await getFormById(entryData.entry.form_id);
        if (formData) {
          setFormItems(formData.items);
        }

        // Fetch user name who submitted the entry
        const supabaseClient = getSupabaseClient();
        const { data: userData, error } = await supabaseClient.rpc('get_user_details', {
          user_ids: [entryData.entry.submitted_by_user_id],
        });

        if (error) {
          console.error('Error fetching user details:', error);
          setSubmittedByName('Unknown User');
        } else if (userData && userData.length > 0) {
          const rawMeta = userData[0].raw_user_meta_data as { email?: string } | null;
          const email = rawMeta?.email || 'Unknown';
          setSubmittedByName(email);
        } else {
          setSubmittedByName('Unknown User');
        }
      }

      setDrawerState({ type: 'entry', id: entryId });
    } catch (error) {
      console.error('Error loading entry:', error);
      toast.error('Failed to load entry');
    } finally {
      setLoadingEntry(false);
    }
  };

  const openSiteDiaryDrawer = (diaryId: number) => {
    setDrawerState({ type: 'site-diary', id: diaryId });
  };

  const openApprovalDrawer = (approvalId: number) => {
    setDrawerState({ type: 'approval', id: approvalId });
  };

  // Handle closing drawer
  const closeDrawer = () => {
    setDrawerState({ type: null, id: null });
    // Reset all drawer-specific state
    setSelectedTask(null);
    setFormDetail(null);
    setEntryDetail(null);
    setFormItems([]);
    setSubmittedByName(null);
    setIsEditMode(false);
    setEditedAnswers({});
    setEditedEntryName('');
    setFormErrors({});
  };

  // Handle entry editing
  const handleEditToggle = () => {
    setIsEditMode(!isEditMode);
    if (!isEditMode && entryDetail) {
      // Initialize edit state
      setEditedEntryName(entryDetail.entry.name || '');
      const answersMap: Record<number, any> = {};
      entryDetail.answers.forEach((answer: FormEntryAnswer) => {
        answersMap[answer.item_id] = answer.answer_value;
      });
      setEditedAnswers(answersMap);
    }
  };

  const handleAnswerChange = (itemId: number, value: any) => {
    setEditedAnswers((prev) => ({
      ...prev,
      [itemId]: value,
    }));

    if (formErrors[itemId]) {
      setFormErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[itemId];
        return newErrors;
      });
    }
  };

  const handleSaveChanges = async () => {
    if (!entryDetail || !user || !entryDetail.entry.id) return;

    try {
      setIsSaving(true);

      await updateFormEntry(entryDetail.entry.id, {
        name: editedEntryName,
        form_id: entryDetail.entry.form_id,
        submitted_by_user_id: entryDetail.entry.submitted_by_user_id,
      });

      const supabase = getSupabaseClient();
      const { error: deleteError } = await supabase
        .from('form_entry_answers')
        .delete()
        .eq('entry_id', entryDetail.entry.id);

      if (deleteError) throw deleteError;

      const newAnswers = Object.entries(editedAnswers).map(([itemId, value]) => ({
        entry_id: entryDetail.entry.id as number,
        item_id: parseInt(itemId),
        answer_value: value,
      }));

      if (newAnswers.length > 0) {
        const { error: insertError } = await supabase.from('form_entry_answers').insert(newAnswers);
        if (insertError) throw insertError;
      }

      toast.success('Entry updated successfully');
      setIsEditMode(false);

      // Reload the entry
      const updatedEntry = await getFormEntryById(entryDetail.entry.id);
      setEntryDetail(updatedEntry);
    } catch (error) {
      console.error('Error updating entry:', error);
      toast.error('Failed to update entry');
    } finally {
      setIsSaving(false);
    }
  };

  // Render form item for entry editing
  const renderFormItem = (item: FormItem) => {
    const itemId = item.id!;
    const hasError = !!formErrors[itemId];
    const currentValue = editedAnswers[itemId] || '';

    const handleValueChange = (value: any) => handleAnswerChange(itemId, value);

    switch (item.item_type) {
      case 'question':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <Input
              value={currentValue || ''}
              onChange={(e) => handleValueChange(e.target.value)}
              className={hasError ? 'border-red-500' : ''}
            />
            {hasError && <p className="text-sm font-medium text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      case 'checklist':
        return (
          <div className="space-y-2">
            {item.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Checkbox
                  checked={Array.isArray(currentValue) ? currentValue.includes(option) : false}
                  onCheckedChange={(checked) => {
                    const currentArray = Array.isArray(currentValue) ? currentValue : [];
                    if (checked) {
                      handleValueChange([...currentArray, option]);
                    } else {
                      handleValueChange(currentArray.filter((v: string) => v !== option));
                    }
                  }}
                />
                <Label>{option}</Label>
              </div>
            ))}
            {hasError && <p className="text-sm font-medium text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      case 'radio_box':
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <RadioGroup value={currentValue || ''} onValueChange={handleValueChange}>
              {item.options?.map((option, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <RadioGroupItem value={option} id={`${itemId}-radio-${index}`} />
                  <Label htmlFor={`${itemId}-radio-${index}`}>{option}</Label>
                </div>
              ))}
            </RadioGroup>
            {hasError && <p className="text-sm font-medium text-red-500">{formErrors[itemId]}</p>}
          </div>
        );

      default:
        return (
          <div className="space-y-2">
            <h3 className="flex items-center gap-1 text-base font-semibold">
              {item.question_value}
              {item.is_required && <span className="text-red-500">*</span>}
            </h3>
            <Textarea
              value={currentValue || ''}
              onChange={(e) => handleValueChange(e.target.value)}
              placeholder="Enter your answer..."
              className={hasError ? 'border-red-500' : ''}
            />
            {hasError && <p className="text-sm font-medium text-red-500">{formErrors[itemId]}</p>}
          </div>
        );
    }
  };

  if (loading || loadingProject) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Your tasks, forms, entries, site diaries, and approvals
          </p>
        </div>
      </div>
    );
  }

  if (!currentProject) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back{user?.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ''}!
          </h1>
          <p className="text-muted-foreground">Please select a project to view your dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Your tasks, forms, entries, site diaries, and approvals
        </p>
      </div>

      <StatsOverview
        onTaskClick={openTaskDrawer}
        onFormClick={openFormDrawer}
        onEntryClick={openEntryDrawer}
        onSiteDiaryClick={openSiteDiaryDrawer}
        onApprovalClick={openApprovalDrawer}
        selectedUserId={selectedUserId}
        onUserChange={handleUserChange}
        searchTerm={searchTerm}
        onSearchChange={handleSearchChange}
      />

      {/* Task Drawer */}
      {drawerState.type === 'task' && selectedTask && statuses && priorities && (
        <TaskDrawer
          isOpen={true}
          onClose={closeDrawer}
          task={selectedTask}
          status={statuses.find((s) => s.id === selectedTask.status_id) || statuses[0]}
          priority={
            selectedTask.priorities || {
              id: 0,
              name: 'No Priority',
              color: '#E2E8F0',
              position: 0,
              is_default: false,
              project_id: 0,
              created_at: '',
              created_by: '',
            }
          }
          labels={selectedTask.entity_labels?.map((el) => el.labels).filter(Boolean) || []}
          assignees={
            selectedTask.entity_assignees?.map((ea) => ({
              id: ea.user_id,
              name: ea.users.user_profiles?.global_display_name || ea.users.raw_user_meta_data.name,
              avatar_url:
                ea.users.user_profiles?.global_avatar_url || ea.users.raw_user_meta_data.avatar_url,
            })) || []
          }
          allStatuses={statuses}
          allPriorities={priorities}
          refreshTasks={refreshTasks}
        />
      )}

      {/* Form Drawer */}
      {drawerState.type === 'form' && formDetail && (
        <Sheet open={true} onOpenChange={(open) => !open && closeDrawer()}>
          <SheetContent className="w-full max-w-2xl overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={closeDrawer}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <SheetTitle>{formDetail.form.name}</SheetTitle>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm text-muted-foreground">
                  Last updated{' '}
                  {formDetail.form.updated_at
                    ? format(new Date(formDetail.form.updated_at), 'MMM d, yyyy')
                    : 'Never'}
                </p>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold">Questions</h3>
                <div className="space-y-4">
                  {formDetail.items.map((item) => (
                    <div key={item.id} className="rounded-lg border p-4">
                      <p className="font-medium">{item.question_value}</p>
                      <p className="text-sm text-muted-foreground">
                        Type: {item.item_type} {item.is_required && '(Required)'}
                      </p>
                      {item.options && item.options.length > 0 && (
                        <div className="mt-2">
                          <p className="text-sm text-muted-foreground">Options:</p>
                          <ul className="list-inside list-disc text-sm">
                            {item.options.map((option, index) => (
                              <li key={index}>{option}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Entry Drawer */}
      {drawerState.type === 'entry' && entryDetail && (
        <Sheet open={true} onOpenChange={(open) => !open && closeDrawer()}>
          <SheetContent className="w-full max-w-2xl overflow-y-auto">
            <SheetHeader>
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={closeDrawer}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  {isEditMode ? (
                    <Input
                      value={editedEntryName}
                      onChange={(e) => setEditedEntryName(e.target.value)}
                      className="text-lg font-semibold"
                    />
                  ) : (
                    <SheetTitle>{entryDetail.entry.name}</SheetTitle>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={handleEditToggle} disabled={isSaving}>
                  {isEditMode ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </Button>
                {isEditMode && (
                  <Button onClick={handleSaveChanges} disabled={isSaving} size="sm">
                    <Check className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div>
                <p className="text-sm text-muted-foreground">
                  Created by: {submittedByName || 'Unknown'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Date:{' '}
                  {entryDetail.entry.created_at
                    ? format(new Date(entryDetail.entry.created_at), 'PPP')
                    : 'N/A'}
                </p>
              </div>

              <div>
                <h3 className="mb-4 text-lg font-semibold">Responses</h3>
                <div className="space-y-4">
                  {formItems.map((item) => (
                    <div key={item.id} className="rounded-lg border p-4">
                      {isEditMode ? (
                        renderFormItem(item)
                      ) : (
                        <>
                          <p className="font-medium">{item.question_value}</p>
                          <div className="mt-2">
                            {(() => {
                              const answer = entryDetail.answers.find((a) => a.item_id === item.id);
                              const value = answer ? answer.answer_value : 'No answer';

                              if (Array.isArray(value)) {
                                return value.join(', ');
                              } else if (typeof value === 'object') {
                                return JSON.stringify(value);
                              } else {
                                return value || 'No answer';
                              }
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Site Diary Drawer */}
      {drawerState.type === 'site-diary' && drawerState.id && (
        <ViewSiteDiary
          open={true}
          onOpenChange={(open) => !open && closeDrawer()}
          diaryId={drawerState.id}
          onDiaryUpdated={() => {
            // Refresh dashboard data if needed
          }}
        />
      )}

      {/* Approval Drawer */}
      {drawerState.type === 'approval' && drawerState.id && (
        <ApprovalDetailDrawer
          approvalId={drawerState.id}
          open={true}
          onOpenChange={(open) => !open && closeDrawer()}
          onApprovalUpdate={() => {
            // Refresh dashboard data if needed
          }}
        />
      )}
    </div>
  );
}

// Loading component for Suspense fallback
function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </div>
  );
}

// Main component with Suspense boundary
export default function ProtectedPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent />
    </Suspense>
  );
}
