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

        // Use the updated get_project_members function that returns user_profiles data
        const { data: members, error: membersError } = await supabase.rpc('get_project_members', {
          p_project_id: user.activeProjectId,
        });

        if (membersError) {
          throw new Error('Error fetching project members');
        }

        const formattedMembers = (members || []).map((member: any) => ({
          id: member.user_id,
          name: member.user_name,
          avatar_url: member.user_avatar_url, // This now comes from user_profiles.global_avatar_url
        }));

        setMembers(formattedMembers);
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
