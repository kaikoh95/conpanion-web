import { ProjectMembership } from '@/lib/types/project';
import { OrganizationMembership } from '@/lib/types/organization';

/**
 * Determines if a route is accessible given the current context
 * Returns true if the user should stay on the current page, false if they should be redirected
 */
export function isRouteAccessible(
  pathname: string,
  organizationMemberships: OrganizationMembership[],
  projectMemberships: ProjectMembership[],
  currentOrganizationId?: number,
  currentProjectId?: number,
): boolean {
  // Always allow access to home and general pages
  if (
    pathname === '/protected' ||
    pathname === '/protected/dashboard' ||
    pathname.startsWith('/protected/profile') ||
    pathname === '/protected/settings'
  ) {
    return true;
  }

  // Check organization-specific routes
  if (pathname.includes('/protected/settings/organizations/')) {
    const orgSlugMatch = pathname.match(/\/protected\/settings\/organizations\/([^\/]+)/);
    if (orgSlugMatch) {
      const orgSlug = orgSlugMatch[1];
      // Check if user has access to this organization
      const hasOrgAccess = organizationMemberships.some(
        (membership) => membership.organization.slug === orgSlug,
      );
      return hasOrgAccess;
    }
  }

  // Check project-specific routes
  if (pathname.includes('/protected/settings/projects/')) {
    const projectIdMatch = pathname.match(/\/protected\/settings\/projects\/(\d+)/);
    if (projectIdMatch) {
      const projectId = parseInt(projectIdMatch[1]);
      // Check if user has access to this project in current organization
      const hasProjectAccess = projectMemberships.some(
        (membership) => membership.project_id === projectId,
      );
      return hasProjectAccess;
    }
  }

  // Check general organization routes
  if (pathname.startsWith('/protected/settings/organizations')) {
    return organizationMemberships.length > 0;
  }

  // Check general project routes
  if (pathname.startsWith('/protected/settings/projects')) {
    return projectMemberships.length > 0;
  }

  // For any other protected routes, assume accessible if user has any organization
  if (pathname.startsWith('/protected/')) {
    return organizationMemberships.length > 0;
  }

  // Default to accessible for non-protected routes
  return true;
}

/**
 * Gets the appropriate redirect URL when current route is not accessible
 */
export function getRedirectUrl(
  pathname: string,
  organizationMemberships: OrganizationMembership[],
  projectMemberships: ProjectMembership[],
): string {
  // Always redirect to home as the safe fallback
  return '/protected';
}

/**
 * Handles smart navigation after context switching
 * Stays on current page if accessible, otherwise redirects to home
 * Uses a small delay to allow context providers to update
 */
export function handlePostSwitchNavigation(
  router: any,
  pathname: string,
  organizationMemberships: OrganizationMembership[],
  projectMemberships: ProjectMembership[],
  currentOrganizationId?: number,
  currentProjectId?: number,
): void {
  // Use a small timeout to allow context providers to update after switching
  setTimeout(() => {
    const isAccessible = isRouteAccessible(
      pathname,
      organizationMemberships,
      projectMemberships,
      currentOrganizationId,
      currentProjectId,
    );

    if (!isAccessible) {
      const redirectUrl = getRedirectUrl(pathname, organizationMemberships, projectMemberships);
      router.push(redirectUrl);
    }

    if (pathname.includes('/protected/settings/projects/')) {
      router.push(`/protected/settings/projects/${currentProjectId}`);
    }

    if (pathname.includes('/protected/settings/organizations/')) {
      router.push(`/protected/settings/organizations/${currentOrganizationId}`);
    }

    // If accessible, do nothing - stay on current page
  }, 100);
}
