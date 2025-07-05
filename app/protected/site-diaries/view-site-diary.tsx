'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Calendar, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  getSiteDiaryById,
  updateSiteDiaryAnswers,
  UpdateSiteDiaryAnswersRequest,
} from '@/lib/api/site-diaries';
import { SiteDiaryResponse, SiteDiaryTemplateItem } from '@/lib/types/site-diary';
import { ApprovalStatus } from '@/lib/api/entries';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DiaryApprovalStatus } from './approval-status';
import { DebugWrapper } from '@/utils/debug';
import {
  submitApprovalForEntity,
  getApprovalWithEntityDetails,
  ApprovalWithEntityDetails,
} from '@/lib/api/approvals';
import { toast } from 'sonner';
import { ApprovalComments } from '@/components/approvals/ApprovalComments';
import { Badge } from '@/components/ui/badge';
import { Users, User } from 'lucide-react';
import { SiteDiaryResponses } from '@/components/site-diary-responses';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getAttachments } from '@/lib/api/attachments';
import { FileViewer } from '@/components/file-viewer';
import Image from 'next/image';
import { ZoomIn, FileText, Save, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface ViewSiteDiaryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diaryId: number | null;
  onDiaryUpdated: () => void;
}

export function ViewSiteDiary({ open, onOpenChange, diaryId, onDiaryUpdated }: ViewSiteDiaryProps) {
  const router = useRouter();
  const { user } = useAuth();

  // State for diary data
  const [diaryData, setDiaryData] = useState<SiteDiaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittedByName, setSubmittedByName] = useState<string | null>(null);

  // State for approval
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus | null>(null);

  // State for edit mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [editAnswers, setEditAnswers] = useState<Record<number, any>>({});
  const [editMetadata, setEditMetadata] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // State for submit for approval
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for approval details
  const [approvalDetails, setApprovalDetails] = useState<ApprovalWithEntityDetails | null>(null);
  const [loadingApprovalDetails, setLoadingApprovalDetails] = useState(false);

  // State for unsaved changes confirmation
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Reset edit mode when dialog opens or diary changes
  useEffect(() => {
    if (!open) {
      // Reset edit mode when dialog is closed
      resetEditState();
      return;
    }

    if (!diaryId) return;

    // Reset edit mode when switching to a different diary
    resetEditState();

    const loadDiary = async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await getSiteDiaryById(diaryId);
        setDiaryData(data);

        // Fetch user details
        if (data && data.diary.submitted_by_user_id) {
          try {
            const supabaseClient = getSupabaseClient();
            const { data: userData, error: userError } = await supabaseClient.rpc(
              'get_user_details',
              {
                user_ids: [data.diary.submitted_by_user_id],
              },
            );

            if (userError) {
              console.error('Error fetching user details:', userError);
            } else if (userData && userData.length > 0) {
              // Safely extract email from user metadata
              const userMetadata = userData[0].raw_user_meta_data;
              let email = 'Unknown';

              if (
                userMetadata &&
                typeof userMetadata === 'object' &&
                !Array.isArray(userMetadata)
              ) {
                if ('email' in userMetadata && typeof userMetadata.email === 'string') {
                  email = userMetadata.email;
                } else if (
                  'email_address' in userMetadata &&
                  typeof userMetadata.email_address === 'string'
                ) {
                  email = userMetadata.email_address;
                }
              }

              setSubmittedByName(email);
            }
          } catch (err) {
            console.error('Exception fetching user details:', err);
          }
        }

        // Fetch approval status
        try {
          const supabaseClient = getSupabaseClient();
          const { data: approvalData, error: approvalError } = await supabaseClient
            .from('approvals')
            .select('status')
            .eq('entity_type', 'site_diary')
            .eq('entity_id', diaryId)
            .order('created_at', { ascending: false })
            .limit(1);

          if (approvalError) {
            console.error('Error fetching approval status:', approvalError);
          } else if (approvalData && approvalData.length > 0) {
            setApprovalStatus(approvalData[0].status as ApprovalStatus);
          } else {
            // If no approval record is found, assume it's in draft status
            setApprovalStatus('draft');
          }
        } catch (err) {
          console.error('Exception fetching approval status:', err);
        }

        // Fetch approval details if there's an approval
        await fetchApprovalDetails();
      } catch (err: any) {
        console.error('Error loading diary:', err);
        setError(err.message || 'Failed to load diary');
      } finally {
        setLoading(false);
      }
    };

    loadDiary();
  }, [diaryId, open]);

  // Handle close
  const handleClose = () => {
    router.push('/protected/site-diaries');
    onOpenChange(false);
  };

  // Handle edit toggle
  const handleEditToggle = () => {
    if (!diaryData) return;

    // Initialize edit state with current values
    const currentAnswers: Record<number, any> = {};
    diaryData.answers.forEach((answer) => {
      if (answer.item_id) {
        currentAnswers[answer.item_id] = answer.answer_value;
      }
    });

    setEditAnswers(currentAnswers);
    setEditMetadata(diaryData.diary.metadata || {});
    setIsEditMode(true);
    setHasUnsavedChanges(false);
  };

  // Handle save changes
  const handleSaveChanges = async () => {
    if (!diaryId || !diaryData) return;

    setIsSaving(true);
    try {
      // Prepare answers array
      const answers = Object.entries(editAnswers).map(([itemId, value]) => ({
        item_id: parseInt(itemId),
        value: value,
      }));

      const request: UpdateSiteDiaryAnswersRequest = {
        answers,
        metadata: editMetadata,
      };

      const updatedDiary = await updateSiteDiaryAnswers(diaryId, request);
      setDiaryData(updatedDiary);
      resetEditState();
      toast.success('Site diary updated successfully');
      onDiaryUpdated();
    } catch (err: any) {
      console.error('Error saving changes:', err);
      toast.error(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    if (hasUnsavedChanges) {
      setShowDiscardDialog(true);
    } else {
      resetEditState();
    }
  };

  // Reset edit state
  const resetEditState = () => {
    setIsEditMode(false);
    setEditAnswers({});
    setEditMetadata({});
    setHasUnsavedChanges(false);
  };

  // Handle confirmed discard
  const handleConfirmedDiscard = () => {
    resetEditState();
    setShowDiscardDialog(false);
    router.push('/protected/site-diaries');
    onOpenChange(false);
  };

  // Handle sheet close attempt
  const handleSheetOpenChange = (isOpen: boolean) => {
    if (!isOpen && isEditMode && hasUnsavedChanges) {
      // Prevent closing and show confirmation dialog
      setShowDiscardDialog(true);
    } else if (!isOpen) {
      // No unsaved changes or not in edit mode, proceed with closing
      router.push('/protected/site-diaries');
      onOpenChange(isOpen);
    } else {
      onOpenChange(isOpen);
    }
  };

  // Submit site diary for approval
  const handleSubmitForApproval = async () => {
    if (!diaryId || !user) return;

    setIsSubmitting(true);

    try {
      await submitApprovalForEntity({
        entityId: diaryId,
        entityType: 'site_diary',
        status: 'submitted',
        userId: user.id,
      });

      setApprovalStatus('submitted');
      toast.success('Site diary submitted for approval successfully');
      onDiaryUpdated();

      // Refresh approval details after submission
      await fetchApprovalDetails();
    } catch (err: any) {
      console.error('Error submitting for approval:', err);
      toast.error(err.message || 'Failed to submit for approval');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch approval details
  const fetchApprovalDetails = async () => {
    if (!diaryId) return;

    try {
      setLoadingApprovalDetails(true);

      // First, get the approval ID for this site diary
      const supabaseClient = getSupabaseClient();
      const { data: approvalData, error: approvalError } = await supabaseClient
        .from('approvals')
        .select('id')
        .eq('entity_type', 'site_diary')
        .eq('entity_id', diaryId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (approvalError) {
        console.error('Error fetching approval:', approvalError);
        return;
      }

      if (approvalData) {
        // Get full approval details
        const details = await getApprovalWithEntityDetails(approvalData.id);
        setApprovalDetails(details);
      } else {
        setApprovalDetails(null);
      }
    } catch (err) {
      console.error('Error fetching approval details:', err);
    } finally {
      setLoadingApprovalDetails(false);
    }
  };

  // Render answer value based on item type
  const renderAnswerValue = (item: SiteDiaryTemplateItem, answerValue: any) => {
    if (!answerValue) return <span className="text-muted-foreground">No answer provided</span>;

    switch (item.item_type) {
      case 'checklist':
        return (
          <ul className="list-inside list-disc">
            {Array.isArray(answerValue) &&
              answerValue.map((option, index) => <li key={index}>{option}</li>)}
          </ul>
        );

      case 'radio_box':
        return <span>{answerValue}</span>;

      case 'photo':
        return <FileAnswerViewer diaryId={diaryId} itemId={item.id} />;

      default:
        return <span>{answerValue}</span>;
    }
  };

  // Render editable form field based on item type
  const renderEditableField = (item: SiteDiaryTemplateItem) => {
    const currentValue = editAnswers[item.id!] || '';

    const handleValueChange = (value: any) => {
      setEditAnswers((prev) => ({
        ...prev,
        [item.id!]: value,
      }));
      setHasUnsavedChanges(true);
    };

    switch (item.item_type) {
      case 'question':
        // For question type, we'll render as textarea for multi-line support
        return (
          <Textarea
            value={currentValue || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Enter your answer..."
            className="min-h-[100px] w-full"
          />
        );

      case 'checklist':
        return (
          <div className="space-y-2">
            {item.options?.map((option, index) => {
              const isChecked = Array.isArray(currentValue) && currentValue.includes(option);
              return (
                <div key={index} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${item.id}-${index}`}
                    checked={isChecked}
                    onCheckedChange={(checked) => {
                      const currentArray = Array.isArray(currentValue) ? currentValue : [];
                      if (checked) {
                        handleValueChange([...currentArray, option]);
                      } else {
                        handleValueChange(currentArray.filter((val: string) => val !== option));
                      }
                    }}
                  />
                  <Label htmlFor={`${item.id}-${index}`}>{option}</Label>
                </div>
              );
            })}
          </div>
        );

      case 'radio_box':
        return (
          <RadioGroup value={currentValue || ''} onValueChange={handleValueChange}>
            {item.options?.map((option, index) => (
              <div key={index} className="flex items-center space-x-2">
                <RadioGroupItem value={option} id={`${item.id}-radio-${index}`} />
                <Label htmlFor={`${item.id}-radio-${index}`}>{option}</Label>
              </div>
            ))}
          </RadioGroup>
        );

      case 'photo':
        return (
          <div className="text-muted-foreground">
            Photo editing not supported in this view. Please use the main creation form.
          </div>
        );

      default:
        return (
          <Textarea
            value={currentValue || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Enter your answer..."
            className="min-h-[100px] w-full"
          />
        );
    }
  };

  // Get answer for a specific item
  const getAnswerForItem = (itemId: number | undefined) => {
    if (!itemId || !diaryData) return null;

    const answer = diaryData.answers.find((a) => a.item_id === itemId);
    return answer ? answer.answer_value : null;
  };

  // Format approval status for display
  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-500';
      case 'declined':
        return 'bg-red-500';
      case 'submitted':
        return 'bg-blue-500';
      case 'revision_requested':
        return 'bg-yellow-500';
      case 'draft':
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleSheetOpenChange}>
        <SheetContent
          className="overflow-y-auto sm:max-w-md md:max-w-xl lg:max-w-2xl [&>button]:hidden"
          side="right"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleClose} className="mr-2">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <span>Site Diary Details</span>
              </div>
            </SheetTitle>
          </SheetHeader>

          {error ? (
            <div className="mt-4 rounded border border-red-400 bg-red-100 px-4 py-3 text-red-700">
              Error: {error}
            </div>
          ) : loading ? (
            <div className="flex h-32 items-center justify-center">
              <p>Loading diary...</p>
            </div>
          ) : diaryData ? (
            <div className="py-4">
              {/* Header Info */}
              <div className="relative mb-6">
                <h2 className="mb-2 text-xl font-bold">{diaryData.diary.name}</h2>

                <div className="mb-2 flex items-center text-muted-foreground">
                  <Calendar className="mr-1 h-4 w-4" />
                  <span>{format(new Date(diaryData.diary.date), 'PPP')}</span>
                </div>

                <div className="text-sm text-muted-foreground">
                  Submitted by {submittedByName || 'Unknown'}
                  {diaryData.diary.created_at && (
                    <> on {format(new Date(diaryData.diary.created_at), 'PPP')}</>
                  )}
                </div>

                {/* Edit button - only show if user is the author and diary is not approved/declined */}
                {user &&
                  diaryData.diary.submitted_by_user_id === user.id &&
                  approvalStatus !== 'approved' &&
                  approvalStatus !== 'declined' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleEditToggle}
                      className="absolute right-0 top-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
              </div>

              {/* Approval Status */}
              {user && (
                <div className="mb-6">
                  <DiaryApprovalStatus
                    entityId={diaryId || 0}
                    entityType="site_diary"
                    currentStatus={approvalStatus}
                    onRefreshData={() => {
                      onDiaryUpdated();
                      fetchApprovalDetails();
                    }}
                  />
                </div>
              )}

              {/* Site Diary Content */}
              {!isEditMode ? (
                <SiteDiaryResponses diaryData={diaryData} />
              ) : (
                /* Edit Mode - Custom rendering for responses section only */
                <div className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">Responses</h3>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={isSaving}
                        className="flex items-center gap-2"
                      >
                        <X className="h-4 w-4" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSaveChanges}
                        disabled={isSaving}
                        className="flex items-center gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Saving...' : 'Save Changes'}
                      </Button>
                    </div>
                  </div>
                  {diaryData.template_items && diaryData.template_items.length > 0 && (
                    <div className="space-y-4">
                      {diaryData.template_items.map((item) => (
                        <div key={item.id} className="rounded-md border p-4">
                          <p className="mb-2 font-medium">{item.question_value}</p>
                          <div className="ml-2">{renderEditableField(item)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Approval Details */}
              {approvalDetails && (
                <div className="mb-6">
                  <h3 className="mb-4 text-lg font-semibold">Approval Details</h3>

                  {/* Approvers Section */}
                  <div className="mb-6">
                    <div className="mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <h4 className="font-medium">
                        Approvers ({approvalDetails.approvers.length})
                      </h4>
                    </div>

                    <div className="space-y-2">
                      {approvalDetails.approvers.map((approver: any) => {
                        const response = approvalDetails.approver_responses.find(
                          (r: any) => r.approver_id === approver.id,
                        );

                        return (
                          <div
                            key={approver.id}
                            className="flex items-center justify-between rounded-lg border p-3"
                          >
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback>
                                  <User className="h-4 w-4" />
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium">
                                  {approver.raw_user_meta_data?.email || 'Unknown'}
                                </p>
                                {response?.comment && (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    "{response.comment}"
                                  </p>
                                )}
                              </div>
                            </div>

                            {response ? (
                              <Badge
                                variant="outline"
                                className={`${getStatusColor(response.status)} border-current text-white`}
                              >
                                {formatStatus(response.status)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Pending
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Comments Section */}
                  <div className="mb-6">
                    <ApprovalComments
                      approvalId={approvalDetails.id}
                      comments={approvalDetails.comments}
                      onCommentAdded={fetchApprovalDetails}
                      disabled={approvalDetails.status === 'draft'}
                    />
                  </div>
                </div>
              )}

              {/* Loading state for approval details */}
              {loadingApprovalDetails && (
                <div className="mb-6">
                  <h3 className="mb-4 text-lg font-semibold">Approval Details</h3>
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <div className="mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
                      <p className="text-sm text-muted-foreground">Loading approval details...</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer buttons for edit mode */}
              {isEditMode && (
                <div className="mt-4 border-t pt-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                      className="flex items-center gap-2"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveChanges}
                      disabled={isSaving}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Submit for Approval button - only show for author when in draft status */}
              {!isEditMode &&
                user &&
                diaryData.diary.submitted_by_user_id === user.id &&
                (approvalStatus === 'draft' || approvalStatus === null) && (
                  <div className="mt-4 border-t pt-4">
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSubmitForApproval}
                        disabled={isSubmitting}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {isSubmitting ? 'Submitting...' : 'Submit'}
                      </Button>
                    </div>
                  </div>
                )}

              {/* Debug section - remove after debugging */}
              <DebugWrapper>
                <div className="mt-4 border-t pt-4 text-xs text-muted-foreground">
                  <h4 className="mb-2 font-bold">Debug Info:</h4>
                  <div className="space-y-1">
                    <p>Current User ID: {user?.id || 'Not logged in'}</p>
                    <p>Diary Author ID: {diaryData?.diary.submitted_by_user_id || 'Unknown'}</p>
                    <p>Approval Status: {approvalStatus || 'No status'}</p>
                    <p>
                      Show Edit Button:{' '}
                      {Boolean(
                        user &&
                          diaryData?.diary.submitted_by_user_id === user.id &&
                          approvalStatus === 'draft',
                      ).toString()}
                    </p>
                  </div>
                </div>
              </DebugWrapper>
            </div>
          ) : (
            <div className="py-4 text-center">No diary data found</div>
          )}
        </SheetContent>
      </Sheet>

      {/* Discard Changes Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes that will be lost if you close this panel. Are you sure you
              want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedDiscard}>Discard Changes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// File Answer Viewer Component
interface FileAnswerViewerProps {
  diaryId: number | null;
  itemId: number | undefined;
}

function FileAnswerViewer({ diaryId, itemId }: FileAnswerViewerProps) {
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [directFileUrls, setDirectFileUrls] = useState<
    Array<{ url: string; isImage: boolean; isPdf?: boolean; name?: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Get project ID when component mounts
  const [projectId, setProjectId] = useState<number | null>(null);

  useEffect(() => {
    const getProjectId = async () => {
      if (!diaryId) return;

      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
          .from('site_diaries')
          .select('project_id')
          .eq('id', diaryId)
          .single();

        if (error) {
          console.error('Error fetching project ID:', error);
        } else if (data) {
          setProjectId(data.project_id);
        }
      } catch (err) {
        console.error('Error in getProjectId:', err);
      }
    };

    getProjectId();
  }, [diaryId]);

  useEffect(() => {
    const fetchFileAttachments = async () => {
      if (!diaryId || !itemId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setDirectFileUrls([]); // Reset direct URLs

      try {
        // Convert diary ID to string for API call
        const entityId = diaryId.toString();
        console.log(`Fetching attachments for diary: ${entityId}, item: ${itemId}`);

        // First try to get attachments from the attachments table
        const { data: attachments, error: fetchError } = await getAttachments(
          'site_diary',
          entityId,
        );

        if (fetchError) {
          console.error('Error fetching attachments:', fetchError);
          setError('Failed to load files');
          return;
        }

        console.log(`Found ${attachments?.length || 0} total attachments for diary ${entityId}`);
        setDebugInfo(`Total attachments: ${attachments?.length || 0}`);

        if (attachments && attachments.length > 0) {
          // Log all attachment paths to help debug
          attachments.forEach((att) => {
            console.log(
              `Attachment path: ${att.storage_path}, ID: ${att.id}, Type: ${att.file_type}`,
            );
          });

          // Modify the filter condition to be more flexible
          // The file path structure is: projectId/site_diary/diaryId/fileName
          // We should check if the file name contains the item ID
          const itemAttachments = attachments.filter((att) => {
            // Split the path to get the filename part
            const pathParts = att.storage_path.split('/');
            const fileName = pathParts[pathParts.length - 1];

            // Check for item ID in the storage path or filename
            const itemIdStr = String(itemId);
            return (
              att.storage_path.includes(`/${itemIdStr}_`) ||
              att.storage_path.includes(`/${itemIdStr}/`) ||
              fileName.includes(`_${itemIdStr}_`) ||
              fileName.includes(`item_${itemIdStr}`) ||
              fileName.startsWith(`item_${itemIdStr}`)
            );
          });

          console.log(`Found ${itemAttachments.length} attachments for item ${itemId}`);
          setDebugInfo((prev) => `${prev}, Item attachments: ${itemAttachments.length}`);

          // If we still don't find any attachments, look for any files for this diary
          if (itemAttachments.length === 0) {
            console.log('No specific attachments found, using all files as fallback');

            // Use all files attached to this diary (not just images)
            const anyFiles = attachments;

            if (anyFiles.length > 0) {
              setAttachmentIds(anyFiles.map((att) => att.id));
              setDebugInfo((prev) => `${prev}, Using all ${anyFiles.length} files as fallback`);
            } else {
              // If still no attachments, try to directly check storage
              await checkStorageDirectly();
            }
          } else {
            setAttachmentIds(itemAttachments.map((att) => att.id));
          }
        } else {
          // No attachments found in the database, try direct storage access
          console.log('No attachments found in database, checking storage directly');
          await checkStorageDirectly();
        }
      } catch (err) {
        console.error('Error in fetchFileAttachments:', err);
        setError('An error occurred while loading files');
      } finally {
        setLoading(false);
      }
    };

    // Helper function to check storage directly and generate signed URLs
    const checkStorageDirectly = async () => {
      try {
        const supabase = getSupabaseClient();

        // Check if we have the project ID
        if (projectId) {
          const pathPrefix = `${projectId}/site_diary/${diaryId}`;
          console.log(`Checking storage path: ${pathPrefix}`);

          const { data: storageFiles, error: storageError } = await supabase.storage
            .from('attachments')
            .list(pathPrefix);

          if (storageError) {
            console.error('Error listing storage files:', storageError);
          } else if (storageFiles && storageFiles.length > 0) {
            console.log(`Found ${storageFiles.length} files in storage:`, storageFiles);
            setDebugInfo((prev) => `${prev}, Files directly in storage: ${storageFiles.length}`);

            // Get signed URLs for all files
            const urlResults = await Promise.all(
              storageFiles.map(async (file) => {
                const filePath = `${pathPrefix}/${file.name}`;
                const { data: urlData } = await supabase.storage
                  .from('attachments')
                  .createSignedUrl(filePath, 60 * 60); // 1 hour expiry

                if (!urlData?.signedUrl) return null;

                // Determine file type for rendering purposes
                const fileName = file.name.toLowerCase();
                const isImage =
                  fileName.endsWith('.jpg') ||
                  fileName.endsWith('.jpeg') ||
                  fileName.endsWith('.png') ||
                  fileName.endsWith('.gif') ||
                  fileName.endsWith('.webp');

                // Check if this is a PDF
                const isPdf = fileName.endsWith('.pdf');

                return {
                  url: urlData.signedUrl,
                  isImage,
                  isPdf,
                  name: file.name, // Include the actual file name
                };
              }),
            );

            // Filter out any null URLs
            const validUrls = urlResults.filter(Boolean) as Array<{
              url: string;
              isImage: boolean;
              isPdf?: boolean;
              name?: string;
            }>;
            console.log(`Created ${validUrls.length} signed URLs for files`);

            if (validUrls.length > 0) {
              setDirectFileUrls(validUrls);
            }
          }
        } else {
          console.log('Cannot check storage directly - project ID not available');
        }
      } catch (storageErr) {
        console.error('Error checking storage directly:', storageErr);
      }
    };

    fetchFileAttachments();
  }, [diaryId, itemId, projectId]);

  if (loading) {
    return <span className="text-muted-foreground">Loading files...</span>;
  }

  if (error) {
    return <span className="text-red-500">{error}</span>;
  }

  // First check if we have attachment IDs (preferred method)
  if (attachmentIds.length > 0) {
    return <FileViewer attachmentIds={attachmentIds} />;
  }

  // If we have direct file URLs instead
  if (directFileUrls.length > 0) {
    return <FileViewer directFileUrls={directFileUrls} />;
  }

  // No files found through either method
  return (
    <div>
      <span className="text-muted-foreground">No files available</span>
      <span className="ml-2 text-xs text-muted-foreground">({debugInfo})</span>
    </div>
  );
}
