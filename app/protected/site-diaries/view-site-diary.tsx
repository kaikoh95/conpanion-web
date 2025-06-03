'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { getSiteDiaryById } from '@/lib/api/site-diaries';
import { SiteDiaryResponse, SiteDiaryTemplateItem } from '@/lib/types/site-diary';
import { ApprovalStatus } from '@/lib/api/entries';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DiaryApprovalStatus } from './approval-status';
import { DebugWrapper } from '@/utils/debug';

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

  // Load diary data when diaryId changes
  useEffect(() => {
    if (!diaryId || !open) return;

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
    setIsEditMode(true);
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
        return <span className="text-muted-foreground">Photo upload not yet implemented</span>;

      default:
        return <span>{answerValue}</span>;
    }
  };

  // Get answer for a specific item
  const getAnswerForItem = (itemId: number | undefined) => {
    if (!itemId || !diaryData) return null;

    const answer = diaryData.answers.find((a) => a.item_id === itemId);
    return answer ? answer.answer_value : null;
  };

  // Format weather information
  const getWeatherInfo = () => {
    if (!diaryData?.diary.metadata) return 'Not specified';

    const metadata = diaryData.diary.metadata as any;
    const weather = metadata.weather || 'Not specified';
    const temp = metadata.temperature || {};
    const tempStr =
      temp.min || temp.max
        ? `${temp.min !== undefined ? temp.min + '°C' : '--'} to ${temp.max !== undefined ? temp.max + '°C' : '--'}`
        : 'Not specified';

    return `${weather}, ${tempStr}`;
  };

  // Get resource information
  const getResourceInfo = () => {
    if (!diaryData?.diary.metadata) return null;

    const metadata = diaryData.diary.metadata as any;

    return (
      <div className="space-y-2">
        <p>
          <strong>Manpower:</strong> {metadata.manpower || 0} workers
        </p>

        {metadata.equipment && metadata.equipment.length > 0 && (
          <div>
            <strong>Equipment:</strong>
            <ul className="list-inside list-disc">
              {metadata.equipment.map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {metadata.materials && (
          <div>
            <strong>Materials:</strong>
            <p>{metadata.materials}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          // When closing the sheet, clear the URL
          router.push('/protected/site-diaries');
        }
        onOpenChange(open);
      }}
    >
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

              {/* Edit button - only show if user is the author and diary is in draft status */}
              {user &&
                diaryData.diary.submitted_by_user_id === user.id &&
                approvalStatus === 'draft' && (
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
                  onRefreshData={onDiaryUpdated}
                />
              </div>
            )}

            {/* Site Conditions */}
            <div className="mb-6">
              <h3 className="mb-2 text-lg font-semibold">Site Conditions</h3>
              <div className="space-y-3 rounded-md bg-muted p-4">
                <div>
                  <p className="mb-1 text-sm font-medium">Weather</p>
                  <p>{getWeatherInfo()}</p>
                </div>

                {diaryData.diary.metadata?.conditions && (
                  <div>
                    <p className="mb-1 text-sm font-medium">General Conditions</p>
                    <p>{diaryData.diary.metadata.conditions}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Resources */}
            <div className="mb-6">
              <h3 className="mb-2 text-lg font-semibold">Resources</h3>
              <div className="rounded-md bg-muted p-4">
                {getResourceInfo() || (
                  <p className="text-muted-foreground">No resource information provided</p>
                )}
              </div>
            </div>

            {/* Safety */}
            {diaryData.diary.metadata?.safety && (
              <div className="mb-6">
                <h3 className="mb-2 text-lg font-semibold">Safety Observations</h3>
                <div className="rounded-md bg-muted p-4">
                  <p>{diaryData.diary.metadata.safety}</p>
                </div>
              </div>
            )}

            {/* Template Items */}
            {diaryData.template_items && diaryData.template_items.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-4 text-lg font-semibold">Additional Information</h3>
                <div className="space-y-4">
                  {diaryData.template_items.map((item) => (
                    <div key={item.id} className="rounded-md border p-4">
                      <p className="mb-2 font-medium">{item.question_value}</p>
                      <div className="ml-2">
                        {renderAnswerValue(item, getAnswerForItem(item.id))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer buttons for edit mode */}
            {isEditMode && (
              <div className="mt-4 border-t pt-4">
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditMode(false)}>
                    Cancel
                  </Button>
                  <Button>Save Changes</Button>
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
  );
}
