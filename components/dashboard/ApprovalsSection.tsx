'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Users, ArrowRight, Plus } from 'lucide-react';
import { getUserRequestedApprovals, DashboardApproval } from '@/lib/api/dashboard';
import { formatDistanceToNow } from 'date-fns';
import { useProject } from '@/contexts/ProjectContext';

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'declined':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'revision_requested':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'submitted':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'draft':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'declined':
      return 'Declined';
    case 'revision_requested':
      return 'Needs Revision';
    case 'submitted':
      return 'Under Review';
    case 'draft':
      return 'Draft';
    default:
      return 'Pending';
  }
};

const getEntityTypeLabel = (entityType: string) => {
  switch (entityType) {
    case 'tasks':
      return 'Task';
    case 'form':
      return 'Form';
    case 'entries':
      return 'Entry';
    case 'site_diary':
      return 'Site Diary';
    default:
      return 'Item';
  }
};

interface ApprovalsSectionProps {
  onApprovalClick?: (approvalId: number) => void;
}

export function ApprovalsSection({ onApprovalClick }: ApprovalsSectionProps) {
  const [approvals, setApprovals] = useState<DashboardApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadApprovals = async () => {
      try {
        if (!currentProject?.id) {
          setApprovals([]);
          return;
        }

        const userApprovals = await getUserRequestedApprovals(currentProject.id, 5);
        setApprovals(userApprovals);
      } catch (error) {
        console.error('Error loading approvals:', error);
      } finally {
        setLoading(false);
      }
    };

    loadApprovals();
  }, [currentProject?.id]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Shield className="h-5 w-5 text-orange-600" />
            My Approval Requests
          </CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-5 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          <Shield className="h-5 w-5 text-orange-600" />
          My Approval Requests
        </CardTitle>
        <Badge variant="secondary" className="text-xs">
          {approvals.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {approvals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Shield className="mb-3 h-12 w-12 text-muted-foreground/50" />
            <p className="mb-2 text-sm text-muted-foreground">No approval requests</p>
            <Button asChild size="sm" variant="outline">
              <Link href="/protected/approvals">
                <Plus className="mr-1 h-3 w-3" />
                View Approvals
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {approvals.map((approval) => (
                <button
                  key={approval.id}
                  onClick={() => onApprovalClick?.(approval.id)}
                  className="group block w-full text-left"
                >
                  <div className="rounded-lg border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-sm font-medium group-hover:text-primary">
                          {approval.entity_title}
                        </h4>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {getEntityTypeLabel(approval.entity_type)} •{' '}
                          {formatDistanceToNow(new Date(approval.created_at), { addSuffix: true })}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge
                            className={`text-xs ${getStatusColor(approval.status)}`}
                            variant="outline"
                          >
                            {getStatusLabel(approval.status)}
                          </Badge>
                          {approval.pending_count > 0 && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {approval.pending_count} pending
                            </div>
                          )}
                          {approval.approvers_count > 0 &&
                            approval.pending_count === 0 &&
                            approval.status === 'approved' && (
                              <div className="flex items-center gap-1 text-xs text-green-600">
                                <Users className="h-3 w-3" />
                                All approved
                              </div>
                            )}
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="border-t pt-2">
              <Button asChild variant="ghost" size="sm" className="w-full justify-center">
                <Link href="/protected/approvals">
                  View All Requests
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
