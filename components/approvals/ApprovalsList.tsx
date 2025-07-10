'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Filter, RefreshCw } from 'lucide-react';
import { ApprovalCard } from './ApprovalCard';
import { ApprovalWithDetails } from '@/lib/api/approvals';
import { Skeleton } from '@/components/ui/skeleton';

interface ApprovalsListProps {
  approvals: ApprovalWithDetails[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onApprovalClick?: (approval: ApprovalWithDetails) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export function ApprovalsList({
  approvals,
  loading,
  error,
  onRefresh,
  onApprovalClick,
  emptyTitle = 'No approvals found',
  emptyDescription = 'Approvals will appear here when available',
}: ApprovalsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter approvals based on search and filters
  const filteredApprovals = approvals.filter((approval) => {
    // Search filter
    const matchesSearch =
      searchTerm === '' ||
      approval.entity_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      approval.requester_name.toLowerCase().includes(searchTerm.toLowerCase());

    // Entity type filter
    const matchesEntityType =
      entityTypeFilter === 'all' || approval.entity_type === entityTypeFilter;

    // Status filter
    const matchesStatus = statusFilter === 'all' || approval.status === statusFilter;

    return matchesSearch && matchesEntityType && matchesStatus;
  });

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-destructive">Error loading approvals</h3>
            <p className="mt-1 text-sm text-destructive/80">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        {/* Search */}
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search approvals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Select value={entityTypeFilter} onValueChange={setEntityTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Entity type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="site_diary">Site Diaries</SelectItem>
              <SelectItem value="form">Forms</SelectItem>
              <SelectItem value="entries">Entries</SelectItem>
              <SelectItem value="tasks">Tasks</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="revision_requested">Revision Requested</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        // Loading skeletons
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-start gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredApprovals.length === 0 ? (
        // Empty state
        <div className="flex h-32 items-center justify-center text-center">
          <div>
            <Filter className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <h3 className="font-medium">{emptyTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
            {(searchTerm || entityTypeFilter !== 'all' || statusFilter !== 'all') && (
              <Button
                variant="link"
                size="sm"
                className="mt-2"
                onClick={() => {
                  setSearchTerm('');
                  setEntityTypeFilter('all');
                  setStatusFilter('all');
                }}
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        // Approval cards
        <div className="space-y-3">
          {filteredApprovals.map((approval) => (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onClick={() => onApprovalClick?.(approval)}
            />
          ))}
        </div>
      )}

      {/* Results count */}
      {!loading && filteredApprovals.length > 0 && (
        <div className="text-center text-sm text-muted-foreground">
          Showing {filteredApprovals.length} of {approvals.length} approvals
        </div>
      )}
    </div>
  );
}
