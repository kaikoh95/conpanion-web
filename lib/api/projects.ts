'use client';

import { createClient } from '@/utils/supabase/client';
import {
  Project,
  ProjectMembership,
  ProjectMember,
  CreateProjectRequest,
  UpdateProjectRequest,
  UpdateProjectMembershipRequest,
  UserProjectsResult,
} from '@/lib/types/project';

export class ProjectAPI {
  private supabase = createClient();

  /**
   * Get all projects for the current user within their current organization
   */
  async getUserProjects(): Promise<UserProjectsResult[]> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's current organization
      const { data: userProfile } = await this.supabase
        .from('user_profiles')
        .select('current_organization_id')
        .eq('id', user.id)
        .single();

      if (!userProfile?.current_organization_id) {
        throw new Error('No current organization found');
      }

      // Get projects in the current organization that the user has access to
      const { data: projectMemberships, error } = await this.supabase
        .from('projects_users')
        .select(
          `
          project_id,
          role,
          created_at,
          projects!inner (
            id,
            name,
            description,
            organization_id
          )
        `,
        )
        .eq('user_id', user.id)
        .eq('projects.organization_id', userProfile.current_organization_id)
        .eq('status', 'active');

      if (error) {
        throw new Error(`Failed to fetch user projects: ${error.message}`);
      }

