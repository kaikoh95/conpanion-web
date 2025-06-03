'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Database } from '@/lib/supabase/types.generated';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase/client';
import { UserProfile } from '@/lib/types/organization';

export type UserData = User & {
  activeProjectId: number;
  activeOrganizationId: number;
  profile: UserProfile | null;
};

interface AuthContextType {
  user: UserData | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();

  const getUser = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        setUser(null);
        setLoading(false);
        return;
      }
      console.log('🔄 AuthContext: session:', session);

      // use this for testing only
      if (!session?.user?.user_metadata?.avatar_url) {
        const avatars = [
          'https://images.unsplash.com/photo-1492633423870-43d1cd2775eb?&w=128&h=128&dpr=2&q=80',
          'https://github.com/shadcn.png',
          'https://images.unsplash.com/photo-1511485977113-f34c92461ad9?ixlib=rb-1.2.1&w=128&h=128&dpr=2&q=80',
        ];
        const avatarUrl = avatars[Math.floor(Math.random() * avatars.length)];

        await supabase.auth.updateUser({
          data: {
            name: session?.user?.email, // use email for now as we dont ask for first and last names yet
            avatar_url: avatarUrl,
          },
        });
      }

      let { data: userProfile, error: userProfileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session?.user?.id)
        .single();

      // If user profile doesn't exist, create it with auth metadata
      if (userProfileError && userProfileError.code === 'PGRST116') {
        const newProfileData = {
          id: session.user.id,
          global_avatar_url: session.user.user_metadata?.avatar_url || null,
          global_display_name: session.user.user_metadata?.name || session.user.email || null,
          email: session.user.email,
        };

        const { data: newProfile, error: createError } = await supabase
          .from('user_profiles')
          .insert(newProfileData)
          .select('*')
          .single();

        if (createError) {
          console.error('Error creating user profile:', createError);
        } else {
          console.log('✅ Created new user profile with auth metadata');
          userProfile = newProfile;
        }
      } else if (userProfile && session?.user?.user_metadata?.avatar_url) {
        // Only sync auth metadata to user_profiles if user_profiles has no avatar set
        // This allows user_profiles to be the source of truth for avatars
        const authAvatarUrl = session.user.user_metadata.avatar_url;
        const dbAvatarUrl = userProfile.global_avatar_url;

        // Only sync FROM auth TO database if database avatar is completely empty
        // This preserves user-set avatars and prevents overwriting
        if (!dbAvatarUrl) {
          try {
            const { error: syncError } = await supabase
              .from('user_profiles')
              .update({
                global_avatar_url: authAvatarUrl,
                // Also sync display name if not set in database but exists in auth
                global_display_name:
                  userProfile.global_display_name ||
                  session.user.user_metadata.name ||
                  session.user.email,
              })
              .eq('id', session.user.id);

            if (syncError) {
              console.error('Error syncing avatar to user_profiles:', syncError);
            } else {
              console.log('✅ Initial sync of avatar from auth metadata to user_profiles');
              // Update local userProfile to reflect the sync
              userProfile.global_avatar_url = authAvatarUrl;
              if (!userProfile.global_display_name) {
                userProfile.global_display_name =
                  session.user.user_metadata.name || session.user.email;
              }
            }
          } catch (syncError) {
            console.error('Error syncing avatar to user_profiles:', syncError);
          }
        }

        if (authAvatarUrl !== dbAvatarUrl) {
          console.log('🔄 AuthContext: Syncing avatar from auth to user metadata');
          await supabase.auth.updateUser({
            data: {
              avatar_url: dbAvatarUrl,
            },
          });
        }
      }

      const organizationId =
        userProfile?.current_organization_id ?? userProfile?.default_organization_id;
      if (!organizationId) {
        console.error('No organization found for user:', session?.user?.id);
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: organizationUsers } = await supabase
        .from('organization_users')
        .select('current_project_id, default_project_id')
        .eq('organization_id', organizationId)
        .eq('user_id', session?.user?.id)
        .single();

      const projectId =
        organizationUsers?.current_project_id ?? organizationUsers?.default_project_id ?? null;

      // If no project found, this indicates a setup issue (should not happen with proper signup trigger)
      if (!projectId) {
        console.error('🚨 AuthContext: No project found for user:', session?.user?.id);
        console.error('🚨 AuthContext: This indicates an incomplete signup process');
        setUser(null);
        setLoading(false);
        return;
      }

      const newUserData = {
        ...session?.user,
        activeProjectId: projectId,
        activeOrganizationId: organizationId,
        profile: userProfile,
      };

      // Only update state if user data has actually changed to prevent unnecessary re-renders
      setUser((currentUser) => {
        if (!currentUser || JSON.stringify(currentUser) !== JSON.stringify(newUserData)) {
          return newUserData;
        }
        return currentUser;
      });
    } catch (error) {
      console.error('Error getting auth session:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log('🔄 AuthContext: onAuthStateChange event:', event);
      // Only refresh on meaningful auth events, not on every state check
      if (
        event === 'SIGNED_IN' ||
        event === 'SIGNED_OUT' ||
        event === 'TOKEN_REFRESHED' ||
        event === 'USER_UPDATED'
      ) {
        getUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [getUser, supabase]);

  const value: AuthContextType = {
    user,
    loading,
    refreshUser: getUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
