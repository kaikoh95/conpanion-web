'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { ScrollArea } from '../../components/ui/scroll-area';
import {
  ArrowLeft,
  Book,
  FileText,
  List,
  CheckSquare,
  Clock,
  User,
  Users,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  XCircle,
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/app/components/ui/avatar';
import {
  ApprovalWithEntityDetails,
  getApprovalWithEntityDetails,
  canUserApprove,
} from '@/lib/api/approvals';
import { ApprovalActions } from './ApprovalActions';
import { ApprovalComments } from './ApprovalComments';
import { formatDistanceToNow, format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { SiteDiaryResponses } from '@/components/site-diary-responses';

interface ApprovalDetailDrawerProps {
  approvalId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprovalUpdate?: () => void;
}

export function ApprovalDetailDrawer({
  approvalId,
  open,
  onOpenChange,
  onApprovalUpdate,
}: ApprovalDetailDrawerProps) {
  const [approval, setApproval] = useState<ApprovalWithEntityDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userCanApproveState, setUserCanApproveState] = useState(false);
  const { user } = useAuth();

  // Fetch approval details when drawer opens
  useEffect(() => {
    if (open && approvalId) {
      fetchApprovalDetails();
    }
  }, [open, approvalId]);

  const fetchApprovalDetails = async () => {
    if (!approvalId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch approval details and user permissions in parallel
      const [data, canApprove] = await Promise.all([
        getApprovalWithEntityDetails(approvalId),
        canUserApprove(approvalId),
      ]);

      setApproval(data);
      setUserCanApproveState(canApprove);
    } catch (err) {
      console.error('Error fetching approval details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch approval details');
    } finally {
      setLoading(false);
    }
  };

  // Get entity type icon
  const getEntityIcon = (entityType: string) => {
    switch (entityType) {
      case 'site_diary':
        return Book;
      case 'form':
        return FileText;
      case 'entries':
        return List;
      case 'tasks':
        return CheckSquare;
      default:
        return FileText;
    }
  };

  // Get status color and icon
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'approved':
        return {
          color: 'bg-green-500 hover:bg-green-600',
          icon: CheckCircle,
          textColor: 'text-green-600',
        };
      case 'declined':
        return {
          color: 'bg-red-500 hover:bg-red-600',
          icon: XCircle,
          textColor: 'text-red-600',
        };
      case 'submitted':
        return {
          color: 'bg-blue-500 hover:bg-blue-600',
          icon: Clock,
          textColor: 'text-blue-600',
        };
      case 'revision_requested':
        return {
          color: 'bg-yellow-500 hover:bg-yellow-600',
          icon: RotateCcw,
          textColor: 'text-yellow-600',
        };
      case 'draft':
      default:
        return {
          color: 'bg-gray-500 hover:bg-gray-600',
          icon: AlertCircle,
          textColor: 'text-gray-600',
        };
    }
  };

  // Format status text
  const formatStatus = (status: string) => {
    switch (status) {
      case 'revision_requested':
        return 'Revision Requested';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  };

  // Format entity type
  const formatEntityType = (entityType: string) => {
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

  if (!approval && !loading) {
    return null;
  }

  const EntityIcon = approval ? getEntityIcon(approval.entity_type) : FileText;
  const statusInfo = approval ? getStatusInfo(approval.status) : getStatusInfo('draft');
  const StatusIcon = statusInfo.icon;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader className="space-y-4">
          {/* Back Button */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SheetTitle className="text-lg">Approval Details</SheetTitle>
          </div>
        </SheetHeader>

        <ScrollArea className="mt-6 h-[calc(100vh-120px)]">
          {loading ? (
            // Loading state
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin" />
                <p className="text-sm text-muted-foreground">Loading approval details...</p>
              </div>
            </div>
          ) : error ? (
            // Error state
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
              <div className="mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive" />
                <h3 className="font-medium text-destructive">Error</h3>
              </div>
              <p className="mb-3 text-sm text-destructive/80">{error}</p>
              <Button variant="outline" size="sm" onClick={fetchApprovalDetails}>
                Try Again
              </Button>
            </div>
          ) : approval ? (
            // Approval content
            <div className="space-y-6">
              {/* Header Section */}
              <div className="space-y-4">
                {/* Entity Info */}
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <EntityIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold leading-tight">{approval.entity_title}</h2>
                    <p className="text-sm text-muted-foreground">
                      {formatEntityType(approval.entity_type)} #{approval.entity_id}
                    </p>
                  </div>
                </div>

                {/* Status Badge */}
                <div className="flex items-center gap-2">
                  <StatusIcon className={`h-4 w-4 ${statusInfo.textColor}`} />
                  <Badge className={`${statusInfo.color} text-white`}>
                    {formatStatus(approval.status)}
                  </Badge>
                </div>

                {/* Requester Info */}
                <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">Requested by</p>
                    <p className="text-sm text-muted-foreground">{approval.requester_name}</p>
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium">Created</p>
                    <p className="text-muted-foreground">
                      {format(new Date(approval.created_at), 'PPp')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Last Updated</p>
                    <p className="text-muted-foreground">
                      {format(new Date(approval.last_updated), 'PPp')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(approval.last_updated), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Entity Preview Section */}
              <div className="space-y-3">
                <h3 className="font-medium">Responses</h3>
                <div className="rounded-lg bg-muted/50">
                  {approval.entity_type === 'site_diary' && approval.entity_data ? (
                    <SiteDiaryResponses diaryData={approval.entity_data} className="p-4" />
                  ) : approval.entity_data ? (
                    <div className="p-4">
                      <p className="mb-2 text-sm text-muted-foreground">
                        {formatEntityType(approval.entity_type)} Data
                      </p>
                      <pre className="max-h-32 overflow-auto rounded border bg-background p-3 text-xs">
                        {JSON.stringify(approval.entity_data, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="p-4">
                      <p className="text-sm text-muted-foreground">No preview available</p>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Approvers Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <h3 className="font-medium">Approvers ({approval.approvers.length})</h3>
                </div>

                <div className="space-y-2">
                  {approval.approvers.map((approver: any) => {
                    const response = approval.approver_responses.find(
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
                            className={`${getStatusInfo(response.status).textColor} border-current`}
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

              <Separator />

              {/* Comments Section */}
              <ApprovalComments
                approvalId={approval.id}
                comments={approval.comments}
                onCommentAdded={() => {
                  fetchApprovalDetails();
                  onApprovalUpdate?.();
                }}
              />

              {/* Action Buttons Section */}
              <div className="border-t pt-4">
                <ApprovalActions
                  approvalId={approval.id}
                  currentStatus={approval.status}
                  userCanApprove={userCanApproveState}
                  userHasResponded={
                    !!approval.approver_responses.find((r: any) => r.approver_id === user?.id)
                  }
                  userResponse={
                    approval.approver_responses.find((r: any) => r.approver_id === user?.id)?.status
                  }
                  onActionComplete={() => {
                    fetchApprovalDetails();
                    onApprovalUpdate?.();
                  }}
                />
              </div>
            </div>
          ) : null}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
