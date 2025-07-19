'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useProject } from '@/contexts/ProjectContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/app/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Users } from 'lucide-react';

interface ProjectMember {
  id: string;
  user_name: string;
  user_email: string;
  user_avatar_url?: string;
  role: 'owner' | 'admin' | 'member';
}

interface UserFilterProps {
  selectedUserId?: string;
  onUserChange: (userId?: string) => void;
  searchTerm?: string;
  onSearchChange: (searchTerm: string) => void;
}

export function UserFilter({
  selectedUserId,
  onUserChange,
  searchTerm,
  onSearchChange,
}: UserFilterProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { current: currentProject } = useProject();

  useEffect(() => {
    const loadProjectMembers = async () => {
      if (!currentProject?.id) {
        setMembers([]);
        return;
      }

      setLoading(true);
      try {
        const supabase = createClient();

        // Get current user ID
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUserId(user?.id || null);

        const { data: projectMembers, error } = await supabase.rpc('get_project_members', {
          p_project_id: currentProject.id,
        });

        if (error) {
          console.error('Error loading project members:', error);
          return;
        }

        if (projectMembers) {
          const formattedMembers: ProjectMember[] = projectMembers.map((member: any) => ({
            id: member.user_id,
            user_name: member.user_name || member.user_email || 'Unknown User',
            user_email: member.user_email,
            user_avatar_url: member.user_avatar_url,
            role: member.role,
          }));

          // Sort with current user first, then by role hierarchy, then by name
          formattedMembers.sort((a, b) => {
            // Put current user first
            if (a.id === user?.id) return -1;
            if (b.id === user?.id) return 1;

            // Then sort by role hierarchy
            const roleOrder = { owner: 1, admin: 2, member: 3 };
            const aOrder = roleOrder[a.role] || 4;
            const bOrder = roleOrder[b.role] || 4;

            if (aOrder !== bOrder) return aOrder - bOrder;
            return a.user_name.localeCompare(b.user_name);
          });

          setMembers(formattedMembers);
        }
      } catch (error) {
        console.error('Error loading project members:', error);
      } finally {
        setLoading(false);
      }
    };

    loadProjectMembers();
  }, [currentProject?.id]);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'ring-2 ring-yellow-400 ring-offset-1';
      case 'admin':
        return 'ring-2 ring-blue-400 ring-offset-1';
      case 'member':
        return 'ring-2 ring-green-400 ring-offset-1';
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
      {/* Search Bar */}
      <div className="w-full lg:max-w-[30%]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            placeholder="Search tasks, forms, entries..."
            value={searchTerm || ''}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10"
          />
        </div>
      </div>

      {/* Member Filter */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Filter by team member:</span>

        {loading ? (
          <div className="flex gap-2">
            {/* All button skeleton */}
            <div className="flex flex-col items-center gap-1">
              <div className="h-8 w-12 animate-pulse rounded-md bg-muted" />
              <div className="h-3 w-6 animate-pulse rounded bg-muted" />
            </div>
            {/* User avatar skeletons */}
            {[...Array(4)].map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-8 animate-pulse rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {/* All Members Option */}
            <div className="flex flex-col items-center gap-1">
              <Button
                variant={!selectedUserId ? 'default' : 'outline'}
                size="sm"
                onClick={() => onUserChange(undefined)}
                className="h-8 gap-2 px-3"
                title="Show all team members"
              >
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">All</span>
              </Button>
            </div>

            {/* Individual Members */}
            {members.map((member) => {
              const isCurrentUser = member.id === currentUserId;
              const displayName = isCurrentUser ? 'You' : member.user_name;
              const displayInitials = isCurrentUser
                ? 'You'
                : member.user_name
                    .split(' ')
                    .map((name) => name.charAt(0))
                    .join('')
                    .toUpperCase()
                    .slice(0, 2);

              return (
                <div key={member.id} className="flex flex-col items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onUserChange(member.id)}
                    className={`h-8 w-8 rounded-full p-0 transition-transform hover:scale-110 ${
                      selectedUserId === member.id ? getRoleBadgeColor(member.role) : ''
                    }`}
                    title={`${displayName} (${member.role}) - ${member.user_email}`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.user_avatar_url} />
                      <AvatarFallback className="text-xs">
                        {member.user_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                  <span className="text-center text-xs leading-none text-muted-foreground">
                    {displayInitials}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
