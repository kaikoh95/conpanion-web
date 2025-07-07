import { useState, useEffect } from 'react';
import {
  getPendingApprovalsForUser,
  getMyApprovalRequests,
  ApprovalWithDetails,
} from '@/lib/api/approvals';

/**
 * Hook for fetching pending approvals for current user (as approver)
 */
export function usePendingApprovals() {
  const [approvals, setApprovals] = useState<ApprovalWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPendingApprovalsForUser();
      setApprovals(data);
    } catch (err) {
      console.error('Error fetching pending approvals:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  return {
    approvals,
    loading,
    error,
    refresh: fetchApprovals,
  };
}

/**
 * Hook for fetching approval requests made by current user (as requester)
 */
export function useMyApprovalRequests() {
  const [requests, setRequests] = useState<ApprovalWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getMyApprovalRequests();
      setRequests(data);
    } catch (err) {
      console.error('Error fetching approval requests:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  return {
    requests,
    loading,
    error,
    refresh: fetchRequests,
  };
}
