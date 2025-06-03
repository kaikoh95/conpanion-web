import { getSupabaseClient } from '@/lib/supabase/client';
import { Database } from '@/lib/supabase/types.generated';
import { useState, useEffect, useCallback } from 'react';
import { TaskWithRelations } from './models';
import { UserData } from './models';
import { useAuth } from '@/hooks/useAuth';

export type TaskComment = Omit<
  Database['public']['Tables']['task_comments']['Row'],
  'user_avatar'
> & {
  user_avatar?: string;
};

export type TaskMetadata = Database['public']['Tables']['task_metadata']['Row'];

export const useTasks = () => {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const getTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const projectId = user?.activeProjectId;

    try {
      // First fetch tasks with direct relationships
      let query = supabase.from('tasks').select(`
          *,
          priorities (*),
          statuses (*)
        `);

      // Apply filters if provided
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      // Order by created date
      query = query.order('created_at', { ascending: false });

      const { data: rawTasks, error: tasksError } = await query;

      if (tasksError) {
        console.error('Error fetching tasks:', tasksError);
        setError(tasksError.message);
        setTasks([]);
        setLoading(false);
        return;
      }

      if (!rawTasks?.length) {
        setTasks([]);
        setLoading(false);
        return;
      }

      // Get task IDs for fetching related data
      const taskIds = rawTasks.map((task) => task.id);

      // Fetch assignees separately
      const { data: assignees, error: assigneesError } = await supabase
        .from('entity_assignees')
        .select('entity_id, user_id')
        .eq('entity_type', 'task')
        .in('entity_id', taskIds);

      if (assigneesError) {
        console.error('Error fetching assignees:', assigneesError);
      }

      // Fetch labels separately
      const { data: entityLabels, error: labelsError } = await supabase
        .from('entity_labels')
        .select('entity_id, label_id, labels (*)')
        .eq('entity_type', 'task')
        .in('entity_id', taskIds);

      if (labelsError) {
        console.error('Error fetching labels:', labelsError);
      }

      // Fetch task positions for kanban view
      const { data: taskPositions, error: positionsError } = await supabase
        .from('entity_positions')
        .select('entity_id, position')
        .eq('entity_type', 'task')
        .eq('context', 'kanban')
        .is('user_id', null)
        .in('entity_id', taskIds);

      if (positionsError) {
        console.error('Error fetching task positions:', positionsError);
      }

      // Fetch task metadata for time estimates
      const { data: taskMetadata, error: metadataError } = await supabase
        .from('task_metadata')
        .select('*')
        .in('task_id', taskIds);

      if (metadataError) {
        console.error('Error fetching task metadata:', metadataError);
      }

      // Get unique user IDs from assignees for user info
      const userIds = Array.from(
        new Set((assignees || []).map((a: { user_id: string }) => a.user_id)),
      );

      // Fetch user details if we have any assignees
      let usersData: any[] = [];
      if (userIds.length > 0) {
        try {
          const { data: users, error: usersError } = await supabase.rpc('get_user_details', {
            user_ids: userIds,
          });

          if (usersError && usersError.code !== 'PGRST116') {
            // Ignore if RPC doesn't exist yet
            console.error('Error fetching users:', usersError);
          }

          // Map the updated function response to include user_profiles data
          usersData =
            users?.map((user: any) => ({
              id: user.id,
              raw_user_meta_data: user.raw_user_meta_data || {
                name: 'User ' + user.id.substring(0, 6),
              },
              user_profiles:
                user.global_avatar_url || user.global_display_name
                  ? {
                      global_avatar_url: user.global_avatar_url,
                      global_display_name: user.global_display_name,
                    }
                  : null,
            })) ||
            userIds.map((id) => ({
              id,
              raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
              user_profiles: null,
            }));
        } catch (err) {
          console.error('Exception fetching user details:', err);
          // Provide fallback user data
          usersData = userIds.map((id) => ({
            id,
            raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
            user_profiles: null,
          }));
        }
      }

      // Map them to a more usable format
      const tasksWithRelations = rawTasks.map((task) => {
        // Get task's assignees
        const taskAssignees =
          assignees?.filter((a) => a.entity_id === task.id).map((a) => a.user_id) || [];

        // Get task's labels
        const taskLabels =
          entityLabels?.filter((l) => l.entity_id === task.id).map((l) => l.labels) || [];

        // Get task's position
        const taskPosition = taskPositions?.find((p) => p.entity_id === task.id)?.position || null;

        // Get task's metadata
        const taskMetadataItems = taskMetadata?.filter((m) => m.task_id === task.id) || [];

        // Convert metadata array to object for easier access
        const metadataObj =
          taskMetadataItems?.reduce(
            (acc, item) => {
              if (item.title) {
                acc[item.title] = item.value;
              }
              return acc;
            },
            {} as Record<string, string | null>,
          ) || {};

        // Extract hours from metadata for convenience
        const estimatedHours = parseFloat(metadataObj['estimated_hours'] || '0');
        const actualHours = parseFloat(metadataObj['actual_hours'] || '0');

        return {
          ...task,
          assignees: taskAssignees,
          entity_assignees:
            assignees
              ?.filter((a) => a.entity_id === task.id)
              .map((a) => ({
                entity_id: a.entity_id,
                user_id: a.user_id,
                users: usersData?.find((u) => u.id === a.user_id) || {
                  id: a.user_id,
                  raw_user_meta_data: { name: 'Unknown' },
                },
              })) || [],
          entity_labels:
            entityLabels
              ?.filter((l) => l.entity_id === task.id)
              .map((l) => ({
                entity_id: l.entity_id,
                label_id: l.label_id,
                labels: l.labels,
              })) || [],
          labels: taskLabels,
          metadata: taskMetadataItems || [],
          metadataObj,
          estimated_hours: isNaN(estimatedHours) ? null : estimatedHours,
          actual_hours: isNaN(actualHours) ? null : actualHours,
          position: taskPosition,
          priorities: task.priorities,
          statuses: task.statuses,
        } as TaskWithRelations;
      });

      setTasks(tasksWithRelations);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      setError('Failed to load tasks data');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    getTasks();
  }, [getTasks]);

  return { tasks, loading, error, refresh: getTasks };
};

