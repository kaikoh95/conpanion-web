'use client';

import { Button } from '@/components/ui/button';
import { createApproval } from '@/lib/api/approvals';
import { useState } from 'react';

export function CreateApprovalButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateApproval = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const data = await createApproval({
        entity_type: 'site_diary',
        entity_id: 123,
        approvers_id: [
          'c0b0abdc-1472-41fc-8844-b44d1691004a',
          '6334f456-9dbc-4a27-946b-f0a3a2bc827e',
        ],
      });

      console.log('Approval created:', data);
    } catch (error) {
      console.error('Error creating approval:', error);
      setError(error instanceof Error ? error.message : 'Failed to create approval');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={handleCreateApproval} disabled={isLoading} variant="default">
        {isLoading ? 'Creating Approval...' : 'Create Approval'}
      </Button>
      {error && <div className="text-sm text-destructive">{error}</div>}
    </div>
  );
}
