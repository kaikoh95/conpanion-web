'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { CheckCircle, XCircle, RotateCcw, Loader2, AlertCircle } from 'lucide-react';
import { submitApproverResponse, canUserApprove } from '@/lib/api/approvals';
import { useAuth } from '@/hooks/useAuth';

interface ApprovalActionsProps {
  approvalId: number;
  currentStatus: string;
  userCanApprove: boolean;
  userHasResponded: boolean;
  userResponse?: string | null;
  onActionComplete?: () => void;
  disabled?: boolean;
}

export function ApprovalActions({
  approvalId,
  currentStatus,
  userCanApprove,
  userHasResponded,
  userResponse,
  onActionComplete,
  disabled = false,
}: ApprovalActionsProps) {
  const [loading, setLoading] = useState(false);
  const [actionComment, setActionComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Don't show actions if user can't approve or approval is already finalized
  const shouldShowActions =
    userCanApprove && !disabled && ['submitted', 'revision_requested'].includes(currentStatus);

  const handleAction = async (action: 'approved' | 'declined' | 'revision_requested') => {
    if (!approvalId || loading) return;

    try {
      setLoading(true);
      setError(null);

      await submitApproverResponse(approvalId, action, actionComment.trim() || undefined);

      // Clear comment after successful submission
      setActionComment('');

      // Notify parent component
      onActionComplete?.();
    } catch (err) {
      console.error('Error submitting approval response:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setLoading(false);
    }
  };

  // Get action button configs
  const getActionConfig = (action: 'approved' | 'declined' | 'revision_requested') => {
    switch (action) {
      case 'approved':
        return {
          label: 'Approve',
          icon: CheckCircle,
          variant: 'default' as const,
          className: 'bg-green-600 hover:bg-green-700 text-white',
          dialogTitle: 'Approve Request',
          dialogDescription:
            'Are you sure you want to approve this request? This action cannot be undone.',
          confirmText: 'Approve',
        };
      case 'declined':
        return {
          label: 'Decline',
          icon: XCircle,
          variant: 'destructive' as const,
          className: '',
          dialogTitle: 'Decline Request',
          dialogDescription:
            'Are you sure you want to decline this request? Please provide a reason for declining.',
          confirmText: 'Decline',
        };
      case 'revision_requested':
        return {
          label: 'Request Revision',
          icon: RotateCcw,
          variant: 'outline' as const,
          className: 'border-yellow-500 text-yellow-600 hover:bg-yellow-50',
          dialogTitle: 'Request Revision',
          dialogDescription:
            'Request changes to this submission. Please provide specific feedback.',
          confirmText: 'Request Revision',
        };
    }
  };

  // Action button component
  const ActionButton = ({ action }: { action: 'approved' | 'declined' | 'revision_requested' }) => {
    const config = getActionConfig(action);
    const Icon = config.icon;
    const requiresComment = action === 'declined' || action === 'revision_requested';

    return (
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant={config.variant}
            className={`flex items-center gap-2 ${config.className}`}
            disabled={loading}
          >
            <Icon className="h-4 w-4" />
            {config.label}
          </Button>
        </AlertDialogTrigger>

        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5" />
              {config.dialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{config.dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comment">
                Comment {requiresComment ? '(Required)' : '(Optional)'}
              </Label>
              <Textarea
                id="comment"
                placeholder={
                  action === 'approved'
                    ? 'Add any additional notes...'
                    : action === 'declined'
                      ? 'Please explain why this request is being declined...'
                      : 'Please provide specific feedback for revision...'
                }
                value={actionComment}
                onChange={(e) => setActionComment(e.target.value)}
                className="min-h-20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleAction(action)}
              disabled={loading || (requiresComment && !actionComment.trim())}
              className={config.className}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Icon className="mr-2 h-4 w-4" />
                  {config.confirmText}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };

  // Don't render if user shouldn't see actions
  if (!shouldShowActions) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Your Response</h3>
        {userHasResponded && (
          <div className="text-sm text-muted-foreground">
            You have already responded:{' '}
            <span className="font-medium capitalize">{userResponse}</span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <ActionButton action="approved" />
        <ActionButton action="declined" />
        <ActionButton action="revision_requested" />
      </div>

      {/* Help Text */}
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>
          • <strong>Approve:</strong> Accept the request as submitted
        </p>
        <p>
          • <strong>Decline:</strong> Reject the request (requires reason)
        </p>
        <p>
          • <strong>Request Revision:</strong> Ask for changes (requires feedback)
        </p>
      </div>

      {userHasResponded && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <strong>Note:</strong> You can change your response at any time before the approval is
          finalized.
        </div>
      )}
    </div>
  );
}
