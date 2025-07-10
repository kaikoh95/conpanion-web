export interface InvitationResult {
  success: boolean;
  userExists: boolean;
  invitationType: 'existing_user' | 'new_user';
  token: string;
  message: string;
  error?: string;
  error_code?: string;
}

export interface InvitationDetails {
  id: number;
  organization_id: number;
  organization_name: string;
  role: string;
  invited_email: string;
  invited_by_name: string;
  invited_by_email: string;
  expires_at: string;
  invited_at: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired';
  user_exists: boolean;
  resend_count: number;
  last_resend_at: string | null;
}

export interface PendingInvitation {
  id: number;
  invitation_token: string;
  role: string;
  invited_email: string;
  invited_at: string;
  expires_at: string;
  resend_count: number;
  last_resend_at: string | null;
  user_exists: boolean;
  invited_by_name: string;
  invited_by_email: string;
}

export interface InvitationListResponse {
  success: boolean;
  invitations: PendingInvitation[];
  error?: string;
  error_code?: string;
}

export interface InvitationActionResponse {
  success: boolean;
  message: string;
  error?: string;
  error_code?: string;
}

export interface UserExistsResponse {
  exists: boolean;
  error?: string;
}

export type InvitationRole = 'owner' | 'admin' | 'member' | 'guest';
