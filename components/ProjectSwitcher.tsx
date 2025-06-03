'use client';

import React, { useState } from 'react';
import { FolderOpen, ChevronDown, Settings, Users, Plus, LogOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useProject } from '@/contexts/ProjectContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { ProjectSwitcherProps } from '@/lib/types/project';
import { handlePostSwitchNavigation } from '@/lib/utils/navigation';
import Link from 'next/link';

export function ProjectSwitcher({ className }: ProjectSwitcherProps) {
  const { current, memberships, isLoading, switchProject, createProject, error } = useProject();
  const { current: currentOrganization, memberships: organizationMemberships } = useOrganization();
  const router = useRouter();
  const pathname = usePathname();

  const [isSwitching, setIsSwitching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const handleSwitchProject = async (projectId: number) => {
    if (current?.id === projectId) return;

    setIsDropdownOpen(false); // Close dropdown when switching

    try {
      setIsSwitching(true);
      await switchProject(projectId);

      // Use smart navigation - stay on current page if accessible, otherwise go to home
      handlePostSwitchNavigation(
        router,
        pathname,
        organizationMemberships,
        memberships,
        currentOrganization?.id,
        projectId,
      );
    } catch (err) {
      console.error('Failed to switch project:', err);
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCreateProject = async () => {
    if (!currentOrganization) {
      console.error('No organization selected');
      return;
    }

    setIsDropdownOpen(false);

    try {
      setIsCreatingProject(true);
      const newProject = await createProject({
        name: `New Project ${Date.now()}`,
        description: 'A new project for the team',
        organization_id: currentOrganization.id,
      });

      // Always navigate to the newly created project's settings page
      router.push(`/protected/settings/projects/${newProject.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
    } finally {
      setIsCreatingProject(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      case 'guest':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className={className}>
        <Button variant="outline" className="w-full justify-between" disabled>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="hidden sm:inline">Loading...</span>
          </div>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className}>
        <Button
          variant="outline"
          className="w-full justify-between border-destructive text-destructive"
          disabled
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            <span>Error loading projects</span>
          </div>
        </Button>
      </div>
    );
  }

  // Show only create project button if no projects
  if (memberships.length === 0) {
    return (
      <div className={className}>
        <Button
          variant="outline"
          className="w-full justify-between"
          onClick={handleCreateProject}
          disabled={isCreatingProject || !currentOrganization}
        >
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            <span>{isCreatingProject ? 'Creating...' : 'Create Project'}</span>
          </div>
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between" disabled={isSwitching}>
              <div className="flex min-w-0 items-center gap-2">
                <FolderOpen className="h-4 w-4 flex-shrink-0" />
                <span className="hidden truncate sm:block">
                  {current?.name || 'Select Project'}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-80" align="start">
            {/* Current Project Section */}
            {current && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Current Project
                </div>
                <DropdownMenuItem className="flex items-center justify-between bg-accent">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderOpen className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{current.name}</div>
                      {current.description && (
                        <div className="truncate text-xs text-muted-foreground">
                          {current.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <Badge variant="default" className="ml-2 flex-shrink-0">
                    {memberships.find((m) => m.project_id === current.id)?.role || 'member'}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Other Projects */}
            {memberships.filter((m) => m.project_id !== current?.id).length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Switch To
                </div>
                {memberships
                  .filter((m) => m.project_id !== current?.id)
                  .map((membership) => (
                    <DropdownMenuItem
                      key={membership.project_id}
                      onClick={() => handleSwitchProject(membership.project_id)}
                      className="flex cursor-pointer items-center justify-between"
                      disabled={isSwitching}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FolderOpen className="h-4 w-4 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{membership.project.name}</div>
                          {membership.project.description && (
                            <div className="truncate text-xs text-muted-foreground">
                              {membership.project.description}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={getRoleBadgeVariant(membership.role)}
                        className="ml-2 flex-shrink-0"
                      >
                        {membership.role}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuSeparator />
              </>
            )}

            {/* Create New Project */}
            <DropdownMenuItem
              onClick={handleCreateProject}
              className="flex cursor-pointer items-center gap-2"
              disabled={isCreatingProject || !currentOrganization}
            >
              <Plus className="h-4 w-4" />
              <span>{isCreatingProject ? 'Creating...' : 'Create New Project'}</span>
            </DropdownMenuItem>

            {/* Project Actions */}
            {current && (
              <>
                <DropdownMenuSeparator />
                <Link href={`/protected/settings/projects/${current.id}/members`}>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Users className="h-4 w-4" />
                    <span>Manage Members</span>
                  </DropdownMenuItem>
                </Link>
                <Link href={`/protected/settings/projects/${current.id}`}>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Project Settings</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Leave Project (if not owner and has other projects) */}
            {current &&
              memberships.find((m) => m.project_id === current.id)?.role !== 'owner' &&
              memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex cursor-pointer items-center gap-2 text-destructive">
                    <LogOut className="h-4 w-4" />
                    <span>Leave Project</span>
                  </DropdownMenuItem>
                </>
              )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
