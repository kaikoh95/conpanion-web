'use client';

import { useState, useEffect } from 'react';
import { UserIcon, Users, X } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type User = {
  id: string;
  raw_user_meta_data: {
    email?: string;
    name?: string;
    avatar_url?: string;
    [key: string]: any;
  };
};

interface SelectedApproversDisplayProps {
  selectedApprovers: string[];
  onRemoveApprover?: (approverId: string) => void;
  projectId?: number;
  showRemoveButton?: boolean;
  className?: string;
}

export function SelectedApproversDisplay({
  selectedApprovers,
  onRemoveApprover,
  projectId,
  showRemoveButton = false,
  className = '',
}: SelectedApproversDisplayProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch user details when selectedApprovers change
  useEffect(() => {
    if (selectedApprovers.length > 0 && projectId) {
      fetchUserDetails();
    } else {
      setUsers([]);
    }
  }, [selectedApprovers, projectId]);

  const fetchUserDetails = async () => {
    if (!projectId || selectedApprovers.length === 0) return;

    setLoading(true);
    try {
      const supabase = createClient();

      // Get user details for selected approvers
      const { data: userData, error: userError } = await supabase.rpc('get_user_details', {
        user_ids: selectedApprovers,
      });

      if (userError) {
        console.error('Error fetching user details:', userError);
        return;
      }

      setUsers(userData || []);
    } catch (err) {
      console.error('Failed to fetch user details:', err);
    } finally {
      setLoading(false);
    }
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

  if (selectedApprovers.length === 0) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        No approvers selected. The diary will remain in draft status.
      </div>
    );
  }

  if (loading) {
    return (
      <div className={`text-sm text-muted-foreground ${className}`}>
        Loading approver details...
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Selected Approvers ({selectedApprovers.length})</span>
      </div>

      <div className="space-y-2">
        {selectedApprovers.map((approverId) => {
          const user = getUserById(approverId);
          const userName = getUserName(user);
          const userEmail = getUserEmail(user);

          return (
            <div
              key={approverId}
              className="flex items-center justify-between rounded-md border bg-muted/30 p-3"
            >
              <div className="flex items-center gap-3">
                <UserIcon className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{userName}</span>
                  {userEmail && userEmail !== userName && (
                    <span className="text-xs text-muted-foreground">{userEmail}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  Pending
                </Badge>
                {showRemoveButton && onRemoveApprover && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemoveApprover(approverId)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground">
        These team members will be notified when the site diary is submitted for approval.
      </div>
    </div>
  );
}
