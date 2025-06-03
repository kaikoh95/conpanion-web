'use client';
import FetchDataSteps from '@/components/tutorial/fetch-data-steps';
import { InfoIcon } from 'lucide-react';
import { redirect } from 'next/navigation';
import { CreateApprovalButton } from '@/components/create-approval-button';
import { ApproveButton } from '@/components/approve-button';
import { useAuth } from '@/hooks/useAuth';

export default function ProtectedPage() {
  const { user } = useAuth();

  return (
    <div className="flex w-full flex-1 flex-col gap-12">
      <div className="w-full">
        <div className="flex items-center gap-3 rounded-md bg-accent p-3 px-5 text-sm text-foreground">
          <InfoIcon size="16" strokeWidth={2} />
          This is a protected page that you can only see as an authenticated user
        </div>
      </div>
      <div className="flex flex-col items-start gap-2">
        <h2 className="mb-4 text-2xl font-bold">Your user details</h2>
        <pre className="max-h-32 overflow-auto rounded border p-3 font-mono text-xs">
          {JSON.stringify(user, null, 2)}
        </pre>
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Create Approval</h2>
        <CreateApprovalButton />
      </div>
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Approve Approval</h2>
        <ApproveButton approvalId={31} />
      </div>
      <div>
        <h2 className="mb-4 text-2xl font-bold">Next steps</h2>
        <FetchDataSteps />
      </div>
    </div>
  );
}
