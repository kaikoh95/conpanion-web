'use client';

import React, { useEffect, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FolderOpen, Users, Settings, ExternalLink } from 'lucide-react';
import { DebugWrapper } from '@/utils/debug';
import { projectAPI } from '@/lib/api/projects';
import Link from 'next/link';

export default function ProjectsSettingsPage() {
  const { current, memberships, isLoading, error, switchProject } = useProject();
  const [memberCounts, setMemberCounts] = useState<Record<number, number>>({});
  const [loadingCounts, setLoadingCounts] = useState(false);

  // Load member counts for all projects
  useEffect(() => {
    const loadMemberCounts = async () => {
      if (memberships.length === 0) return;

      setLoadingCounts(true);
      const counts: Record<number, number> = {};

      try {
        await Promise.all(
          memberships.map(async (membership) => {
            try {
              const count = await projectAPI.getProjectMemberCount(membership.project_id);
              counts[membership.project_id] = count;
            } catch (error) {
              console.error(
                `Failed to load member count for project ${membership.project_id}:`,
                error,
              );
              counts[membership.project_id] = 0;
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
            <p>Loading projects...</p>
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
      {/* Header */}
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold">
          <FolderOpen className="h-8 w-8" />
          Project Settings
        </h1>
        <p className="text-muted-foreground">Manage your projects and settings</p>
      </div>

      {/* Projects Grid */}
      <div>
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <FolderOpen className="h-5 w-5" />
            Your Projects ({memberships.length})
          </h2>
          <p className="text-sm text-muted-foreground">
            Projects you are a member of in the current organization
          </p>
        </div>

        {memberships.length > 0 ? (
          <div className="flex flex-col gap-4 sm:grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...memberships]
              .sort((a, b) => {
                // Current project first
                if (current?.id === a.project_id) return -1;
                if (current?.id === b.project_id) return 1;
                // Then sort alphabetically by project name
                return a.project.name.localeCompare(b.project.name);
              })
              .map((membership) => (
                <Card
                  key={membership.project_id}
                  className={`group relative transition-all duration-200 hover:shadow-lg ${
                    current?.id === membership.project_id
                      ? 'border-primary bg-accent/50'
                      : 'hover:border-muted-foreground/20'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        {current?.id === membership.project_id && (
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
                        {membership.project.name}
                      </CardTitle>
                      {membership.project.description && (
                        <p
                          className="text-sm text-muted-foreground"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {membership.project.description}
                        </p>
                      )}
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
                              {memberCounts[membership.project_id] ?? 0}{' '}
                              {memberCounts[membership.project_id] === 1 ? 'member' : 'members'}
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                        <Link
                          href={`/protected/settings/projects/${membership.project_id}`}
                          className="flex-1"
                        >
                          <Button size="sm" variant="outline" className="w-full">
                            <Settings className="mr-1 h-3 w-3" />
                            Settings
                          </Button>
                        </Link>
                        {current?.id !== membership.project_id && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => switchProject(membership.project_id)}
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
                <FolderOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-muted-foreground">No projects found</p>
                <p className="text-sm text-muted-foreground/60">
                  Create a new project or contact your administrator to get access
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Raw Data Debug */}
      <DebugWrapper>
        <Card>
          <CardHeader>
            <CardTitle>Debug: Project Data</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h4 className="font-medium">Current Project:</h4>
                <pre className="mt-2 rounded bg-muted p-2 text-xs">
                  {JSON.stringify(current, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-medium">All Memberships:</h4>
                <pre className="mt-2 rounded bg-muted p-2 text-xs">
                  {JSON.stringify(memberships, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      </DebugWrapper>
    </div>
  );
}
