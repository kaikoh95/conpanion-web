'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { submitApproval, canUserApprove, submitApproverResponse } from '@/lib/api/approvals';
import type { ApprovalStatus } from '@/lib/api/entries';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

interface DiaryApprovalStatusProps {
  entityId: number;
  entityType: string;
  currentStatus: ApprovalStatus | null;
  onRefreshData: () => void;
}

export function DiaryApprovalStatus({
  entityId,
  entityType,
  currentStatus,
  onRefreshData,
}: DiaryApprovalStatusProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<ApprovalStatus | null>(currentStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userCanApprove, setUserCanApprove] = useState(false);
  const [approvalId, setApprovalId] = useState<number | null>(null);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  // Check if user can approve and get approval ID
  useEffect(() => {
    const checkApprovalPermissions = async () => {
      if (!entityId || !user) return;

      try {
        // Get the approval record for this entity
        const supabase = getSupabaseClient();
        const { data: approval } = await supabase
          .from('approvals')
          .select('id')
          .eq('entity_type', entityType as 'site_diary')
          .eq('entity_id', entityId)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (approval) {
          setApprovalId(approval.id);
          const canApprove = await canUserApprove(approval.id);
          setUserCanApprove(canApprove);
        }
      } catch (err) {
        console.error('Error checking approval permissions:', err);
      }
    };

    checkApprovalPermissions();
  }, [entityId, entityType, user]);

  // Update approval status using new approval system
  const handleApprovalAction = async (action: 'approve' | 'decline') => {
    if (!entityId || !user || !approvalId) return;

    setIsSubmitting(true);

    try {
      const newStatus = action === 'approve' ? 'approved' : 'declined';

      await submitApproverResponse(approvalId, newStatus);

      setStatus(newStatus);
      toast.success(`Item ${action === 'approve' ? 'approved' : 'declined'} successfully`);
      onRefreshData();
    } catch (err: any) {
      console.error(`Error ${action}ing item:`, err);
      toast.error(err.message || `Failed to ${action} item`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Navigate to detailed approval view
  const handleViewDetailedApproval = () => {
    router.push('/protected/approvals');
  };

  // Get status badge color
  const getStatusColor = (status: ApprovalStatus | null): string => {
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

  // Get status display text
  const getStatusText = (status: ApprovalStatus | null): string => {
    if (!status) return 'Draft';

    switch (status) {
      case 'approved':
        return 'Approved';
      case 'declined':
        return 'Declined';
      case 'submitted':
        return 'Submitted';
      case 'revision_requested':
        return 'Revision Requested';
      case 'draft':
        return 'Draft';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium">Status:</span>
          <Badge className={getStatusColor(status)}>{getStatusText(status)}</Badge>
        </div>

        {approvalId && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewDetailedApproval}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="mr-1 h-3 w-3" />
            View Details
          </Button>
        )}
      </div>

      {user && userCanApprove && status !== 'approved' && status !== 'declined' && approvalId && (
        <div className="mt-4">
          <div className="mb-2 text-sm text-muted-foreground">
            Quick approval actions (for detailed review, use "View Details"):
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              className="border-red-500 hover:bg-red-50"
              onClick={() => handleApprovalAction('decline')}
              disabled={isSubmitting}
            >
              <XCircle className="mr-2 h-4 w-4 text-red-500" />
              Decline
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={() => handleApprovalAction('approve')}
              disabled={isSubmitting}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </div>
        </div>
      )}

      {user && !userCanApprove && approvalId && status !== 'approved' && status !== 'declined' && (
        <div className="text-sm text-muted-foreground">
          You are not assigned as an approver for this item.
        </div>
      )}
    </div>
  );
}
