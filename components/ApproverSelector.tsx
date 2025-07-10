'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserIcon, Check, X, Loader2, Users } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';

type User = {
  id: string;
  raw_user_meta_data: {
    email?: string;
    name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
};

interface ApproverSelectorProps {
  selectedApprovers: string[];
  onApproversChange: (approverIds: string[]) => void;
  projectId?: number;
  trigger?: React.ReactNode;
  disabled?: boolean;
}

export function ApproverSelector({
  selectedApprovers,
  onApproversChange,
  projectId,
  trigger,
  disabled = false,
}: ApproverSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [approverSearchInput, setApproverSearchInput] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fetch users when dialog opens
  useEffect(() => {
    if (dialogOpen && projectId) {
      fetchUsers();
    }
  }, [dialogOpen, projectId]);

  // Filter users based on search input
  useEffect(() => {
    if (approverSearchInput.trim() === '') {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter((user) => {
        const email = getUserEmail(user).toLowerCase();
        const name = getUserName(user).toLowerCase();
        const searchTerm = approverSearchInput.toLowerCase();
        return email.includes(searchTerm) || name.includes(searchTerm);
      });
      setFilteredUsers(filtered);
    }
  }, [approverSearchInput, users]);

  const fetchUsers = async () => {
    if (!projectId) return;

    setLoading(true);
    try {
      const supabase = createClient();

      // Get project members using the database function
      const { data: projectMembers, error: membersError } = await supabase.rpc(
        'get_project_members',
        { p_project_id: projectId },
      );

      if (membersError) {
        console.error('Error fetching project members:', membersError);
        return;
      }

      if (!projectMembers || projectMembers.length === 0) {
        setUsers([]);
        return;
      }

      // Get user details for all project members
      const userIds = projectMembers.map((member: any) => member.user_id);
      const { data: userData, error: userError } = await supabase.rpc('get_user_details', {
        user_ids: userIds,
      });

      if (userError) {
        console.error('Error fetching user details:', userError);
        return;
      }

      setUsers(userData || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectApprover = (user: User) => {
    const newSelectedApprovers = selectedApprovers.includes(user.id)
      ? selectedApprovers.filter((id) => id !== user.id)
      : [...selectedApprovers, user.id];

    onApproversChange(newSelectedApprovers);
    setApproverSearchInput('');
    setShowUserDropdown(false);
  };

  const removeApprover = (approverId: string) => {
    onApproversChange(selectedApprovers.filter((id) => id !== approverId));
  };

  const getUserById = (id: string): User | undefined => {
    return users.find((user) => user.id === id);
  };

  const getUserEmail = (user: User | undefined): string => {
    if (!user || !user.raw_user_meta_data) return '';

    const metadata = user.raw_user_meta_data;

    if (typeof metadata.email === 'string') {
      return metadata.email;
    } else if (typeof metadata.email_address === 'string') {
      return metadata.email_address;
    } else {
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

  const defaultTrigger = (
    <Button variant="outline" disabled={disabled}>
      <Users className="mr-2 h-4 w-4" />
      Select Approvers
      {selectedApprovers.length > 0 && (
        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
          {selectedApprovers.length}
        </span>
      )}
    </Button>
  );

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>{trigger || defaultTrigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Select Approvers</DialogTitle>
          <DialogDescription>
            Choose team members who will review and approve this item. You can search by name or
            email address.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="approver-search">Search Team Members</Label>
            <div className="relative" ref={searchInputRef}>
              <Input
                id="approver-search"
                type="text"
                placeholder="Search by name or email"
                value={approverSearchInput}
                onChange={(e) => {
                  setApproverSearchInput(e.target.value);
                  setShowUserDropdown(true);
                }}
                onFocus={() => setShowUserDropdown(true)}
                disabled={loading}
              />
              {showUserDropdown && (
                <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {loading ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
                      Loading team members...
                    </div>
                  ) : users.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      No team members found.
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
                        <div className="flex-1">
                          <span>{getUserName(user)}</span>
                          <span className="ml-1 text-muted-foreground">({getUserEmail(user)})</span>
                        </div>
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
              <Label className="mb-2 block">Selected Approvers ({selectedApprovers.length})</Label>
              <div className="flex flex-wrap gap-2">
                {selectedApprovers.map((approverId) => {
                  const user = getUserById(approverId);
                  return (
                    <div
                      key={approverId}
                      className="flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm"
                    >
                      <UserIcon className="h-3 w-3 text-muted-foreground" />
                      <span>{getUserName(user)}</span>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => removeApprover(approverId)}
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
          <Button onClick={() => setDialogOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
