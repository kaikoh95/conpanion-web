import { createClient } from '@/utils/supabase/client';
import { UserProfile } from '@/lib/types/organization';

export class UserAPI {
  private supabase = createClient();

  /**
   * Get current user's profile
   */
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }
}

// Export singleton instance
export const userAPI = new UserAPI();
