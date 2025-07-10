'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, FileText } from 'lucide-react';
import { ApprovalsList } from '@/components/approvals/ApprovalsList';
import { ApprovalDetailDrawer } from '@/components/approvals/ApprovalDetailDrawer';
import { usePendingApprovals, useMyApprovalRequests } from '@/hooks/useApprovals';
import { ApprovalWithDetails } from '@/lib/api/approvals';

export default function ApprovalsPage() {
  const [activeTab, setActiveTab] = useState('pending');
  const [selectedApprovalId, setSelectedApprovalId] = useState<number | null>(null);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);

  // Fetch data using our custom hooks
  const {
    approvals: pendingApprovals,
    loading: pendingLoading,
    error: pendingError,
    refresh: refreshPending,
  } = usePendingApprovals();

  const {
    requests: myRequests,
    loading: requestsLoading,
    error: requestsError,
    refresh: refreshRequests,
  } = useMyApprovalRequests();

  const handleApprovalClick = (approval: ApprovalWithDetails) => {
    setSelectedApprovalId(approval.id);
    setDetailDrawerOpen(true);
  };

  const handleApprovalUpdate = () => {
    // Refresh both lists when an approval is updated
    refreshPending();
    refreshRequests();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <CheckCircle2 className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Approvals</h1>
          <p className="text-muted-foreground">Manage approval requests and review pending items</p>
        </div>
      </div>

      {/* Tabs Container */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Pending Approvals
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            My Requests
          </TabsTrigger>
        </TabsList>

        {/* Pending Approvals Tab */}
        <TabsContent value="pending" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Approvals</CardTitle>
              <CardDescription>Items requiring your approval</CardDescription>
            </CardHeader>
            <CardContent>
              <ApprovalsList
                approvals={pendingApprovals}
                loading={pendingLoading}
                error={pendingError}
                onRefresh={refreshPending}
                onApprovalClick={handleApprovalClick}
                emptyTitle="No pending approvals"
                emptyDescription="Items requiring your approval will appear here"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* My Requests Tab */}
        <TabsContent value="requests" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>My Approval Requests</CardTitle>
              <CardDescription>Items you've requested approval for</CardDescription>
            </CardHeader>
            <CardContent>
              <ApprovalsList
                approvals={myRequests}
                loading={requestsLoading}
                error={requestsError}
                onRefresh={refreshRequests}
                onApprovalClick={handleApprovalClick}
                emptyTitle="No approval requests"
                emptyDescription="Your approval requests will appear here"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approval Detail Drawer */}
      <ApprovalDetailDrawer
        approvalId={selectedApprovalId}
        open={detailDrawerOpen}
        onOpenChange={setDetailDrawerOpen}
        onApprovalUpdate={handleApprovalUpdate}
      />
    </div>
  );
}