      // Transform the data to match the expected format
      return (projectMemberships || []).map((membership: any) => ({
        project_id: membership.project_id,
        project_name: membership.projects.name,
        project_description: membership.projects.description,
        user_role: membership.role,
        joined_at: membership.created_at,
        is_current: false, // We'll determine current project later
      }));
    } catch (error: any) {
      console.error('Error in getUserProjects:', error);
      throw error;
    }
  }

  /**
   * Get a specific project by ID
   */
  async getProject(projectId: number): Promise<Project | null> {
    try {
      const { data: project, error } = await this.supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single();

      if (error) {
        throw new Error(`Failed to fetch project: ${error.message}`);
      }

      return project;
    } catch (error: any) {
      console.error('Error in getProject:', error);
      throw error;
    }
  }

  /**
   * Get user's membership details for a specific project
   */
  async getUserMembership(projectId: number): Promise<ProjectMembership | null> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data: membership, error } = await this.supabase
        .from('projects_users')
        .select(
          `
          *,
          project:projects (*)
        `,
        )
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No membership found
          return null;
        }
        throw new Error(`Failed to fetch membership: ${error.message}`);
      }

      return membership as ProjectMembership;
    } catch (error: any) {
      console.error('Error in getUserMembership:', error);
      throw error;
    }
  }

  /**
   * Switch to a different project (update user's active project)
   */
  async switchProject(projectId: number): Promise<void> {
    try {
      const { data: result, error } = await this.supabase.rpc('set_user_current_project', {
        p_project_id: projectId,
      });

      if (error) {
        throw new Error(`Failed to switch project: ${error.message}`);
      }

      if (!result) {
        throw new Error('Failed to switch project - you may not have access to this project');
      }
    } catch (error: any) {
      console.error('Error in switchProject:', error);
      throw error;
    }
  }

  /**
   * Get user's current project context
   */
  async getUserProjectContext(): Promise<any> {
    try {
      const { data: context, error } = await this.supabase.rpc('get_user_project_context');

      if (error) {
        throw new Error(`Failed to get project context: ${error.message}`);
      }

      return context?.[0] || null;
    } catch (error: any) {
      console.error('Error in getUserProjectContext:', error);
      throw error;
    }
  }

  /**
   * Set user's default project
   */
  async setDefaultProject(projectId: number): Promise<void> {
    try {
      const { data: result, error } = await this.supabase.rpc('set_user_default_project', {
        p_project_id: projectId,
      });

      if (error) {
        throw new Error(`Failed to set default project: ${error.message}`);
      }

      if (!result) {
        throw new Error('Failed to set default project - you may not have access to this project');
      }
    } catch (error: any) {
      console.error('Error in setDefaultProject:', error);
      throw error;
    }
  }

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectRequest): Promise<Project> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create the project
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .insert({
          name: data.name,
          description: data.description,
          organization_id: data.organization_id,
          owner_id: user.id,
          created_by: user.id,
        })
        .select()
        .single();

      if (projectError) {
        throw new Error(`Failed to create project: ${projectError.message}`);
      }

      // Add the creator as an owner member
      const { error: membershipError } = await this.supabase.from('projects_users').insert({
        project_id: project.id,
        user_id: user.id,
        role: 'owner',
        status: 'active',
        created_by: user.id,
      });

      if (membershipError) {
        // Try to clean up the project if membership creation fails
        await this.supabase.from('projects').delete().eq('id', project.id);
        throw new Error(`Failed to create project membership: ${membershipError.message}`);
      }

      return project;
    } catch (error: any) {
      console.error('Error in createProject:', error);
      throw error;
    }
  }

  /**
   * Update a project
   */
  async updateProject(projectId: number, data: UpdateProjectRequest): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('projects')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      if (error) {
        throw new Error(`Failed to update project: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in updateProject:', error);
      throw error;
    }
  }

  /**
   * Delete a project
   */
  async deleteProject(projectId: number): Promise<void> {
    try {
      const { error } = await this.supabase.from('projects').delete().eq('id', projectId);

      if (error) {
        throw new Error(`Failed to delete project: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in deleteProject:', error);
      throw error;
    }
  }

  /**
   * Update a project membership
   */
  async updateMembership(
    membershipId: number,
    data: UpdateProjectMembershipRequest,
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('projects_users')
        .update(data)
        .eq('id', membershipId);

      if (error) {
        throw new Error(`Failed to update membership: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in updateMembership:', error);
      throw error;
    }
  }

  /**
   * Remove a member from a project
   */
  async removeMember(membershipId: number): Promise<void> {
    try {
      const { data: result, error } = await this.supabase.rpc('remove_project_member', {
        p_membership_id: membershipId,
      });

      if (error) {
        console.error('Remove project member error:', error);
        throw error;
      }

      // Check the result from the function
      if (!result || !result.success) {
        const errorMessage = result?.error || 'Failed to remove member';
        const errorCode = result?.error_code || 'UNKNOWN_ERROR';

        console.error('Remove project member failed:', errorMessage, errorCode);

        // Throw a more specific error based on the error code
        switch (errorCode) {
          case 'MEMBERSHIP_NOT_FOUND':
            throw new Error('Membership not found');
          case 'PERMISSION_DENIED':
            throw new Error('You do not have permission to remove this member');
          case 'LAST_OWNER':
            throw new Error('Cannot remove the last owner of a project');
          case 'ADMIN_CANNOT_REMOVE_OWNER':
            throw new Error('Admins cannot remove project owners');
          default:
            throw new Error(errorMessage);
        }
      }
    } catch (error: any) {
      console.error('Error in removeMember:', error);
      throw error;
    }
  }

  /**
   * Get project member count only
   */
  async getProjectMemberCount(projectId: number): Promise<number> {
    try {
      const { count } = await this.supabase
        .from('projects_users')
        .select('*', { count: 'exact' })
        .eq('project_id', projectId)
        .eq('status', 'active');

      return count || 0;
    } catch (error: any) {
      console.error('Error in getProjectMemberCount:', error);
      throw error;
    }
  }

  /**
   * Get all members of a project
   */
  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    try {
      const { data: members, error } = await this.supabase.rpc('get_project_members', {
        p_project_id: projectId,
      });

      if (error) {
        throw new Error(`Failed to fetch project members: ${error.message}`);
      }

      return members || [];
    } catch (error: any) {
      console.error('Error in getProjectMembers:', error);
      throw error;
    }
  }

  /**
   * Invite user to project by email
   */
  async inviteUserToProject(
    projectId: number,
    userEmail: string,
    role: string = 'member',
  ): Promise<ProjectMember> {
    try {
      // First find the user by email
      const { data: users, error: userError } = await this.supabase
        .from('auth.users')
        .select('id')
        .eq('email', userEmail)
        .limit(1);

      if (userError) {
        throw new Error(`Failed to find user: ${userError.message}`);
      }

      if (!users || users.length === 0) {
        throw new Error('User not found with that email address');
      }

      const userId = users[0].id;

      // Invite the user to the project
      const { data: result, error } = await this.supabase.rpc('invite_user_to_project', {
        p_project_id: projectId,
        p_user_id: userId,
        p_role: role,
      });

      if (error) {
        throw new Error(`Failed to invite user: ${error.message}`);
      }

      if (!result || !result.success) {
        const errorMessage = result?.error || 'Failed to invite user';
        throw new Error(errorMessage);
      }

      // Get the updated member list to return the new member
      const members = await this.getProjectMembers(projectId);
      const newMember = members.find((m) => m.user_id === userId);

      if (!newMember) {
        throw new Error('Failed to retrieve invited member details');
      }

      return newMember;
    } catch (error: any) {
      console.error('Error in inviteUserToProject:', error);
      throw error;
    }
  }

  /**
   * Update project member role
   */
  async updateMemberRole(membershipId: number, newRole: string): Promise<void> {
    try {
      const { data: result, error } = await this.supabase.rpc('update_project_member_role', {
        p_membership_id: membershipId,
        p_new_role: newRole,
      });

      if (error) {
        throw new Error(`Failed to update member role: ${error.message}`);
      }

      if (!result || !result.success) {
        const errorMessage = result?.error || 'Failed to update member role';
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error('Error in updateMemberRole:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const projectAPI = new ProjectAPI();
