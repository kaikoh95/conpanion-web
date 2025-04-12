import { getSupabaseClient } from "@/lib/supabase/client";
import { Database } from "@/lib/supabase/types.generated";
import { useState, useEffect, useCallback } from "react";
import { TaskWithRelations } from "./models";
import { UserData } from "./models";
import { useAuth } from "@/hooks/useAuth";

export interface TaskMetadata {
  id: number;
  task_id: number;
  title: string;
  value: string;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export const useTasks = (options?: { projectId?: number }) => {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectId = options?.projectId;

  const getTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();
    
    try {
      // First fetch tasks with direct relationships
      let query = supabase
        .from('tasks')
        .select(`
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
      const taskIds = rawTasks.map(task => task.id);
      
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
        new Set(
          (assignees || []).map((a: {user_id: string}) => a.user_id)
        )
      );
      
      // Fetch user details if we have any assignees
      let usersData: UserData[] = [];
      if (userIds.length > 0) {
        try {
          const { data: users, error: usersError } = await supabase.rpc('get_user_details', {
            user_ids: userIds
          });
          
          if (usersError && usersError.code !== 'PGRST116') { // Ignore if RPC doesn't exist yet
            console.error('Error fetching users:', usersError);
          }
          
          // If the RPC function doesn't exist yet, create a fallback
          usersData = users || userIds.map(id => ({
            id,
            raw_user_meta_data: { name: 'User ' + id.substring(0, 6) }
          }));
        } catch (err) {
          console.error('Exception fetching user details:', err);
          // Provide fallback user data
          usersData = userIds.map(id => ({
            id,
            raw_user_meta_data: { name: 'User ' + id.substring(0, 6) }
          }));
        }
      }
      
      // Map them to a more usable format
      const tasksWithRelations = rawTasks.map(task => {
        // Get task's assignees
        const taskAssignees = assignees
          ?.filter(a => a.entity_id === task.id)
          .map(a => a.user_id) || [];
        
        // Get task's labels
        const taskLabels = entityLabels
          ?.filter(l => l.entity_id === task.id)
          .map(l => l.labels) || [];
          
        // Get task's position
        const taskPosition = taskPositions?.find(p => p.entity_id === task.id)?.position || null;
          
        // Get task's metadata
        const taskMetadataItems = taskMetadata?.filter(m => m.task_id === task.id) || [];
        
        // Convert metadata array to object for easier access
        const metadataObj = taskMetadataItems.reduce((acc, item) => {
          if (item.title && item.value) {
            acc[item.title] = item.value;
          }
          return acc;
        }, {} as Record<string, string>);
        
        // Extract hours from metadata for convenience
        const estimatedHours = parseFloat(metadataObj['estimated_hours'] || '0');
        const actualHours = parseFloat(metadataObj['actual_hours'] || '0');
        
        return {
          ...task,
          assignees: taskAssignees,
          labels: taskLabels,
          metadata: taskMetadataItems,
          metadataObj,
          estimated_hours: isNaN(estimatedHours) ? 0 : estimatedHours,
          actual_hours: isNaN(actualHours) ? 0 : actualHours,
          position: taskPosition,
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
  }, [projectId]);

  useEffect(() => {
    getTasks();
  }, [getTasks]);

  return { tasks, loading, error, refresh: getTasks };
}

export const useTaskStatuses = (options?: { projectId?: number }) => {
  const [statuses, setStatuses] = useState<Database['public']['Tables']['statuses']['Row'][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectId = options?.projectId;

  const getStatuses = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();

    try {
      let query = supabase
      .from('statuses')
      .select('*')
        .order('position');
      
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
  }, [projectId]);

  useEffect(() => {
    getStatuses();
  }, [getStatuses]);

  return { statuses, loading, error, refresh: getStatuses };
}

export const useTaskPriorities = (options?: { projectId?: number }) => {
  const [priorities, setPriorities] = useState<Database['public']['Tables']['priorities']['Row'][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectId = options?.projectId;

  const getPriorities = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = getSupabaseClient();

    try {
      let query = supabase
        .from('priorities')
        .select('*')
        .order('position');
      
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
  }, [projectId]);

  useEffect(() => {
    getPriorities();
  }, [getPriorities]);

  return { priorities, loading, error, refresh: getPriorities };
}

// Comment type definition
export interface TaskComment {
  id: number
  task_id: number
  user_id: string
  content: string
  created_at: string
  user_name: string
  user_avatar?: string
}

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
        .select(`
          id,
          task_id,
          user_id,
          content,
          created_at,
          user_name,
          user_avatar
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching comments:', error);
        setError(error.message);
        setComments([]);
      } else {
        setComments(data || []);
      }
    } catch (err) {
      console.error('Exception fetching comments:', err);
      setError('Failed to load comments');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [taskId]);
  
  const addComment = useCallback(async (content: string) => {
    if (!user || !content.trim()) {
      return { success: false, error: 'No user or empty comment' };
    }
    
    setAdding(true);
    setError(null);
    
    try {
      const supabase = getSupabaseClient();
      
      // Get user details
      const userName = user.user_metadata?.name || 'Anonymous User';
      const userAvatar = user.user_metadata?.avatar_url;
      
      // Add the comment
      const { error } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: user.id,
          content: content.trim(),
          user_name: userName,
          user_avatar: userAvatar
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
  }, [taskId, user, fetchComments]);

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
    refresh: fetchComments
  };
}

// Updated hook for managing task metadata
export const useTaskMetadata = (taskId: number) => {
  const [metadata, setMetadata] = useState<TaskMetadata[]>([]);
  const [metadataMap, setMetadataMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { user } = useAuth();

  const fetchMetadata = useCallback(async () => {
    if (!taskId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const supabase = getSupabaseClient();
      
      const { data, error } = await supabase
        .from('task_metadata')
        .select('*')
        .eq('task_id', taskId);
      
      if (error) {
        console.error('Error fetching task metadata:', error);
        setError(error.message);
        setMetadata([]);
        setMetadataMap({});
      } else {
        setMetadata(data || []);
        
        // Create a map of metadata for easier access
        const metadataObject = (data || []).reduce((acc: Record<string, string>, item: TaskMetadata) => {
          acc[item.title] = item.value;
          return acc;
        }, {});
        
        setMetadataMap(metadataObject);
      }
    } catch (err) {
      console.error('Exception fetching task metadata:', err);
      setError('Failed to load task metadata');
      setMetadata([]);
      setMetadataMap({});
    } finally {
      setLoading(false);
    }
  }, [taskId]);
  
  const saveMetadataItem = useCallback(async (
    title: string,
    value: string | number | null
  ) => {
    if (!taskId || !user) return { success: false, error: 'No task ID or user' };
    
    // Convert value to string for storage
    const stringValue = value !== null ? String(value) : null;
    
    setSaving(true);
    setError(null);
    
    try {
      const supabase = getSupabaseClient();
      
      // Find if this metadata already exists
      const existingItem = metadata.find(item => item.title === title);
      
      if (stringValue === null) {
        // If value is null, delete the metadata if it exists
        if (existingItem) {
          const { error } = await supabase
            .from('task_metadata')
            .delete()
            .eq('id', existingItem.id);
          
          if (error) {
            console.error('Error deleting task metadata:', error);
            setError(error.message);
            setSaving(false);
            return { success: false, error: error.message };
          }
        }
      } else if (existingItem) {
        // Update existing metadata
        const { error } = await supabase
          .from('task_metadata')
          .update({ 
            value: stringValue,
            updated_at: new Date().toISOString() 
          })
          .eq('id', existingItem.id);
        
        if (error) {
          console.error('Error updating task metadata:', error);
          setError(error.message);
          setSaving(false);
          return { success: false, error: error.message };
        }
      } else {
        // Insert new metadata
        const { error } = await supabase
          .from('task_metadata')
          .insert({ 
            task_id: taskId,
            title,
            value: stringValue,
            created_by: user.id
          });
        
        if (error) {
          console.error('Error creating task metadata:', error);
          setError(error.message);
          setSaving(false);
          return { success: false, error: error.message };
        }
      }
      
      // Fetch the updated metadata
      await fetchMetadata();
      
      return { success: true };
    } catch (err) {
      console.error('Exception saving task metadata:', err);
      const errorMessage = 'An unexpected error occurred';
      setError(errorMessage);
      setSaving(false);
      return { success: false, error: errorMessage };
    } finally {
      setSaving(false);
    }
  }, [taskId, user, metadata, fetchMetadata]);

  // Fetch metadata on initial load
  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  // Helper function to safely access and parse numeric metadata
  const getNumber = useCallback((key: string): number | null => {
    const value = metadataMap[key];
    if (value === undefined || value === null) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }, [metadataMap]);

  // Helper function to safely access string metadata
  const getString = useCallback((key: string): string | null => {
    return metadataMap[key] || null;
  }, [metadataMap]);

  return {
    metadata,
    metadataMap,
    estimated_hours: getNumber('estimated_hours'),
    actual_hours: getNumber('actual_hours'),
    loading,
    error,
    saving,
    saveMetadataItem,
    getNumber,
    getString,
    refresh: fetchMetadata
  };
}