export const useTaskStatuses = () => {
  const [statuses, setStatuses] = useState<Database['public']['Tables']['statuses']['Row'][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const getStatuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const projectId = user?.activeProjectId;

    try {
      let query = supabase.from('statuses').select('*').order('position');

      // If project ID is provided, filter by it
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: statuses, error } = await query;

      if (error) {
        console.error('Error fetching statuses:', error);
        setError(error.message);
        setStatuses([]);
      } else {
        setStatuses(statuses ?? []);
      }
    } catch (err) {
      console.error('Exception fetching statuses:', err);
      setError('Failed to load statuses');
      setStatuses([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    getStatuses();
  }, [getStatuses]);

  return { statuses, loading, error, refresh: getStatuses };
};

export const useTaskPriorities = () => {
  const [priorities, setPriorities] = useState<Database['public']['Tables']['priorities']['Row'][]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const getPriorities = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    const projectId = user?.activeProjectId;

    try {
      let query = supabase.from('priorities').select('*').order('position');

      // If project ID is provided, filter by it
      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data: priorities, error } = await query;

      if (error) {
        console.error('Error fetching priorities:', error);
        setError(error.message);
        setPriorities([]);
      } else {
        setPriorities(priorities ?? []);
      }
    } catch (err) {
      console.error('Exception fetching priorities:', err);
      setError('Failed to load priorities');
      setPriorities([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    getPriorities();
  }, [getPriorities]);

  return { priorities, loading, error, refresh: getPriorities };
};

export const useTaskComments = (taskId: number) => {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const { user } = useAuth();

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      // Fetch comments for this task
      const { data, error } = await supabase
        .from('task_comments')
        .select(
          `
          id,
          task_id,
          user_id,
          content,
          created_at,
          user_name,
          user_avatar
        `,
        )
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching comments:', error);
        setError(error.message);
        setComments([]);
      } else {
        // Transform the data to handle null user_avatar
        const transformedComments = (data || []).map((comment) => ({
          ...comment,
          user_avatar: comment.user_avatar || undefined,
        }));
        setComments(transformedComments);
      }
    } catch (err) {
      console.error('Exception fetching comments:', err);
      setError('Failed to load comments');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const addComment = useCallback(
    async (content: string) => {
      if (!user || !content.trim()) {
        return { success: false, error: 'No user or empty comment' };
      }

      setAdding(true);
      setError(null);

      try {
        const supabase = getSupabaseClient();

        const userName =
          user.profile?.global_display_name || user.user_metadata?.name || 'Anonymous User';
        const userAvatar = user.profile?.global_avatar_url || user.user_metadata?.avatar_url;

        // Add the comment
        const { error } = await supabase.from('task_comments').insert({
          task_id: taskId,
          user_id: user.id,
          content: content.trim(),
          user_name: userName,
          user_avatar: userAvatar,
        });

        if (error) {
          console.error('Error adding comment:', error);
          setError(error.message);
          return { success: false, error: error.message };
        } else {
          // Refresh comments
          await fetchComments();
          return { success: true };
        }
      } catch (err) {
        const errorMessage = 'An unexpected error occurred';
        console.error('Exception adding comment:', err);
        setError(errorMessage);
        return { success: false, error: errorMessage };
      } finally {
        setAdding(false);
      }
    },
    [taskId, user, fetchComments],
  );

  // Fetch comments initially
  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  return {
    comments,
    loading,
    error,
    adding,
    addComment,
    refresh: fetchComments,
  };
};

