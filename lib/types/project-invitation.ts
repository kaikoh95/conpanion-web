'use client';

// Project invitation result from API
export interface ProjectInvitationResult {
  success: boolean;
  invitation_id?: number;
  action: 'created' | 'resent';
  user_exists: boolean;
  resend_count: number;
  error?: string;
  error_code?: string;
}

// Project invitation details for display
export interface ProjectInvitationDetails {
  id: number;
  project_id: number;
  project_name: string;
  project_description?: string;
  organization_id: number;
  organization_name: string;
  organization_slug: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  invited_at: string;
  inviter_email: string;
  inviter_name: string;
}

// Pending project invitation item
export interface PendingProjectInvitation {
  id: number;
  project_id: number;
  email: string;
  role: string;
  token: string;
  invited_at: string;
  expires_at: string;
  resend_count: number;
  last_resend_at: string;
  inviter_email: string;
  inviter_name: string;
}

// Response for project invitation lists
export interface ProjectInvitationListResponse {
  success: boolean;
  invitations: PendingProjectInvitation[];
  error?: string;
}

// Response for project invitation actions (accept/decline/cancel)
export interface ProjectInvitationActionResponse {
  success: boolean;
  message: string;
  project_id?: number;
  membership_id?: number;
  role?: string;
  action?: string;
  error?: string;
  error_code?: string;
}

// User existence check response for projects
export interface ProjectUserExistsResponse {
  exists: boolean;
  user_id?: string;
}

// Project invitation roles (using existing project roles)
export type ProjectInvitationRole = 'owner' | 'admin' | 'member' | 'guest';

// Project invitation API response wrapper
export interface ProjectInvitationApiResponse {
  success: boolean;
  data?: any;
  error?: string;
  error_code?: string;
}

// Project invitation email data structure (for edge function)
export interface ProjectInvitationEmailData {
  email: string;
  projectName: string;
  organizationName: string;
  invitationToken: string;
  inviterName: string;
  role: string;
  userExists: boolean;
}

// User's pending project invitations
export interface UserPendingProjectInvitation {
  id: number;
  project_id: number;
  project_name: string;
  organization_id: number;
  organization_name: string;
  role: string;
  token: string;
  invited_at: string;
  expires_at: string;
  inviter_email: string;
  inviter_name: string;
}

// Response for user's pending project invitations
export interface UserPendingProjectInvitationsResponse {
  success: boolean;
  invitations: UserPendingProjectInvitation[];
  count: number;
  error?: string;
}