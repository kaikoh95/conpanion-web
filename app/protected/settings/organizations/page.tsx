'use client';

import React, { useEffect, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Users, Settings, ExternalLink } from 'lucide-react';
import { DebugOrganizations } from '@/components/DebugOrganizations';
import { DebugWrapper } from '@/utils/debug';
import { organizationAPI } from '@/lib/api/organizations';
import Link from 'next/link';

export default function OrganizationsSettingsPage() {
  const { current, memberships, isLoading, error, switchOrganization } = useOrganization();
  const [memberCounts, setMemberCounts] = useState<Record<number, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Load member counts for all organizations
  useEffect(() => {
    const loadMemberCounts = async () => {
      if (memberships.length === 0) return;

      setLoadingCounts(true);
      const counts: Record<number, number> = {};

      try {
        await Promise.all(
          memberships.map(async (membership) => {
            try {
              const count = await organizationAPI.getOrganizationMemberCount(
                membership.organization_id,
              );
              counts[membership.organization_id] = count;
            } catch (error) {
              console.error(
                `Failed to load member count for org ${membership.organization_id}:`,
                error,
              );
              counts[membership.organization_id] = 0;
            }
          }),
        );

        setMemberCounts(counts);
      } catch (error) {
        console.error('Failed to load member counts:', error);
      } finally {
        setLoadingCounts(false);
      }
    };

    loadMemberCounts();
  }, [memberships]);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading organizations...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Organization Settings</h1>
        <p className="text-muted-foreground">
          Manage your organizations and multi-tenancy settings
        </p>
      </div>

      {/* Organizations Grid */}
      <div>
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5" />
            Your Organizations ({memberships.length})
          </h2>
          <p className="text-sm text-muted-foreground">All organizations you have access to</p>
        </div>

        {memberships.length > 0 ? (
          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...memberships]
              .sort((a, b) => {
                // Current organization first
                if (current?.id === a.organization_id) return -1;
                if (current?.id === b.organization_id) return 1;
                // Then sort alphabetically by organization name
                return a.organization.name.localeCompare(b.organization.name);
              })
              .map((membership) => (
                <Card
                  key={membership.organization_id}
                  className={`group relative transition-all duration-200 hover:shadow-lg ${
                    current?.id === membership.organization_id
                      ? 'border-primary bg-accent/50'
                      : 'hover:border-muted-foreground/20'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {current?.id === membership.organization_id && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {membership.role}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <CardTitle className="text-lg leading-tight">
                        {membership.organization.name}
                      </CardTitle>
                      <p className="font-mono text-sm text-muted-foreground">
                        Slug: {membership.organization.slug}
                      </p>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>
                          {loadingCounts ? (
                            <span className="animate-pulse">Loading...</span>
                          ) : (
                            <>
                              {memberCounts[membership.organization_id] ?? 0}{' '}
                              {memberCounts[membership.organization_id] === 1
                                ? 'member'
                                : 'members'}
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                        <Link
                          href={`/protected/settings/organizations/${membership.organization.slug}`}
                          className="flex-1"
                        >
                          <Button size="sm" variant="outline" className="w-full">
                            <Settings className="mr-1 h-3 w-3" />
                            Settings
                          </Button>
                        </Link>
                        {current?.id !== membership.organization_id && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => switchOrganization(membership.organization_id)}
                            className="w-full sm:w-auto"
                          >
                            Switch
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        ) : (
          <Card className="border-dashed">
            <CardContent className="flex min-h-[200px] items-center justify-center">
              <div className="text-center">
                <Building2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground">No organizations found</p>
                <p className="text-sm text-muted-foreground/60">
                  Contact your administrator to get access to an organization
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debug API Calls */}
      <DebugWrapper>
        <DebugOrganizations />
      </DebugWrapper>

      {/* Raw Data Debug */}
      <DebugWrapper>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Context Debug Information
            </CardTitle>
            <CardDescription>Raw data from Organization Context</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-medium">Current Organization:</h4>
                <pre className="overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(current, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="mb-2 font-medium">Memberships:</h4>
                <pre className="overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify(memberships, null, 2)}
                </pre>
              </div>

              <div>
                <h4 className="mb-2 font-medium">Loading State:</h4>
                <pre className="overflow-auto rounded bg-muted p-3 text-xs">
                  {JSON.stringify({ isLoading, error }, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </DebugWrapper>
    </div>
  );
}
