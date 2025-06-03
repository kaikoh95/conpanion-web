'use client';

import { Button } from '@/components/ui/button';
import { approveApproval } from '@/lib/api/approvals';
import { useState } from 'react';

interface ApproveButtonProps {
  approvalId: number;
  onApproved?: () => void;
}

export function ApproveButton({ approvalId, onApproved }: ApproveButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await approveApproval(approvalId);
      console.log('Approval approved:', data);

      if (onApproved) {
        onApproved();
      }
    } catch (error) {
      console.error('Error approving:', error);
      setError(error instanceof Error ? error.message : 'Failed to approve');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleApprove} disabled={isLoading} variant="default">
        {isLoading ? 'Approving...' : 'Approve'}
      </Button>
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
}
