'use client';

import React, { useState } from 'react';
import { Building2, ChevronDown, Settings, Users, LogOut, Loader2 } from 'lucide-react';
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
import { useOrganization } from '@/contexts/OrganizationContext';
import { useProject } from '@/contexts/ProjectContext';
import { OrganizationSwitcherProps } from '@/lib/types/organization';
import { handlePostSwitchNavigation } from '@/lib/utils/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export function OrganizationSwitcher({ className }: OrganizationSwitcherProps) {
  const { refreshUser } = useAuth();
  const { current, memberships, isLoading, switchOrganization, error } = useOrganization();
  const { memberships: projectMemberships } = useProject();
  const router = useRouter();
  const pathname = usePathname();

  const [isSwitching, setIsSwitching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const handleSwitchOrganization = async (orgId: number) => {
    if (current?.id === orgId) return;

    setIsDropdownOpen(false); // Close dropdown when switching

    try {
      setIsSwitching(true);
      await switchOrganization(orgId);
      await refreshUser();

      // Use smart navigation - stay on current page if accessible, otherwise go to home
      handlePostSwitchNavigation(
        router,
        pathname,
        memberships,
        projectMemberships,
        orgId,
        undefined,
      );
    } catch (err) {
      console.error('Failed to switch organization:', err);
    } finally {
      setIsSwitching(false);
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
            <Building2 className="h-4 w-4" />
            <span>Error loading organizations</span>
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
                <Building2 className="h-4 w-4 flex-shrink-0" />
                <span className="hidden truncate sm:block">
                  {current?.name || 'Select Organization'}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 flex-shrink-0" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="w-80" align="start">
            {/* Current Organization Section */}
            {current && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Current Organization
                </div>
                <DropdownMenuItem className="flex items-center justify-between bg-accent">
                  <div className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{current.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{current.slug}</div>
                    </div>
                  </div>
                  <Badge variant="default" className="ml-2 flex-shrink-0">
                    {memberships.find((m) => m.organization_id === current.id)?.role || 'member'}
                  </Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Other Organizations */}
            {memberships.filter((m) => m.organization_id !== current?.id).length > 0 && (
              <>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  Switch To
                </div>
                {memberships
                  .filter((m) => m.organization_id !== current?.id)
                  .map((membership) => (
                    <DropdownMenuItem
                      key={membership.organization_id}
                      onClick={() => handleSwitchOrganization(membership.organization_id)}
                      className="flex cursor-pointer items-center justify-between"
                      disabled={isSwitching}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Building2 className="h-4 w-4 flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate font-medium">{membership.organization.name}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {membership.organization.slug}
                          </div>
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

            {/* Organization Actions */}
            {current && (
              <>
                <Link href={`/protected/settings/organizations/${current.slug}/members`}>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Users className="h-4 w-4" />
                    <span>Manage Members</span>
                  </DropdownMenuItem>
                </Link>
                <Link href={`/protected/settings/organizations/${current.slug}`}>
                  <DropdownMenuItem
                    className="flex cursor-pointer items-center gap-2"
                    onClick={() => setIsDropdownOpen(false)}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Organization Settings</span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
              </>
            )}

            {/* Leave Organization (if not owner and has other orgs) */}
            {current &&
              memberships.find((m) => m.organization_id === current.id)?.role !== 'owner' &&
              memberships.length > 1 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex cursor-pointer items-center gap-2 text-destructive">
                    <LogOut className="h-4 w-4" />
                    <span>Leave Organization</span>
                  </DropdownMenuItem>
                </>
              )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
