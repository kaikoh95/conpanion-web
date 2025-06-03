'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { createApproval } from '@/lib/api/approvals';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, X, Check, User as UserIcon } from 'lucide-react';

type ApprovalApprover = {
  approver_id: string;
};

type Approval = {
  id: number;
  status: string;
  created_at: string;
  requester_id: string;
  last_updated: string;
  entity_type: string;
  entity_id: number;
  approval_approvers?: ApprovalApprover[];
};

type User = {
  id: string;
  raw_user_meta_data: {
    email?: string;
    name?: string;
    avatar_url?: string;
    [key: string]: any; // Allow for any additional properties
  };
};

interface ApprovalStatusAccordianProps {
  entryId: number;
  entityType?: string;
  currentStatus?: string | null;
  onRefreshData?: () => void;
}

export function ApprovalStatusAccordian({
  entryId,
  entityType = 'entries',
  currentStatus,
  onRefreshData,
}: ApprovalStatusAccordianProps) {
  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedApprovers, setSelectedApprovers] = useState<string[]>([]);
  const [requesterName, setRequesterName] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [externalEmail, setExternalEmail] = useState('');
  const [externalStakeholders, setExternalStakeholders] = useState<string[]>([]);

  // New state for combobox
  const [approverSearchInput, setApproverSearchInput] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch approval for this entry
  const fetchApproval = async () => {
    try {
      setLoading(true);
      const supabase = createClient();

      // Check if there's an approval for this entity
      const { data, error } = await supabase
        .from('approvals')
        .select(
          `
          *,
          approval_approvers (
            approver_id
          )
        `,
        )
        .eq('entity_type', entityType)
        .eq('entity_id', entryId)
        .maybeSingle(); // Use maybeSingle instead of single

      if (error) {
        console.error('Error fetching approval:', error);
        setApproval(null);
        return;
      }

      if (data) {
        setApproval(data);

        // Fetch approver details if there are any
        if (data.approval_approvers && data.approval_approvers.length > 0) {
          const approverIds = data.approval_approvers.map((aa: ApprovalApprover) => aa.approver_id);
          const { data: userData, error: userError } = await supabase.rpc('get_user_details', {
            user_ids: approverIds,
          });

          if (userData && userData.length > 0) {
            setUsers(userData);
          } else if (userError) {
            console.error('Error fetching approver details:', userError);
          }
        }
      } else {
        setApproval(null);
      }
    } catch (err) {
      console.error('Failed to fetch approval:', err);
      setApproval(null);
    } finally {
      setLoading(false);
    }
  };

  // Update useEffect to use the moved function
  useEffect(() => {
    fetchApproval();
  }, [entryId]);

  // Fetch users for approver selection and initialize filtered users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const supabase = createClient();

        // We need to get all available users from auth.users using the get_user_details RPC function
        // First we need a way to get all user IDs
        // As a workaround, let's fetch first from a table that references users
        const { data: projectUsers, error: projectUsersError } = await supabase
          .from('projects_users')
          .select('user_id')
          .limit(100); // Limit to a reasonable number

        if (projectUsersError) {
          console.error('Error fetching project users:', projectUsersError);
          return;
        }

        if (!projectUsers || projectUsers.length === 0) {
          console.warn('No users found in projects_users table');
          return;
        }

        // Extract unique user IDs
        const userIds = Array.from(new Set(projectUsers.map((pu) => pu.user_id)));

        // Now fetch user details using the RPC function
        const { data: userData, error: userError } = await supabase.rpc('get_user_details', {
          user_ids: userIds,
        });

        if (userError) {
          console.error('Error fetching user details:', userError);
          return;
        }

        console.log('Fetched users:', userData);
        setUsers(userData || []);
      } catch (err) {
        console.error('Failed to fetch users:', err);
      }
    }

    if (dialogOpen) {
      fetchUsers();
    }
  }, [dialogOpen]);

  // Filter users based on search input
  useEffect(() => {
    if (approverSearchInput.trim() === '') {
      // Show all users instead of an empty list when search is empty
      setFilteredUsers(users);
    } else {
      const searchTerm = approverSearchInput.toLowerCase();
      console.log('Search term:', searchTerm);
      console.log('Current users array:', users);

      const matched = users.filter((user) => {
        // Extract email from user metadata
        const userMetadata = user.raw_user_meta_data || {};
        let email = '';

        // Check different possible locations where email might be stored
        if (typeof userMetadata.email === 'string') {
          email = userMetadata.email;
        } else if (typeof userMetadata.email_address === 'string') {
          email = userMetadata.email_address;
        } else if (typeof userMetadata === 'object') {
          // Try to find any property that looks like an email
          Object.entries(userMetadata).forEach(([key, value]) => {
            if (
              typeof value === 'string' &&
              (key.includes('email') || (typeof value === 'string' && value.includes('@')))
            ) {
              email = value;
            }
          });
        }

        console.log(`User ID: ${user.id}`);
        console.log(`Raw metadata:`, user.raw_user_meta_data);
        console.log(`Extracted email: "${email}"`);

        // Perform the matching
        const matchesEmail = email.toLowerCase().includes(searchTerm);
        console.log(
          `Email match: ${matchesEmail} - Search "${searchTerm}" in "${email.toLowerCase()}"`,
        );

        return matchesEmail;
      });

      console.log('Filtered users:', matched);
      setFilteredUsers(matched);
    }
  }, [approverSearchInput, users]);

  const handleCreateApproval = async () => {
    try {
      setCreateLoading(true);

      // Validate that at least one approver is selected
      if (selectedApprovers.length === 0) {
        alert('Please select at least one approver');
        setCreateLoading(false);
        return;
      }

      await createApproval({
        entity_type: entityType,
        entity_id: entryId,
        approvers_id: selectedApprovers,
      });

      setDialogOpen(false);

      // Trigger a refresh of the approval data
      fetchApproval();

      // Dispatch custom event to notify parent components that approval has been updated
      const customEvent = new CustomEvent('approvalUpdated', {
        detail: { entityId: entryId, entityType },
      });
      window.dispatchEvent(customEvent);

      // Notify parent component if needed
      if (onRefreshData) {
        onRefreshData();
      }
    } catch (err) {
      console.error('Failed to create approval:', err);
      alert('Failed to create approval request. Please try again.');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleExternalEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && externalEmail.trim()) {
      e.preventDefault();
      if (isValidEmail(externalEmail)) {
        addExternalStakeholder(externalEmail);
      } else {
        alert('Please enter a valid email address');
      }
    }
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const addExternalStakeholder = (email: string) => {
    if (!externalStakeholders.includes(email)) {
      setExternalStakeholders([...externalStakeholders, email]);
    }
    setExternalEmail('');
  };

  const removeExternalStakeholder = (email: string) => {
    setExternalStakeholders(externalStakeholders.filter((e) => e !== email));
  };

  const handleSelectApprover = (user: User) => {
    if (!selectedApprovers.includes(user.id)) {
      setSelectedApprovers([...selectedApprovers, user.id]);
    }
    setApproverSearchInput('');
    setShowUserDropdown(false);
  };

  const getUserById = (id: string): User | undefined => {
    return users.find((user) => user.id === id);
  };

  const getUserEmail = (user: User | undefined): string => {
    if (!user || !user.raw_user_meta_data) return '';

    const metadata = user.raw_user_meta_data;

    // Try different possible locations
    if (typeof metadata.email === 'string') {
      return metadata.email;
    } else if (typeof metadata.email_address === 'string') {
      return metadata.email_address;
    } else {
      // Try to find any property that looks like an email
      for (const [key, value] of Object.entries(metadata)) {
        if (
          typeof value === 'string' &&
          (key.includes('email') || (typeof value === 'string' && value.includes('@')))
        ) {
          return value;
        }
      }
    }

    return '';
  };

  const getUserName = (user: User | undefined): string => {
    return user?.raw_user_meta_data?.name || user?.raw_user_meta_data?.email || 'Unknown';
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchInputRef.current && !searchInputRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Accordion type="single" collapsible className="w-full" defaultValue="approval">
      <AccordionItem value="approval">
        <AccordionTrigger>Approval status</AccordionTrigger>
        <AccordionContent>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              <span>Loading approval status...</span>
            </div>
          ) : approval ? (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    approval.status === 'approved'
                      ? 'bg-green-500'
                      : approval.status === 'declined'
                        ? 'bg-red-500'
                        : approval.status === 'submitted'
                          ? 'bg-yellow-500'
                          : approval.status === 'revision_requested'
                            ? 'bg-orange-500'
                            : 'bg-gray-500'
                  }`}
                />
                <span className="font-medium">{formatStatus(approval.status)}</span>
              </div>

              {/* Last Updated */}
              <div className="text-sm text-muted-foreground">
                Last updated: {formatDate(approval.last_updated)}
              </div>

              {/* Approvers Section */}
              <div className="mt-4 space-y-2">
                <h4 className="text-sm font-semibold">Approvers</h4>
                <div className="space-y-2">
                  {users.map((user) => (
                    <div key={user.id} className="rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <UserIcon className="h-4 w-4 text-muted-foreground" />
                        <span>{getUserName(user)}</span>
                        <span className="text-sm text-muted-foreground">
                          ({getUserEmail(user)})
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p>No approvals tied to entry.</p>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>Create approval</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Approval Request</DialogTitle>
                    <DialogDescription>
                      Select the approvers who will review this entry. You can search by email
                      address.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="approver-search">Select Approvers</Label>
                      <div className="relative" ref={searchInputRef}>
                        <Input
                          id="approver-search"
                          type="email"
                          placeholder="Search by email"
                          value={approverSearchInput}
                          onChange={(e) => {
                            setApproverSearchInput(e.target.value);
                            setShowUserDropdown(true);
                          }}
                          onFocus={() => setShowUserDropdown(true)}
                        />
                        {showUserDropdown && (
                          <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                            {users.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                Loading users...
                              </div>
                            ) : filteredUsers.length === 0 ? (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                No users found. Try a different search term.
                              </div>
                            ) : (
                              filteredUsers.map((user) => (
                                <div
                                  key={user.id}
                                  className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => handleSelectApprover(user)}
                                >
                                  <UserIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                                  <span>{getUserName(user)}</span>
                                  <span className="ml-1 text-muted-foreground">
                                    ({getUserEmail(user)})
                                  </span>
                                  {selectedApprovers.includes(user.id) && (
                                    <Check className="ml-auto h-4 w-4 text-primary" />
                                  )}
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {selectedApprovers.length > 0 && (
                      <div className="mt-4">
                        <Label className="mb-2 block">Selected Approvers</Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedApprovers.map((approverId) => {
                            const user = getUserById(approverId);
                            return (
                              <div
                                key={approverId}
                                className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                              >
                                <span>{getUserName(user)}</span>
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-foreground"
                                  onClick={() =>
                                    setSelectedApprovers(
                                      selectedApprovers.filter((id) => id !== approverId),
                                    )
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateApproval} disabled={createLoading}>
                      {createLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        'Submit'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
