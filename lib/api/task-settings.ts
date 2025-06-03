'use client';

import { createClient } from '@/utils/supabase/client';
import { Database } from '@/lib/supabase/types.generated';

// Types from database
export type TaskStatus = Database['public']['Tables']['statuses']['Row'] & {
  task_count?: number;
};
export type TaskStatusInsert = Database['public']['Tables']['statuses']['Insert'];
export type TaskStatusUpdate = Database['public']['Tables']['statuses']['Update'];

export type TaskPriority = Database['public']['Tables']['priorities']['Row'] & {
  task_count?: number;
};
export type TaskPriorityInsert = Database['public']['Tables']['priorities']['Insert'];
export type TaskPriorityUpdate = Database['public']['Tables']['priorities']['Update'];

export class TaskSettingsAPI {
  private supabase = createClient();

  /**
   * Get all statuses for a project with task counts
   */
  async getProjectStatuses(projectId: number): Promise<TaskStatus[]> {
    try {
      // Get statuses with task counts
      const { data: statusesData, error: statusesError } = await this.supabase
        .from('statuses')
        .select(
          `
          *,
          tasks!left(count)
        `,
        )
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (statusesError) {
        throw new Error(`Failed to fetch statuses: ${statusesError.message}`);
      }

      // Transform the data to include task counts
      const statuses: TaskStatus[] = (statusesData || []).map((status: any) => ({
        ...status,
        task_count: status.tasks?.[0]?.count || 0,
      }));

      return statuses;
    } catch (error: any) {
      console.error('Error in getProjectStatuses:', error);
      throw error;
    }
  }

  /**
   * Create a new status
   */
  async createStatus(data: {
    name: string;
    color?: string;
    project_id: number;
  }): Promise<TaskStatus> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get the next position
      const { data: existingStatuses } = await this.supabase
        .from('statuses')
        .select('position')
        .eq('project_id', data.project_id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existingStatuses?.[0]?.position ? existingStatuses[0].position + 1 : 1;

      // Check if this should be the default (first status)
      const { data: statusCount } = await this.supabase
        .from('statuses')
        .select('id', { count: 'exact' })
        .eq('project_id', data.project_id);

      const isDefault = (statusCount || []).length === 0;

      const statusData: TaskStatusInsert = {
        name: data.name,
        color: data.color || null,
        project_id: data.project_id,
        position: nextPosition,
        is_default: isDefault,
        created_by: user.id,
      };

      const { data: newStatus, error } = await this.supabase
        .from('statuses')
        .insert(statusData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create status: ${error.message}`);
      }

      return { ...newStatus, task_count: 0 };
    } catch (error: any) {
      console.error('Error in createStatus:', error);
      throw error;
    }
  }

  /**
   * Update a status
   */
  async updateStatus(id: number, data: { name?: string; color?: string }): Promise<void> {
    try {
      const updateData: TaskStatusUpdate = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.color !== undefined) updateData.color = data.color;

      const { error } = await this.supabase.from('statuses').update(updateData).eq('id', id);

      if (error) {
        throw new Error(`Failed to update status: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in updateStatus:', error);
      throw error;
    }
  }

  /**
   * Delete a status (only if no tasks use it)
   */
  async deleteStatus(id: number): Promise<void> {
    try {
      // Check if any tasks use this status
      const { data: tasks, error: taskError } = await this.supabase
        .from('tasks')
        .select('id')
        .eq('status_id', id)
        .limit(1);

      if (taskError) {
        throw new Error(`Failed to check task usage: ${taskError.message}`);
      }

      if (tasks && tasks.length > 0) {
        throw new Error('Cannot delete status that is being used by tasks');
      }

      const { error } = await this.supabase.from('statuses').delete().eq('id', id);

      if (error) {
        throw new Error(`Failed to delete status: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in deleteStatus:', error);
      throw error;
    }
  }

  /**
   * Get all priorities for a project with task counts
   */
  async getProjectPriorities(projectId: number): Promise<TaskPriority[]> {
    try {
      // Get priorities with task counts
      const { data: prioritiesData, error: prioritiesError } = await this.supabase
        .from('priorities')
        .select(
          `
          *,
          tasks!left(count)
        `,
        )
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (prioritiesError) {
        throw new Error(`Failed to fetch priorities: ${prioritiesError.message}`);
      }

      // Transform the data to include task counts
      const priorities: TaskPriority[] = (prioritiesData || []).map((priority: any) => ({
        ...priority,
        task_count: priority.tasks?.[0]?.count || 0,
      }));

      return priorities;
    } catch (error: any) {
      console.error('Error in getProjectPriorities:', error);
      throw error;
    }
  }

  /**
   * Create a new priority
   */
  async createPriority(data: {
    name: string;
    color?: string;
    project_id: number;
  }): Promise<TaskPriority> {
    try {
      const {
        data: { user },
      } = await this.supabase.auth.getUser();

      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get the next position
      const { data: existingPriorities } = await this.supabase
        .from('priorities')
        .select('position')
        .eq('project_id', data.project_id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existingPriorities?.[0]?.position
        ? existingPriorities[0].position + 1
        : 1;

      // Check if this should be the default (first priority)
      const { data: priorityCount } = await this.supabase
        .from('priorities')
        .select('id', { count: 'exact' })
        .eq('project_id', data.project_id);

      const isDefault = (priorityCount || []).length === 0;

      const priorityData: TaskPriorityInsert = {
        name: data.name,
        color: data.color || null,
        project_id: data.project_id,
        position: nextPosition,
        is_default: isDefault,
        created_by: user.id,
      };

      const { data: newPriority, error } = await this.supabase
        .from('priorities')
        .insert(priorityData)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create priority: ${error.message}`);
      }

      return { ...newPriority, task_count: 0 };
    } catch (error: any) {
      console.error('Error in createPriority:', error);
      throw error;
    }
  }

  /**
   * Update a priority
   */
  async updatePriority(id: number, data: { name?: string; color?: string }): Promise<void> {
    try {
      const updateData: TaskPriorityUpdate = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.color !== undefined) updateData.color = data.color;

      const { error } = await this.supabase.from('priorities').update(updateData).eq('id', id);

      if (error) {
        throw new Error(`Failed to update priority: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in updatePriority:', error);
      throw error;
    }
  }

  /**
   * Delete a priority (only if no tasks use it)
   */
  async deletePriority(id: number): Promise<void> {
    try {
      // Check if any tasks use this priority
      const { data: tasks, error: taskError } = await this.supabase
        .from('tasks')
        .select('id')
        .eq('priority_id', id)
        .limit(1);

      if (taskError) {
        throw new Error(`Failed to check task usage: ${taskError.message}`);
      }

      if (tasks && tasks.length > 0) {
        throw new Error('Cannot delete priority that is being used by tasks');
      }

      const { error } = await this.supabase.from('priorities').delete().eq('id', id);

      if (error) {
        throw new Error(`Failed to delete priority: ${error.message}`);
      }
    } catch (error: any) {
      console.error('Error in deletePriority:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const taskSettingsAPI = new TaskSettingsAPI();
