'use client';

import { Database } from '@/lib/supabase/types.generated';

// Base project type from database
export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];

// Project membership type from database
export type ProjectMembership = Database['public']['Tables']['projects_users']['Row'] & {
  project: Project;
};

// Extended project member type with user details (from database function)
export interface ProjectMember {
  id: number;
  project_id: number;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  invited_at?: string;
  invited_by?: string;
  left_at?: string;
  updated_at?: string;
  email?: string;
  user_email: string;
  user_name: string;
  user_avatar_url?: string;
}

// API request types
export interface CreateProjectRequest {
  name: string;
  description?: string;
  organization_id: number;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
}

export interface UpdateProjectMembershipRequest {
  role?: string;
}

// User project data from API
export interface UserProjectsResult {
  project_id: number;
  project_name: string;
  project_description: string | null;
  user_role: string;
  joined_at: string;
  is_current?: boolean;
}

// Project roles
export type ProjectRole = 'owner' | 'admin' | 'member' | 'guest';

// Context and state types
export interface ProjectContext {
  current: Project | null;
  memberships: ProjectMembership[];
  isLoading: boolean;
  error: string | null;

  // Actions
  switchProject: (projectId: number) => Promise<void>;
  createProject: (data: CreateProjectRequest) => Promise<Project>;
  updateProject: (projectId: number, data: UpdateProjectRequest) => Promise<void>;
  deleteProject: (projectId: number) => Promise<void>;

  // Member management
  updateMembership: (membershipId: number, data: UpdateProjectMembershipRequest) => Promise<void>;
  removeMember: (membershipId: number) => Promise<void>;

  // Data refresh
  refresh: () => Promise<void>;
  loadFullProjectDetails: (projectId: number) => Promise<Project | null>;
}

// Permission helpers
export interface ProjectPermissions {
  canManageMembers: boolean;
  canManageSettings: boolean;
  canDeleteProject: boolean;
  canCreateTasks: boolean;
}

// Component props types
export interface ProjectSwitcherProps {
  className?: string;
}