// Updated hook for managing task metadata
export const useTaskMetadata = (taskId: number) => {
  const [metadata, setMetadata] = useState<TaskMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const fetchMetadata = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();

      // Fetch metadata for this task
      const { data, error } = await supabase
        .from('task_metadata')
        .select('*')
        .eq('task_id', taskId);

      if (error) {
        console.error('Error fetching metadata:', error);
        setError(error.message);
        setMetadata([]);
      } else {
        setMetadata(data || []);
      }
    } catch (err) {
      console.error('Exception fetching metadata:', err);
      setError('Failed to load metadata');
      setMetadata([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  const setMetadataValue = useCallback(
    async (title: string, value: string | null) => {
      try {
        const supabase = getSupabaseClient();

        // Check if metadata already exists
        const { data: existingMetadata } = await supabase
          .from('task_metadata')
          .select('id')
          .eq('task_id', taskId)
          .eq('title', title)
          .single();

        if (existingMetadata) {
          // Update existing metadata
          const { error } = await supabase
            .from('task_metadata')
            .update({ value })
            .eq('id', existingMetadata.id);

          if (error) throw error;
        } else {
          // Insert new metadata
          const { error } = await supabase.from('task_metadata').insert({
            task_id: taskId,
            title,
            value,
            created_by: user?.id || '',
          });

          if (error) throw error;
        }

        // Refresh metadata
        await fetchMetadata();
      } catch (err) {
        console.error('Error setting metadata:', err);
        throw err;
      }
    },
    [taskId, user?.id, fetchMetadata],
  );

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  return { metadata, loading, error, setMetadataValue };
};

export const useTask = (taskId: number | string) => {
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const getTask = useCallback(async () => {
    if (!taskId) {
      setTask(null);
      setLoading(false);
      return;
    }

    // Convert taskId to number for consistent usage with Supabase
    const numericTaskId = typeof taskId === 'string' ? parseInt(taskId) : taskId;

    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();

    try {
      // Fetch the task with direct relationships
      const { data: rawTask, error: taskError } = await supabase
        .from('tasks')
        .select(
          `
          *,
          priorities (*),
          statuses (*)
        `,
        )
        .eq('id', numericTaskId)
        .single();

      if (taskError) {
        console.error('Error fetching task:', taskError);
        setError(taskError.message);
        setTask(null);
        setLoading(false);
        return;
      }

      if (!rawTask) {
        setTask(null);
        setLoading(false);
        return;
      }

      // Fetch assignees separately
      const { data: assignees, error: assigneesError } = await supabase
        .from('entity_assignees')
        .select('entity_id, user_id')
        .eq('entity_type', 'task')
        .eq('entity_id', numericTaskId);

      if (assigneesError) {
        console.error('Error fetching assignees:', assigneesError);
      }

      // Fetch labels separately
      const { data: entityLabels, error: labelsError } = await supabase
        .from('entity_labels')
        .select('entity_id, label_id, labels (*)')
        .eq('entity_type', 'task')
        .eq('entity_id', numericTaskId);

      if (labelsError) {
        console.error('Error fetching labels:', labelsError);
      }

      // Fetch task position for kanban view
      const { data: taskPosition, error: positionError } = await supabase
        .from('entity_positions')
        .select('entity_id, position')
        .eq('entity_type', 'task')
        .eq('context', 'kanban')
        .is('user_id', null)
        .eq('entity_id', numericTaskId)
        .single();

      if (positionError && positionError.code !== 'PGRST116') {
        console.error('Error fetching task position:', positionError);
      }

      // Fetch task metadata for time estimates
      const { data: taskMetadata, error: metadataError } = await supabase
        .from('task_metadata')
        .select('*')
        .eq('task_id', numericTaskId);

      if (metadataError) {
        console.error('Error fetching task metadata:', metadataError);
      }

      // Get unique user IDs from assignees for user info
      const userIds = Array.from(
        new Set((assignees || []).map((a: { user_id: string }) => a.user_id)),
      );

      // Fetch user details if we have any assignees
      let usersData: any[] = [];
      if (userIds.length > 0) {
        try {
          const { data: users, error: usersError } = await supabase.rpc('get_user_details', {
            user_ids: userIds,
          });

          if (usersError && usersError.code !== 'PGRST116') {
            // Ignore if RPC doesn't exist yet
            console.error('Error fetching users:', usersError);
          }

          // Map the updated function response to include user_profiles data
          usersData =
            users?.map((user: any) => ({
              id: user.id,
              raw_user_meta_data: user.raw_user_meta_data || {
                name: 'User ' + user.id.substring(0, 6),
              },
              user_profiles:
                user.global_avatar_url || user.global_display_name
                  ? {
                      global_avatar_url: user.global_avatar_url,
                      global_display_name: user.global_display_name,
                    }
                  : null,
            })) ||
            userIds.map((id) => ({
              id,
              raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
              user_profiles: null,
            }));
        } catch (err) {
          console.error('Exception fetching user details:', err);
          // Provide fallback user data
          usersData = userIds.map((id) => ({
            id,
            raw_user_meta_data: { name: 'User ' + id.substring(0, 6) },
            user_profiles: null,
          }));
        }
      }

      // Get task's assignees
      const taskAssignees =
        assignees?.filter((a) => a.entity_id === rawTask.id).map((a) => a.user_id) || [];

      // Get task's labels
      const taskLabels =
        entityLabels?.filter((l) => l.entity_id === rawTask.id).map((l) => l.labels) || [];

      // Get task's position
      const position = taskPosition?.position || null;

      // Get task's metadata
      const taskMetadataItems = taskMetadata || [];

      // Convert metadata array to object for easier access
      const metadataObj =
        taskMetadataItems?.reduce(
          (acc, item) => {
            if (item.title) {
              acc[item.title] = item.value;
            }
            return acc;
          },
          {} as Record<string, string | null>,
        ) || {};

      // Extract hours from metadata for convenience
      const estimatedHours = parseFloat(metadataObj['estimated_hours'] || '0');
      const actualHours = parseFloat(metadataObj['actual_hours'] || '0');

      const taskWithRelations = {
        ...rawTask,
        assignees: taskAssignees,
        entity_assignees:
          assignees?.map((a) => ({
            entity_id: a.entity_id,
            user_id: a.user_id,
            users: usersData?.find((u) => u.id === a.user_id) || {
              id: a.user_id,
              raw_user_meta_data: { name: 'Unknown' },
            },
          })) || [],
        entity_labels:
          entityLabels?.map((l) => ({
            entity_id: l.entity_id,
            label_id: l.label_id,
            labels: l.labels,
          })) || [],
        labels: taskLabels,
        metadata: taskMetadataItems || [],
        metadataObj,
        estimated_hours: isNaN(estimatedHours) ? null : estimatedHours,
        actual_hours: isNaN(actualHours) ? null : actualHours,
        position: position,
        priorities: rawTask.priorities,
        statuses: rawTask.statuses,
      } as TaskWithRelations;

      setTask(taskWithRelations);
    } catch (error) {
      console.error('Error fetching task:', error);
      setError('Failed to load task data');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [taskId, user]);

  useEffect(() => {
    getTask();
  }, [getTask]);

  return { task, loading, error, refresh: getTask };
};
