import { useState, useEffect } from 'react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ProjectMember = {
  id: string;
  name: string;
  avatar_url?: string;
};

export function useProjectMembers() {
  const { user } = useAuth();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjectMembers = async () => {
      if (!user?.activeProjectId) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const supabase = getSupabaseClient();
        
        // First get all users in the project
        const { data: projectUsers, error: projectError } = await supabase
          .from('projects_users')
          .select('user_id')
          .eq('project_id', user.activeProjectId);

        if (projectError) {
          throw new Error('Error fetching project users');
        }

        if (!projectUsers?.length) {
          setMembers([]);
          return;
        }

        // Then get user details
        const userIds = projectUsers.map(pu => pu.user_id);
        const { data: userData, error: userError } = await supabase
          .rpc('get_user_details', { user_ids: userIds });

        if (userError) {
          throw new Error('Error fetching user details');
        }

        const members = (userData || [])
          .filter((user): user is { id: string; raw_user_meta_data: { name: string; avatar_url?: string } } => 
            Boolean(user?.raw_user_meta_data && typeof user.raw_user_meta_data === 'object' && 'name' in user.raw_user_meta_data)
          )
          .map(user => ({
            id: user.id,
            name: user.raw_user_meta_data.name,
            avatar_url: user.raw_user_meta_data.avatar_url
          }));

        setMembers(members);
      } catch (err) {
        console.error('Error fetching project members:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchProjectMembers();
  }, [user?.activeProjectId]);

  return { members, loading, error };
} 