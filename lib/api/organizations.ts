import { createClient } from '@/utils/supabase/client';
import {
  Organization,
  OrganizationMembership,
  UserProfile,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  UpdateMembershipRequest,
  UserOrganizationsResult,
  OrganizationWithMembership,
} from '@/lib/types/organization';
import {
  InvitationResult,
  InvitationDetails,
  InvitationListResponse,
  InvitationActionResponse,
  UserExistsResponse,
  InvitationRole,
} from '@/lib/types/invitation';

export class OrganizationAPI {
  private supabase = createClient();

  /**
   * Ensure we have a valid session and refresh if needed
   */
  private async ensureValidSession(): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await this.supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error('Authentication required. Please sign in again.');
    }

    // Refresh the session if it's close to expiring
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = session.expires_at || 0;

    if (expiresAt - now < 300) {
      // Refresh if expires in less than 5 minutes
      const { error: refreshError } = await this.supabase.auth.refreshSession();
      if (refreshError) {
        console.warn('Session refresh failed:', refreshError);
      }
    }
  }

  /**
   * Get current user's organization profile
   */
  async getCurrentUserProfile(): Promise<UserProfile | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select(
        `
        *,
        current_organization:organizations!current_organization_id(*),
        default_organization:organizations!default_organization_id(*)
      `,
      )
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get user's organizations using the database function
   */
  async getUserOrganizations(): Promise<UserOrganizationsResult[]> {
    const { data, error } = await this.supabase.rpc('get_user_organizations');

    if (error) throw error;
    return data || [];
  }

  /**
   * Get current organization
   */
  async getCurrentOrganization(): Promise<Organization[] | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from('user_profiles')
      .select(
        `
        current_organization:organizations!current_organization_id(*)
      `,
      )
      .eq('id', user.id)
      .single();

    if (error) throw error;
    return data?.current_organization as Organization[] | null;
  }

  /**
   * Get organization by ID with membership info
   */
  async getOrganization(orgId: number): Promise<OrganizationWithMembership | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    // Get organization
    const { data: org, error: orgError } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) throw orgError;

    // Get user's membership
    const { data: membership, error: membershipError } = await this.supabase
      .from('organization_users')
      .select('*')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError) return null;

    return {
      ...org,
      user_membership: membership,
    };
  }

  /**
   * Switch to a different organization
   */
  async switchOrganization(orgId: number): Promise<void> {
    const { error } = await this.supabase.rpc('switch_organization_context', { new_org_id: orgId });

    if (error) throw error;
  }

  /**
   * Create a new organization
   */
  async createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
    const { data: result, error } = await this.supabase.rpc('create_organization', {
      org_name: data.name,
      org_description: data.description || null,
    });

    if (error) throw error;

    // Get the created organization
    const { data: org, error: orgError } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', result)
      .single();

    if (orgError) throw orgError;
    return org;
  }

  /**
   * Update organization
   */
  async updateOrganization(orgId: number, data: UpdateOrganizationRequest): Promise<void> {
    const { error } = await this.supabase.from('organizations').update(data).eq('id', orgId);

    if (error) throw error;
  }

  /**
   * Delete organization
   */
  async deleteOrganization(orgId: number): Promise<void> {
    const { error } = await this.supabase.from('organizations').delete().eq('id', orgId);

    if (error) throw error;
  }

  /**
   * Get organization members with their profile information
   */
  async getOrganizationMembers(orgId: number): Promise<OrganizationMembership[]> {
    console.log('Getting members for organization:', orgId);

    // Step 1: Get active organization members
    const { data: members, error } = await this.supabase
      .from('organization_users')
      .select('*')
      .eq('organization_id', orgId)
      .eq('status', 'active')
      .order('joined_at', { ascending: false });

    if (error) throw error;

    // If no members found, return early
    if (!members || members.length === 0) {
      return [];
    }

    // Step 2: Get the organization details
    const { data: organization, error: orgError } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) throw orgError;

    // Step 3: Get user profiles for all members in a single query
    const userIds = members.map((member) => member.user_id);
    const { data: profiles, error: profileError } = await this.supabase
      .from('user_profiles')
      .select('id, email, global_display_name, global_avatar_url')
      .in('id', userIds);

    if (profileError) {
      console.error('Error fetching user profiles:', profileError);
      // Continue with just the member data if profiles can't be fetched
    }

    // Step 4: Create a map of user_id to profile for quick lookups
    const profileMap = (profiles || []).reduce(
      (map, profile) => {
        map[profile.id] = profile;
        return map;
      },
      {} as Record<string, any>,
    );

    // Step 5: Combine all the data
    const enrichedMembers = members.map((member) => {
      const profile = profileMap[member.user_id];
      return {
        ...member,
        organization,
        profile: profile || null,
        email: profile?.email,
      };
    });

    console.log(`Enriched ${enrichedMembers.length} members with profile data`);
    return enrichedMembers;
  }

  /**
   * Check if a user exists in the system by email
   */
  async checkUserExists(email: string): Promise<boolean> {
    try {
      // First try the database function
      const { data, error } = await this.supabase.rpc('check_user_exists_by_email', {
        user_email: email,
      });

      if (!error && data !== null) {
        return data;
      }

      // If database function fails, try checking user_profiles table as fallback
      console.log('Primary user check failed, trying fallback method:', error);
      const { data: profileData, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('id')
        .eq('email', email)
        .single();

      if (!profileError && profileData) {
        return true;
      }

      // Both methods failed, conservatively return false
      console.log('All user existence checks failed, assuming user does not exist');
      return false;
    } catch (error) {
      console.log('User exists check failed, assuming user does not exist:', error);
      return false;
    }
  }

  /**
   * Update organization membership
   */
  async updateMembership(membershipId: number, data: UpdateMembershipRequest): Promise<void> {
    // If this is a role change, use the secure database function
    if (data.role) {
      const { data: result, error } = await this.supabase.rpc('update_organization_member_role', {
        member_id: membershipId,
        new_role: data.role,
      });

      if (error) throw error;
      if (!result) throw new Error('Failed to update member role');

      // If there are other fields to update (like notifications), update them separately
      const otherData = { ...data };
      delete otherData.role;

      if (Object.keys(otherData).length > 0) {
        const { error: updateError } = await this.supabase
          .from('organization_users')
          .update(otherData)
          .eq('id', membershipId);

        if (updateError) throw updateError;
      }
    } else {
      // For non-role updates (like notification preferences), use direct update
      const { error } = await this.supabase
        .from('organization_users')
        .update(data)
        .eq('id', membershipId);

      if (error) throw error;
    }
  }

  /**
   * Remove member from organization
   */
  async removeMember(membershipId: number): Promise<void> {
    const { data: result, error } = await this.supabase.rpc('remove_organization_member', {
      membership_id: membershipId,
    });

    if (error) {
      console.error('Remove member error:', error);
      throw error;
    }

    // Check the result from the function
    if (!result || !result.success) {
      const errorMessage = result?.error || 'Failed to remove member';
      const errorCode = result?.error_code || 'UNKNOWN_ERROR';

      console.error('Remove member failed:', errorMessage, errorCode);

      // Throw a more specific error based on the error code
      switch (errorCode) {
        case 'MEMBERSHIP_NOT_FOUND':
          throw new Error('Membership not found');
        case 'PERMISSION_DENIED':
          throw new Error('You do not have permission to remove this member');
        case 'LAST_OWNER':
          throw new Error('Cannot remove the last owner of an organization');
        case 'ADMIN_CANNOT_REMOVE_OWNER':
          throw new Error('Admins cannot remove owners');
        default:
          throw new Error(errorMessage);
      }
    }
  }

  /**
   * Get user's membership in specific organization
   */
  async getUserMembership(orgId: number): Promise<OrganizationMembership | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    // Get the membership record
    const { data: membershipData, error: membershipError } = await this.supabase
      .from('organization_users')
      .select('*')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (membershipError) return null;

    // Get the organization details separately
    const { data: orgData, error: orgError } = await this.supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .single();

    if (orgError) return null;

    // Combine the data
    return {
      ...membershipData,
      organization: orgData,
    };
  }

  /**
   * Check if user has permission in organization
   */
  async hasPermission(orgId: number, requiredRoles: string[]): Promise<boolean> {
    const membership = await this.getUserMembership(orgId);
    if (!membership) return false;

    return requiredRoles.includes(membership.role);
  }

  /**
   * Get organization member count only
   */
  async getOrganizationMemberCount(orgId: number): Promise<number> {
    const { count } = await this.supabase
      .from('organization_users')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('status', 'active');

    return count || 0;
  }

  /**
   * Get organization analytics/stats
   */
  async getOrganizationStats(orgId: number): Promise<{
    memberCount: number;
    projectCount: number;
    taskCount: number;
    formCount: number;
  }> {
    // Get member count
    const { count: memberCount } = await this.supabase
      .from('organization_users')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .eq('status', 'active');

    // Get project count
    const { count: projectCount } = await this.supabase
      .from('projects')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId);

    // Get task count (through projects)
    const { count: taskCount } = await this.supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .in(
        'project_id',
        await this.supabase
          .from('projects')
          .select('id')
          .eq('organization_id', orgId)
          .then(({ data }) => data?.map((p) => p.id) || []),
      );

    // Get form count
    const { count: formCount } = await this.supabase
      .from('forms')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId);

    return {
      memberCount: memberCount || 0,
      projectCount: projectCount || 0,
      taskCount: taskCount || 0,
      formCount: formCount || 0,
    };
  }

  /**
   * Search organizations by name/slug
   */
  async searchOrganizations(query: string): Promise<Organization[]> {
    const { data, error } = await this.supabase
      .from('organizations')
      .select('*')
      .or(`name.ilike.%${query}%,slug.ilike.%${query}%`)
      .eq('is_active', true)
      .limit(10);

    if (error) throw error;
    return data || [];
  }

  /**
   * Debug method - get all organization members regardless of status
   */
  async getAllOrganizationMembers(orgId: number): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('organization_users')
      .select('*')
      .eq('organization_id', orgId)
      .order('joined_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Debug method - get current user info
   */
  async getCurrentUserInfo(): Promise<any> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser();
    console.log('Current user:', user);
    return { user, error };
  }

  /**
   * Debug method - create a test member entry
   */
  async createTestMember(orgId: number, testUserId: string = 'test-user-123'): Promise<any> {
    const { data, error } = await this.supabase
      .from('organization_users')
      .insert({
        organization_id: orgId,
        user_id: testUserId,
        role: 'member',
        status: 'active',
        joined_at: new Date().toISOString(),
        last_accessed_at: new Date().toISOString(),
        notifications_enabled: true,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Debug current user's membership status - helpful for troubleshooting permission issues
   */
  async debugCurrentUserMembership(orgId?: number): Promise<any> {
    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabase.auth.getUser();
      if (userError || !user) {
        return { error: 'No authenticated user' };
      }

      // Get all memberships for current user
      const { data: allMemberships, error: allError } = await this.supabase
        .from('organization_users')
        .select('*')
        .eq('user_id', user.id);

      // Get specific org membership if orgId provided
      let specificMembership = null;
      if (orgId) {
        const { data: specificData, error: specificError } = await this.supabase
          .from('organization_users')
          .select('*')
          .eq('user_id', user.id)
          .eq('organization_id', orgId)
          .single();

        specificMembership = { data: specificData, error: specificError };
      }

      // Get user profile
      const { data: profile, error: profileError } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      return {
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
        profile: { data: profile, error: profileError },
        allMemberships: { data: allMemberships, error: allError },
        specificMembership,
        requestedOrgId: orgId,
      };
    } catch (error: any) {
      console.error('Debug membership error:', error);
      return { error: error.message };
    }
  }

  /**
   * Fix membership issues for current user - creates organization if needed
   */
  async fixUserMembership(): Promise<any> {
    try {
      const {
        data: { user },
        error: userError,
      } = await this.supabase.auth.getUser();
      if (userError || !user) {
        return { error: 'No authenticated user' };
      }

      // Try to ensure user has an organization using the database function
      const { data, error } = await this.supabase.rpc('ensure_user_has_organization', {
        target_user_id: user.id,
      });

      if (error) {
        console.error('Fix membership error:', error);
        return { error: error.message };
      }

      return {
        success: true,
        organizationId: data,
        message: 'Membership fixed successfully',
      };
    } catch (error: any) {
      console.error('Fix membership error:', error);
      return { error: error.message };
    }
  }

  // ========================================
  // INVITATION METHODS
  // ========================================

  /**
   * Check if a user exists by email address
   */
  async checkUserExistsByEmail(email: string): Promise<UserExistsResponse> {
    try {
      const { data, error } = await this.supabase.rpc('check_user_exists_by_email', {
        user_email: email,
      });

      if (error) {
        console.error('Check user exists error:', error);
        return { exists: false, error: error.message };
      }

      return { exists: data || false };
    } catch (error: any) {
      console.error('Check user exists error:', error);
      return { exists: false, error: error.message };
    }
  }

  /**
   * Invite a user to the organization by email
   * This uses the Supabase Edge Function for complete invitation handling
   */
  async inviteUserByEmail(
    orgId: number,
    email: string,
    role: InvitationRole,
  ): Promise<InvitationResult> {
    try {
      await this.ensureValidSession();

      const { data: session } = await this.supabase.auth.getSession();
      if (!session.session) {
        throw new Error('Authentication required');
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-organization-invitation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({
            organizationId: orgId,
            email: email,
            role: role,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send invitation');
      }

      const result = await response.json();
      return result;
    } catch (error: any) {
      console.error('Invite user error:', error);
      return {
        success: false,
        userExists: false,
        invitationType: 'new_user',
        token: '',
        message: 'Failed to send invitation',
        error: error.message,
      };
    }
  }

  /**
   * Get invitation details by token
   */
  async getInvitationByToken(token: string): Promise<InvitationDetails | null> {
    try {
      const { data, error } = await this.supabase.rpc('get_invitation_by_token', {
        p_token: token,
      });

      if (error) {
        console.error('Get invitation error:', error);
        return null;
      }

      if (!data?.success) {
        console.error('Get invitation failed:', data?.error);
        return null;
      }

      return {
        id: data.invitation.id,
        organization_id: data.invitation.organization_id,
        organization_name: data.invitation.organization_name,
        role: data.invitation.role,
        invited_email: data.invitation.invited_email,
        invited_by_name: data.invitation.invited_by_name,
        invited_by_email: data.invitation.invited_by_email,
        expires_at: data.invitation.expires_at,
        invited_at: data.invitation.invited_at,
        status: data.invitation.status,
        user_exists: data.invitation.user_exists,
        resend_count: data.invitation.resend_count,
        last_resend_at: data.invitation.last_resend_at,
      };
    } catch (error: any) {
      console.error('Get invitation error:', error);
      return null;
    }
  }

  /**
   * Accept an organization invitation
   */
  async acceptInvitation(token: string): Promise<InvitationActionResponse> {
    try {
      await this.ensureValidSession();

      const { data, error } = await this.supabase.rpc('accept_organization_invitation', {
        p_token: token,
      });

      if (error) {
        console.error('Accept invitation error:', error);
        return {
          success: false,
          message: 'Failed to accept invitation',
          error: error.message,
        };
      }

      if (!data?.success) {
        return {
          success: false,
          message: data?.error || 'Failed to accept invitation',
          error_code: data?.error_code,
        };
      }

      return {
        success: true,
        message: 'Invitation accepted successfully',
      };
    } catch (error: any) {
      console.error('Accept invitation error:', error);
      return {
        success: false,
        message: 'Failed to accept invitation',
        error: error.message,
      };
    }
  }

  /**
   * Decline an organization invitation
   */
  async declineInvitation(token: string): Promise<InvitationActionResponse> {
    try {
      const { data, error } = await this.supabase.rpc('decline_organization_invitation', {
        p_token: token,
      });

      if (error) {
        console.error('Decline invitation error:', error);
        return {
          success: false,
          message: 'Failed to decline invitation',
          error: error.message,
        };
      }

      if (!data?.success) {
        return {
          success: false,
          message: data?.error || 'Failed to decline invitation',
          error_code: data?.error_code,
        };
      }

      return {
        success: true,
        message: 'Invitation declined successfully',
      };
    } catch (error: any) {
      console.error('Decline invitation error:', error);
      return {
        success: false,
        message: 'Failed to decline invitation',
        error: error.message,
      };
    }
  }

  /**
   * Get pending invitations for an organization (admin/owner only)
   */
  async getPendingInvitations(orgId: number): Promise<InvitationListResponse> {
    try {
      await this.ensureValidSession();

      const { data, error } = await this.supabase.rpc('get_pending_organization_invitations', {
        p_organization_id: orgId,
      });

      if (error) {
        console.error('Get pending invitations error:', error);
        return {
          success: false,
          invitations: [],
          error: error.message,
        };
      }

      if (!data?.success) {
        return {
          success: false,
          invitations: [],
          error: data?.error || 'Failed to get pending invitations',
          error_code: data?.error_code,
        };
      }

      return {
        success: true,
        invitations: data.invitations || [],
      };
    } catch (error: any) {
      console.error('Get pending invitations error:', error);
      return {
        success: false,
        invitations: [],
        error: error.message,
      };
    }
  }

  /**
   * Cancel a pending invitation (admin/owner only)
   */
  async cancelInvitation(invitationId: number): Promise<InvitationActionResponse> {
    try {
      await this.ensureValidSession();

      const { data, error } = await this.supabase.rpc('cancel_organization_invitation', {
        p_invitation_id: invitationId,
      });

      if (error) {
        console.error('Cancel invitation error:', error);
        return {
          success: false,
          message: 'Failed to cancel invitation',
          error: error.message,
        };
      }

      if (!data?.success) {
        return {
          success: false,
          message: data?.error || 'Failed to cancel invitation',
          error_code: data?.error_code,
        };
      }

      return {
        success: true,
        message: 'Invitation cancelled successfully',
      };
    } catch (error: any) {
      console.error('Cancel invitation error:', error);
      return {
        success: false,
        message: 'Failed to cancel invitation',
        error: error.message,
      };
    }
  }

  /**
   * Resend an invitation (uses the same Edge Function as initial invite)
   */
  async resendInvitation(
    orgId: number,
    email: string,
    role: InvitationRole,
  ): Promise<InvitationResult> {
    // Resending is handled by the same function as initial invite
    // The database function will handle rate limiting and updating resend count
    return this.inviteUserByEmail(orgId, email, role);
  }

  // ========================================
  // USER INVITATION LINKING METHODS (Approach 2)
  // ========================================

  /**
   * Link user to their email-based invitations after signup/signin
   */
  async linkUserToPendingInvitations(
    userId: string,
    email: string,
  ): Promise<{
    success: boolean;
    linkedCount: number;
    error?: string;
  }> {
    try {
      // Don't require session validation for this function since it can be called during signup
      // where session might not be fully established yet
      const { data, error } = await this.supabase.rpc('link_user_to_pending_invitations', {
        p_user_id: userId,
        p_email: email,
      });

      if (error) {
        console.error('Link user to invitations error:', error);
        return {
          success: false,
          linkedCount: 0,
          error: error.message,
        };
      }

      return {
        success: data.success,
        linkedCount: data.linked_count || 0,
        error: data.error,
      };
    } catch (error: any) {
      console.error('Link user to invitations error:', error);
      return {
        success: false,
        linkedCount: 0,
        error: error.message,
      };
    }
  }

  /**
   * Get pending invitations for the current user
   */
  async getUserPendingInvitations(userId?: string): Promise<{
    success: boolean;
    invitations: any[];
    error?: string;
  }> {
    try {
      let targetUserId = userId;

      // If no userId provided, get from current session
      if (!targetUserId) {
        await this.ensureValidSession();
        const {
          data: { user },
        } = await this.supabase.auth.getUser();
        if (!user) {
          return {
            success: false,
            invitations: [],
            error: 'User not authenticated',
          };
        }
        targetUserId = user.id;
      }

      const { data, error } = await this.supabase.rpc('get_user_pending_invitations', {
        p_user_id: targetUserId,
      });

      if (error) {
        console.error('Get user pending invitations error:', error);
        return {
          success: false,
          invitations: [],
          error: error.message,
        };
      }

      return {
        success: data.success,
        invitations: data.invitations || [],
        error: data.error,
      };
    } catch (error: any) {
      console.error('Get user pending invitations error:', error);
      return {
        success: false,
        invitations: [],
        error: error.message,
      };
    }
  }

  /**
   * Quick check if current user has any pending invitations
   */
  async userHasPendingInvitations(userId?: string): Promise<boolean> {
    try {
      let targetUserId = userId;

      // If no userId provided, get from current session
      if (!targetUserId) {
        await this.ensureValidSession();
        const {
          data: { user },
        } = await this.supabase.auth.getUser();
        if (!user) {
          return false;
        }
        targetUserId = user.id;
      }

      const { data, error } = await this.supabase.rpc('user_has_pending_invitations', {
        p_user_id: targetUserId,
      });

      if (error) {
        console.error('Check user pending invitations error:', error);
        return false;
      }

      return data || false;
    } catch (error: any) {
      console.error('Check user pending invitations error:', error);
      return false;
    }
  }

  /**
   * Accept invitation by token (enhanced to work with user linking)
   */
  async acceptUserInvitation(token: string): Promise<InvitationActionResponse> {
    try {
      await this.ensureValidSession();

      const {
        data: { user },
      } = await this.supabase.auth.getUser();
      if (!user) {
        return {
          success: false,
          message: 'Authentication required',
          error: 'User not authenticated',
        };
      }

      // First, try to link the user to this invitation if not already linked
      const invitation = await this.getInvitationByToken(token);
      if (invitation && invitation.invited_email) {
        await this.linkUserToPendingInvitations(user.id, invitation.invited_email);
      }

      // Then accept the invitation
      return this.acceptInvitation(token);
    } catch (error: any) {
      console.error('Accept user invitation error:', error);
      return {
        success: false,
        message: 'Failed to accept invitation',
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const organizationAPI = new OrganizationAPI();
