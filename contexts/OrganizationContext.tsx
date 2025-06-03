'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { organizationAPI } from '@/lib/api/organizations';
import {
  Organization,
  OrganizationMembership,
  OrganizationContext as OrganizationContextType,
  CreateOrganizationRequest,
  UpdateMembershipRequest,
  UpdateOrganizationRequest,
  UserOrganizationsResult,
  OrganizationRole,
  OrganizationStatus,
} from '@/lib/types/organization';

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState<Organization | null>(null);
  const [memberships, setMemberships] = useState<OrganizationMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: any) => {
    console.error('Organization error:', err);
    setError(err.message || 'An error occurred');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadOrganizations = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      clearError();

      // Load user's organizations
      const userOrgs = await organizationAPI.getUserOrganizations();

      // Convert to membership format with proper type safety
      const membershipsData: OrganizationMembership[] = await Promise.all(
        userOrgs.map(async (org) => {
          // Get the user's actual membership record for this organization
          const membershipDetails = await organizationAPI.getUserMembership(org.organization_id);

          if (membershipDetails) {
            // Use the real membership data from the database
            return membershipDetails;
          } else {
            return {} as OrganizationMembership;
          }
        }),
      );

      setMemberships(membershipsData);

      // Set current organization
      const currentOrg = userOrgs.find((org) => org.is_current);
      if (currentOrg) {
        setCurrent(
          membershipsData.find((m) => m.organization_id === currentOrg.organization_id)
            ?.organization || null,
        );
      } else if (membershipsData.length > 0) {
        // If no current org is set, use the first one
        setCurrent(membershipsData[0].organization);
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [user, handleError, clearError]);

  const switchOrganization = useCallback(
    async (orgId: number) => {
      try {
        clearError();
        setIsLoading(true);

        await organizationAPI.switchOrganization(orgId);

        // Update current organization
        const newCurrent = memberships.find((m) => m.organization_id === orgId)?.organization;
        if (newCurrent) {
          setCurrent(newCurrent);
        }

        // Reload to get fresh data
        await loadOrganizations();
      } catch (err) {
        handleError(err);
      } finally {
        setIsLoading(false);
      }
    },
    [memberships, loadOrganizations, handleError, clearError],
  );

  const createOrganization = useCallback(
    async (data: CreateOrganizationRequest): Promise<Organization> => {
      try {
        clearError();
        setIsLoading(true);

        const newOrg = await organizationAPI.createOrganization(data);

        // Reload organizations to include the new one
        await loadOrganizations();

        return newOrg;
      } catch (err) {
        handleError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadOrganizations, handleError, clearError],
  );

  const updateOrganization = useCallback(
    async (orgId: number, data: UpdateOrganizationRequest) => {
      try {
        clearError();

        await organizationAPI.updateOrganization(orgId, data);

        // Update local state immediately for better UX
        if (current && current.id === orgId) {
          setCurrent({ ...current, ...data, updated_at: new Date().toISOString() });
        }

        // Update memberships array
        setMemberships((prev) =>
          prev.map((membership) =>
            membership.organization_id === orgId
              ? {
                  ...membership,
                  organization: {
                    ...membership.organization,
                    ...data,
                    updated_at: new Date().toISOString(),
                  },
                }
              : membership,
          ),
        );

        // Optionally reload to ensure consistency (can be disabled for performance)
        // await loadOrganizations();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [current, handleError, clearError],
  );

  const deleteOrganization = useCallback(
    async (orgId: number) => {
      try {
        clearError();

        await organizationAPI.deleteOrganization(orgId);

        // Remove from local state
        setMemberships((prev) => prev.filter((m) => m.organization_id !== orgId));

        // If this was the current org, switch to another one
        if (current && current.id === orgId) {
          const remaining = memberships.filter((m) => m.organization_id !== orgId);
          if (remaining.length > 0) {
            await switchOrganization(remaining[0].organization_id);
          } else {
            setCurrent(null);
          }
        }
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [current, memberships, switchOrganization, handleError, clearError],
  );

  const updateMembership = useCallback(
    async (membershipId: number, data: UpdateMembershipRequest) => {
      try {
        clearError();

        await organizationAPI.updateMembership(membershipId, data);

        // Reload to get fresh data
        await loadOrganizations();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [loadOrganizations, handleError, clearError],
  );

  const removeMember = useCallback(
    async (membershipId: number) => {
      try {
        clearError();

        await organizationAPI.removeMember(membershipId);

        // Reload to get fresh data
        await loadOrganizations();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [loadOrganizations, handleError, clearError],
  );

  const refresh = useCallback(async () => {
    await loadOrganizations();
  }, [loadOrganizations]);

  const loadFullOrganizationDetails = useCallback(
    async (orgId: number): Promise<Organization | null> => {
      try {
        const orgDetails = await organizationAPI.getOrganization(orgId);

        if (orgDetails) {
          // Update the organization in current state if it matches
          if (current && current.id === orgId) {
            setCurrent({
              id: orgDetails.id,
              name: orgDetails.name,
              slug: orgDetails.slug,
              description: orgDetails.description,
              created_at: orgDetails.created_at,
              updated_at: orgDetails.updated_at,
              created_by: orgDetails.created_by,
              is_active: orgDetails.is_active,
            });
          }

          // Update the organization in memberships array
          setMemberships((prev) =>
            prev.map((membership) =>
              membership.organization_id === orgId
                ? {
                    ...membership,
                    organization: {
                      id: orgDetails.id,
                      name: orgDetails.name,
                      slug: orgDetails.slug,
                      description: orgDetails.description,
                      created_at: orgDetails.created_at,
                      updated_at: orgDetails.updated_at,
                      created_by: orgDetails.created_by,
                      is_active: orgDetails.is_active,
                    },
                  }
                : membership,
            ),
          );

          return {
            id: orgDetails.id,
            name: orgDetails.name,
            slug: orgDetails.slug,
            description: orgDetails.description,
            created_at: orgDetails.created_at,
            updated_at: orgDetails.updated_at,
            created_by: orgDetails.created_by,
            is_active: orgDetails.is_active,
          };
        }

        return null;
      } catch (err) {
        console.error('Failed to load organization details:', err);
        return null;
      }
    },
    [current],
  );

  // Load organizations when user changes
  useEffect(() => {
    if (user) {
      loadOrganizations();
    } else {
      setCurrent(null);
      setMemberships([]);
      setIsLoading(false);
    }
  }, [user, loadOrganizations]);

  const value: OrganizationContextType = {
    current,
    memberships,
    isLoading,
    error,
    switchOrganization,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    updateMembership,
    removeMember,
    refresh,
    loadFullOrganizationDetails,
  };

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
