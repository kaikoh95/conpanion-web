import { Database } from '@/lib/supabase/types.generated';

// Database types from generated schema
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationInsert = Database['public']['Tables']['organizations']['Insert'];
export type OrganizationUpdate = Database['public']['Tables']['organizations']['Update'];

export type OrganizationUser = Database['public']['Tables']['organization_users']['Row'];
export type OrganizationUserInsert = Database['public']['Tables']['organization_users']['Insert'];
export type OrganizationUserUpdate = Database['public']['Tables']['organization_users']['Update'];

export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert'];
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update'];

// UserOrganizationSession table was removed in cleanup

// Enhanced types with relations
export interface OrganizationWithMembership extends Organization {
  user_membership?: OrganizationUser;
  member_count?: number;
  is_current?: boolean;
}

export interface OrganizationMembership extends OrganizationUser {
  organization: Organization;
}

export interface UserProfileWithOrganization extends UserProfile {
  current_organization?: Organization;
  default_organization?: Organization;
}

// API request/response types
export interface CreateOrganizationRequest {
  name: string;
  description?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  description?: string;
}

export interface UpdateMembershipRequest {
  role?: 'owner' | 'admin' | 'member' | 'guest';
  status?: 'pending' | 'active' | 'suspended' | 'deactivated';
  notifications_enabled?: boolean;
}

// Context and state types
export interface OrganizationContext {
  current: Organization | null;
  memberships: OrganizationMembership[];
  isLoading: boolean;
  error: string | null;

  // Actions
  switchOrganization: (orgId: number) => Promise<void>;
  createOrganization: (data: CreateOrganizationRequest) => Promise<Organization>;
  updateOrganization: (orgId: number, data: UpdateOrganizationRequest) => Promise<void>;
  deleteOrganization: (orgId: number) => Promise<void>;

  // Member management
  updateMembership: (membershipId: number, data: UpdateMembershipRequest) => Promise<void>;
  removeMember: (membershipId: number) => Promise<void>;

  // Data refresh
  refresh: () => Promise<void>;
  loadFullOrganizationDetails: (orgId: number) => Promise<Organization | null>;
}

// Utility types
export type OrganizationRole = 'owner' | 'admin' | 'member' | 'guest';
export type OrganizationStatus = 'pending' | 'active' | 'suspended' | 'deactivated';

// Permission helpers
export interface OrganizationPermissions {
  canManageMembers: boolean;
  canManageSettings: boolean;
  canDeleteOrganization: boolean;
  canCreateProjects: boolean;
}

// Database function return types
export interface UserOrganizationsResult {
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  user_role: string;
  user_status: string;
  joined_at: string;
  last_accessed_at: string;
  is_current: boolean;
}

// Error types
export interface OrganizationError {
  code: string;
  message: string;
  details?: any;
}

// Component props types
export interface OrganizationSwitcherProps {
  className?: string;
}

export interface OrganizationSettingsProps {
  organizationId: number;
}

export interface MemberListProps {
  organizationId: number;
  canManageMembers?: boolean;
}

export interface InviteMemberProps {
  organizationId: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}
