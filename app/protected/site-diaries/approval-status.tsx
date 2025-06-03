'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { submitApproval } from '@/lib/api/approvals';
import type { ApprovalStatus } from '@/lib/api/entries';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

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
  const [status, setStatus] = useState<ApprovalStatus | null>(currentStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setStatus(currentStatus);
  }, [currentStatus]);

  // Update approval status
  const handleApprovalAction = async (action: 'approve' | 'decline') => {
    if (!entityId || !user) return;

    setIsSubmitting(true);

    try {
      const newStatus: ApprovalStatus = action === 'approve' ? 'approved' : 'declined';

      await submitApproval({
        entityId,
        entityType,
        status: newStatus,
        userId: user.id,
      });

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
      <div className="flex items-center gap-2">
        <span className="font-medium">Status:</span>
        <Badge className={getStatusColor(status)}>{getStatusText(status)}</Badge>
      </div>

      {user && status !== 'approved' && status !== 'declined' && (
        <div className="mt-4 flex justify-end gap-2">
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
      )}
    </div>
  );
}
