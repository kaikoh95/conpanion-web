'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/contexts/OrganizationContext';
import { projectAPI } from '@/lib/api/projects';
import {
  Project,
  ProjectMembership,
  ProjectContext as ProjectContextType,
  CreateProjectRequest,
  UpdateProjectMembershipRequest,
  UpdateProjectRequest,
  UserProjectsResult,
} from '@/lib/types/project';

const ProjectContext = createContext<ProjectContextType | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const { user, refreshUser } = useAuth();
  const { current: currentOrganization } = useOrganization();
  const [current, setCurrent] = useState<Project | null>(null);
  const [memberships, setMemberships] = useState<ProjectMembership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleError = useCallback((err: any) => {
    console.error('Project error:', err);
    setError(err.message || 'An error occurred');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const loadProjects = useCallback(async () => {
    if (!user || !currentOrganization) {
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      clearError();

      // Load user's projects within the current organization
      const userProjects = await projectAPI.getUserProjects();

      // Convert to membership format with proper type safety
      const membershipsData: ProjectMembership[] = await Promise.all(
        userProjects.map(async (proj) => {
          // Get the user's actual membership record for this project
          const membershipDetails = await projectAPI.getUserMembership(proj.project_id);

          if (membershipDetails) {
            // Use the real membership data from the database
            return membershipDetails;
          } else {
            return {} as ProjectMembership;
          }
        }),
      );

      setMemberships(membershipsData);

      // Get user's current project context from database
      try {
        const projectContext = await projectAPI.getUserProjectContext();

        if (projectContext?.current_project_id) {
          // Use the database-stored current project if available
          const currentProject = membershipsData.find(
            (m) => m.project_id === projectContext.current_project_id,
          )?.project;
          if (currentProject) {
            setCurrent(currentProject);
          } else {
            // Fallback: use first project if stored current project is no longer accessible
            setCurrent(membershipsData.length > 0 ? membershipsData[0].project : null);
          }
        } else if (projectContext?.default_project_id) {
          // Use default project if no current project is set
          const defaultProject = membershipsData.find(
            (m) => m.project_id === projectContext.default_project_id,
          )?.project;
          if (defaultProject) {
            setCurrent(defaultProject);
            // Also set it as current project
            await projectAPI.switchProject(defaultProject.id);
          } else {
            setCurrent(membershipsData.length > 0 ? membershipsData[0].project : null);
          }
        } else if (membershipsData.length > 0) {
          // No project context found, use first project and set it as current
          setCurrent(membershipsData[0].project);
          await projectAPI.switchProject(membershipsData[0].project.id);
        }
      } catch (contextError) {
        console.warn('Failed to load project context, using fallback:', contextError);
        // Fallback to first project if context loading fails
        if (membershipsData.length > 0) {
          setCurrent(membershipsData[0].project);
        }
      }
    } catch (err) {
      handleError(err);
    } finally {
      setIsLoading(false);
    }
  }, [user, currentOrganization, handleError, clearError]);

  const switchProject = useCallback(
    async (projectId: number) => {
      try {
        clearError();

        // Update current project immediately for better UX
        const newCurrent = memberships.find((m) => m.project_id === projectId)?.project;
        if (newCurrent) {
          setCurrent(newCurrent);
        }

        // Call API to switch project in backend
        await projectAPI.switchProject(projectId);

        // Add a small delay to ensure database transaction is committed
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Refresh user to get updated activeProjectId
        await refreshUser();

        // Note: We don't reload projects here to avoid overriding the current selection
        // The current project has already been set above
      } catch (err) {
        handleError(err);
        // If there was an error, reload to ensure consistent state
        await loadProjects();
      }
    },
    [memberships, loadProjects, handleError, clearError, refreshUser],
  );

  const createProject = useCallback(
    async (data: CreateProjectRequest): Promise<Project> => {
      try {
        clearError();
        setIsLoading(true);

        // Ensure the project is created in the current organization
        const projectData = {
          ...data,
          organization_id: currentOrganization?.id || data.organization_id,
        };

        const newProject = await projectAPI.createProject(projectData);

        // Reload projects to include the new one
        await loadProjects();

        return newProject;
      } catch (err) {
        handleError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [currentOrganization, loadProjects, handleError, clearError],
  );

  const updateProject = useCallback(
    async (projectId: number, data: UpdateProjectRequest) => {
      try {
        clearError();

        await projectAPI.updateProject(projectId, data);

        // Update local state immediately for better UX
        if (current && current.id === projectId) {
          setCurrent({ ...current, ...data, updated_at: new Date().toISOString() });
        }

        // Update memberships array
        setMemberships((prev) =>
          prev.map((membership) =>
            membership.project_id === projectId
              ? {
                  ...membership,
                  project: {
                    ...membership.project,
                    ...data,
                    updated_at: new Date().toISOString(),
                  },
                }
              : membership,
          ),
        );

        // Optionally reload to ensure consistency (can be disabled for performance)
        // await loadProjects();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [current, handleError, clearError],
  );

  const deleteProject = useCallback(
    async (projectId: number) => {
      try {
        clearError();

        await projectAPI.deleteProject(projectId);

        // Remove from local state
        setMemberships((prev) => prev.filter((m) => m.project_id !== projectId));

        // If this was the current project, switch to another one
        if (current && current.id === projectId) {
          const remaining = memberships.filter((m) => m.project_id !== projectId);
          if (remaining.length > 0) {
            await switchProject(remaining[0].project_id);
          } else {
            setCurrent(null);
          }
        }
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [current, memberships, switchProject, handleError, clearError],
  );

  const updateMembership = useCallback(
    async (membershipId: number, data: UpdateProjectMembershipRequest) => {
      try {
        clearError();

        await projectAPI.updateMembership(membershipId, data);

        // Reload to get fresh data
        await loadProjects();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [loadProjects, handleError, clearError],
  );

  const removeMember = useCallback(
    async (membershipId: number) => {
      try {
        clearError();

        await projectAPI.removeMember(membershipId);

        // Reload to get fresh data
        await loadProjects();
      } catch (err) {
        handleError(err);
        throw err;
      }
    },
    [loadProjects, handleError, clearError],
  );

  const refresh = useCallback(async () => {
    await loadProjects();
  }, [loadProjects]);

  const loadFullProjectDetails = useCallback(
    async (projectId: number): Promise<Project | null> => {
      try {
        const projectDetails = await projectAPI.getProject(projectId);

        if (projectDetails) {
          // Update the project in current state if it matches
          if (current && current.id === projectId) {
            setCurrent({
              ...projectDetails,
            });
          }

          // Update the project in memberships array
          setMemberships((prev) =>
            prev.map((membership) =>
              membership.project_id === projectId
                ? {
                    ...membership,
                    project: {
                      ...projectDetails,
                    },
                  }
                : membership,
            ),
          );

          return projectDetails;
        }

        return null;
      } catch (err) {
        console.error('Failed to load project details:', err);
        return null;
      }
    },
    [current],
  );

  // Load projects when user or organization changes
  useEffect(() => {
    if (user && currentOrganization) {
      loadProjects();
    } else {
      setCurrent(null);
      setMemberships([]);
      setIsLoading(false);
    }
  }, [user, currentOrganization, loadProjects]);

  const value: ProjectContextType = {
    current,
    memberships,
    isLoading,
    error,
    switchProject,
    createProject,
    updateProject,
    deleteProject,
    updateMembership,
    removeMember,
    refresh,
    loadFullProjectDetails,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}
