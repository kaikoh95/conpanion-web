'use client';

import React, { useEffect, useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Users,
  UserPlus,
  ArrowLeft,
  MoreHorizontal,
  Mail,
  Shield,
  UserMinus,
  Settings,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Organization,
  OrganizationMembership,
  OrganizationRole,
  UserProfile,
} from '@/lib/types/organization';
import { PendingInvitation } from '@/lib/types/invitation';
import { organizationAPI } from '@/lib/api/organizations';
import { DebugWrapper } from '@/utils/debug';

// Extend the OrganizationMembership type to include email
interface ExtendedOrganizationMembership extends Omit<OrganizationMembership, 'email'> {
  email: string | null;
  profile?: UserProfile;
}

export default function OrganizationMembersPage() {
  const params = useParams();
  const router = useRouter();
  const { memberships, current } = useOrganization();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [userMembership, setUserMembership] = useState<OrganizationMembership | null>(null);
  const [members, setMembers] = useState<ExtendedOrganizationMembership[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Role change confirmation dialog state
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    isOpen: boolean;
    membershipId: number;
    newRole: OrganizationRole;
    targetMember: OrganizationMembership | null;
    isOwnerPromotion: boolean;
  }>({
    isOpen: false,
    membershipId: 0,
    newRole: 'member',
    targetMember: null,
    isOwnerPromotion: false,
  });
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Remove member confirmation dialog state
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    isOpen: boolean;
    membershipId: number;
    userId: string;
  }>({
    isOpen: false,
    membershipId: 0,
    userId: '',
  });
  const [isRemovingMember, setIsRemovingMember] = useState(false);

  // Invitation management state
  const [cancelInvitationDialog, setCancelInvitationDialog] = useState<{
    isOpen: boolean;
    invitationId: number;
    email: string;
  }>({
    isOpen: false,
    invitationId: 0,
    email: '',
  });
  const [isCancellingInvitation, setIsCancellingInvitation] = useState(false);
  const [resendingInvitationId, setResendingInvitationId] = useState<number | null>(null);

  // Success/Error notification state
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: 'success',
    title: '',
    message: '',
  });

  // Invite form state
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'member' as OrganizationRole,
  });
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [userExistsStatus, setUserExistsStatus] = useState<{
    isChecking: boolean;
    exists: boolean | null;
    email: string;
  }>({
    isChecking: false,
    exists: null,
    email: '',
  });

  const slug = params.slug as string;

  // Load pending invitations
  const loadPendingInvitations = async (orgId: number) => {
    setIsLoadingInvitations(true);
    try {
      const result = await organizationAPI.getPendingInvitations(orgId);
      if (result.success) {
        setPendingInvitations(result.invitations);
      } else {
        console.error('Failed to load pending invitations:', result.error);
        setPendingInvitations([]);
      }
    } catch (error) {
      console.error('Error loading pending invitations:', error);
      setPendingInvitations([]);
    } finally {
      setIsLoadingInvitations(false);
    }
  };

  // Debounced user existence check
  useEffect(() => {
    const checkUserExists = async (email: string) => {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setUserExistsStatus({
          isChecking: false,
          exists: null,
          email: '',
        });
        return;
      }

      setUserExistsStatus((prev) => ({
        ...prev,
        isChecking: true,
        email: email,
      }));

      try {
        const result = await organizationAPI.checkUserExistsByEmail(email);
        setUserExistsStatus({
          isChecking: false,
          exists: result.exists,
          email: email,
        });
      } catch (error) {
        console.error('Error checking user existence:', error);
        setUserExistsStatus({
          isChecking: false,
          exists: null,
          email: email,
        });
      }
    };

    const timeoutId = setTimeout(() => {
      if (inviteForm.email && inviteForm.email !== userExistsStatus.email) {
        checkUserExists(inviteForm.email);
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [inviteForm.email, userExistsStatus.email]);

  useEffect(() => {
    const loadData = async () => {
      const foundMembership = memberships.find((m) => m.organization.slug === slug);

      if (foundMembership) {
        setOrganization(foundMembership.organization);
        setUserMembership(foundMembership);

        try {
          // Load organization members
          console.log('Loading members for organization:', foundMembership.organization_id);
          const orgMembers = await organizationAPI.getOrganizationMembers(
            foundMembership.organization_id,
          );
          console.log('Loaded members:', orgMembers);

          // Sort members: current user at top, then alphabetically by email
          const sortedMembers = [...orgMembers].sort(
            (a: ExtendedOrganizationMembership, b: ExtendedOrganizationMembership) => {
              // Put current user at top
              if (a.user_id === foundMembership.user_id) return -1;
              if (b.user_id === foundMembership.user_id) return 1;

              // Then sort by email
              const emailA = a.email || a.profile?.email || '';
              const emailB = b.email || b.profile?.email || '';
              return emailA.localeCompare(emailB);
            },
          );

          setMembers(sortedMembers);

          // Load pending invitations if user can manage members
          const currentCanManageMembers =
            foundMembership.role === 'owner' || foundMembership.role === 'admin';
          if (currentCanManageMembers) {
            await loadPendingInvitations(foundMembership.organization_id);
          }
        } catch (error) {
          console.error('Failed to load members:', error);
          console.error('Error details:', error);
        }
      } else {
        router.push('/protected/settings/organizations');
      }
      setIsLoading(false);
    };

    if (memberships.length > 0) {
      loadData();
    }
  }, [memberships, slug, router]);

  const canManageMembers = userMembership?.role === 'owner' || userMembership?.role === 'admin';

  // Helper function to determine what roles the current user can assign to a target member
  const canAssignRole = (
    targetMember: OrganizationMembership,
    newRole: OrganizationRole,
  ): boolean => {
    if (!userMembership) return false;

    const currentUserRole = userMembership.role;
    const targetCurrentRole = targetMember.role;

    // Role hierarchy: owner > admin > member > guest
    const roleHierarchy = { owner: 4, admin: 3, member: 2, guest: 1 };
    const currentUserLevel = roleHierarchy[currentUserRole as keyof typeof roleHierarchy];
    const targetCurrentLevel = roleHierarchy[targetCurrentRole as keyof typeof roleHierarchy];
    const newRoleLevel = roleHierarchy[newRole as keyof typeof roleHierarchy];

    // Only owners can assign owner role
    if (newRole === 'owner' && currentUserRole !== 'owner') {
      return false;
    }

    // Can't change roles of members with equal or higher privileges (unless you're owner)
    if (currentUserLevel <= targetCurrentLevel && currentUserRole !== 'owner') {
      return false;
    }

    // Can't assign roles equal or higher than your own (unless you're owner and not changing to owner)
    if (currentUserLevel <= newRoleLevel && currentUserRole !== 'owner') {
      return false;
    }

    // Don't show current role in menu
    if (newRole === targetCurrentRole) {
      return false;
    }

    return true;
  };

  const validateInviteForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!inviteForm.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!inviteForm.role) {
      errors.role = 'Role is required';
    }

    setInviteErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInviteMember = async () => {
    if (!organization || !validateInviteForm()) return;

    setIsInviting(true);
    try {
      const result = await organizationAPI.inviteUserByEmail(
        organization.id,
        inviteForm.email,
        inviteForm.role as any,
      );

      if (result.success) {
        // Reset form and close dialog
        setInviteForm({ email: '', role: 'member' });
        setInviteErrors({});
        setUserExistsStatus({
          isChecking: false,
          exists: null,
          email: '',
        });
        setIsInviteDialogOpen(false);

        // Show success notification
        const invitationType = result.userExists ? 'existing user' : 'new user';
        setNotification({
          isOpen: true,
          type: 'success',
          title: 'Invitation Sent',
          message: `Successfully invited ${inviteForm.email} to join as ${inviteForm.role}. ${
            result.userExists
              ? 'The user will receive an email to accept the invitation.'
              : 'The user will receive an email to create an account and join the organization.'
          }`,
        });

        // Reload pending invitations
        if (canManageMembers) {
          await loadPendingInvitations(organization.id);
        }
      } else {
        throw new Error(result.error || 'Failed to send invitation');
      }
    } catch (error: any) {
      console.error('Invitation error:', error);
      setInviteErrors({
        submit: error.message || 'Failed to invite member. Please try again.',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleUpdateMemberRole = (
    membershipId: number,
    newRole: OrganizationRole,
    targetMember: OrganizationMembership,
  ) => {
    if (!organization || !userMembership) return;

    // Role hierarchy validation
    const currentUserRole = userMembership.role;
    const targetCurrentRole = targetMember.role;

    // Define role hierarchy: owner > admin > member > guest
    const roleHierarchy = { owner: 4, admin: 3, member: 2, guest: 1 };
    const currentUserLevel = roleHierarchy[currentUserRole as keyof typeof roleHierarchy];
    const targetCurrentLevel = roleHierarchy[targetCurrentRole as keyof typeof roleHierarchy];
    const newRoleLevel = roleHierarchy[newRole as keyof typeof roleHierarchy];

    // Validation rules
    if (currentUserRole !== 'owner' && newRole === 'owner') {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Permission Denied',
        message: 'Only organization owners can promote members to owner role.',
      });
      return;
    }

    if (currentUserLevel <= targetCurrentLevel && currentUserRole !== 'owner') {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Permission Denied',
        message: 'You can only change roles of members with lower privileges than yourself.',
      });
      return;
    }

    if (
      currentUserLevel <= newRoleLevel &&
      currentUserRole !== 'owner' &&
      newRole !== targetCurrentRole
    ) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Permission Denied',
        message: 'You cannot promote members to a role equal or higher than your own.',
      });
      return;
    }

    // Open confirmation dialog
    setRoleChangeDialog({
      isOpen: true,
      membershipId,
      newRole,
      targetMember,
      isOwnerPromotion: newRole === 'owner',
    });
  };

  const confirmRoleChange = async () => {
    if (!organization || !roleChangeDialog.targetMember) return;

    setIsUpdatingRole(true);
    try {
      await organizationAPI.updateMembership(roleChangeDialog.membershipId, {
        role: roleChangeDialog.newRole,
      });

      // Update local state
      setMembers((prev) =>
        prev.map((member) =>
          member.id === roleChangeDialog.membershipId
            ? { ...member, role: roleChangeDialog.newRole }
            : member,
        ),
      );

      // Close dialog
      setRoleChangeDialog((prev) => ({ ...prev, isOpen: false }));

      // Show success message
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Role Updated',
        message: `Successfully updated role to ${roleChangeDialog.newRole}.`,
      });
    } catch (error: any) {
      console.error('Failed to update member role:', error);

      // Better error handling
      let errorMessage = 'Failed to update member role. Please try again.';
      if (error.message?.includes('permission')) {
        errorMessage = "You do not have permission to change this member's role.";
      } else if (error.message?.includes('owner')) {
        errorMessage = 'Cannot modify owner roles. Contact support if needed.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Role Update Failed',
        message: errorMessage,
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemoveMember = (membershipId: number, userId: string) => {
    if (!organization) return;

    setRemoveMemberDialog({
      isOpen: true,
      membershipId,
      userId,
    });
  };

  const confirmRemoveMember = async () => {
    if (!organization) return;

    setIsRemovingMember(true);
    try {
      await organizationAPI.removeMember(removeMemberDialog.membershipId);

      // Update local state
      setMembers((prev) => prev.filter((member) => member.id !== removeMemberDialog.membershipId));

      // Close dialog
      setRemoveMemberDialog((prev) => ({ ...prev, isOpen: false }));

      // Show success message
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Member Removed',
        message: 'Member has been successfully removed from the organization.',
      });
    } catch (error: any) {
      console.error('Failed to remove member:', error);

      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Removal Failed',
        message: error.message || 'Failed to remove member. Please try again.',
      });
    } finally {
      setIsRemovingMember(false);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      case 'member':
        return 'outline';
      case 'guest':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner':
        return 'text-blue-600';
      case 'admin':
        return 'text-purple-600';
      case 'member':
        return 'text-green-600';
      case 'guest':
        return 'text-gray-600';
      default:
        return 'text-gray-600';
    }
  };

  // Helper function to get member's email or a placeholder
  const getMemberEmail = (member: ExtendedOrganizationMembership): string => {
    return member.email || member.profile?.email || `user-${member.user_id}@example.com`;
  };

  // Invitation management functions
  const handleCancelInvitation = (invitationId: number, email: string) => {
    setCancelInvitationDialog({
      isOpen: true,
      invitationId,
      email,
    });
  };

  const confirmCancelInvitation = async () => {
    if (!organization) return;

    setIsCancellingInvitation(true);
    try {
      const result = await organizationAPI.cancelInvitation(cancelInvitationDialog.invitationId);

      if (result.success) {
        // Reload pending invitations
        await loadPendingInvitations(organization.id);

        // Close dialog
        setCancelInvitationDialog({
          isOpen: false,
          invitationId: 0,
          email: '',
        });

        // Show success notification
        setNotification({
          isOpen: true,
          type: 'success',
          title: 'Invitation Cancelled',
          message: `Successfully cancelled invitation for ${cancelInvitationDialog.email}`,
        });
      } else {
        throw new Error(result.error || 'Failed to cancel invitation');
      }
    } catch (error: any) {
      console.error('Cancel invitation error:', error);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to cancel invitation. Please try again.',
      });
    } finally {
      setIsCancellingInvitation(false);
    }
  };

  const handleResendInvitation = async (invitation: PendingInvitation) => {
    if (!organization) return;

    setResendingInvitationId(invitation.id);
    try {
      const result = await organizationAPI.resendInvitation(
        organization.id,
        invitation.invited_email,
        invitation.role as any,
      );

      if (result.success) {
        // Reload pending invitations to get updated resend count
        await loadPendingInvitations(organization.id);

        // Show success notification
        setNotification({
          isOpen: true,
          type: 'success',
          title: 'Invitation Resent',
          message: `Successfully resent invitation to ${invitation.invited_email}`,
        });
      } else {
        throw new Error(result.error || 'Failed to resend invitation');
      }
    } catch (error: any) {
      console.error('Resend invitation error:', error);
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Error',
        message: error.message || 'Failed to resend invitation. Please try again.',
      });
    } finally {
      setResendingInvitationId(null);
    }
  };

  const canResendInvitation = (invitation: PendingInvitation): boolean => {
    // Check if we're within the rate limit (3 resends per day)
    if (invitation.resend_count >= 3) {
      return false;
    }

    // Check if we need to wait before next resend (if last resend was today)
    if (invitation.last_resend_at) {
      const lastResend = new Date(invitation.last_resend_at);
      const today = new Date();
      const isSameDay = lastResend.toDateString() === today.toDateString();

      if (isSameDay && invitation.resend_count >= 3) {
        return false;
      }
    }

    return true;
  };

  const getInvitationExpiryStatus = (
    expiresAt: string,
  ): {
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysRemaining: number;
  } => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diffTime = expiry.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
      isExpired: diffDays < 0,
      isExpiringSoon: diffDays <= 1 && diffDays >= 0,
      daysRemaining: Math.max(0, diffDays),
    };
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading members...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!organization || !userMembership) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Organization Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-destructive">
              The organization was not found or you don't have access to it.
            </p>
            <Link href="/protected/settings/organizations">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Organizations
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Link href={`/protected/settings/organizations/${organization?.slug}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Back to Settings</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
                <Users className="h-6 w-6 flex-shrink-0 sm:h-8 sm:w-8" />
                <span>Members</span>
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Manage members for {organization?.name}
              </p>
            </div>
          </div>
          {canManageMembers && (
            <div className="flex gap-2">
              <Button onClick={() => setIsInviteDialogOpen(true)} className="w-full sm:w-auto">
                <UserPlus className="mr-2 h-4 w-4" />
                <span className="sm:hidden">Invite</span>
                <span className="hidden sm:inline">Invite Member</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Debug Section */}
      <DebugWrapper>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">Debug Information</CardTitle>
            <CardDescription>Debugging member loading issues</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (organization) {
                    try {
                      const allMembers = await organizationAPI.getAllOrganizationMembers(
                        organization.id,
                      );
                      console.log('All members (any status):', allMembers);
                      alert(`Found ${allMembers.length} total members. Check console for details.`);
                    } catch (error) {
                      console.error('Debug error:', error);
                      alert('Error getting all members: ' + error);
                    }
                  }
                }}
                className="min-w-0 flex-1 sm:flex-none"
              >
                <span className="truncate">Debug: Get All Members</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const userInfo = await organizationAPI.getCurrentUserInfo();
                    console.log('Current user info:', userInfo);
                    alert(`Current user ID: ${userInfo.user?.id}. Check console for details.`);
                  } catch (error) {
                    console.error('Debug error:', error);
                  }
                }}
                className="min-w-0 flex-1 sm:flex-none"
              >
                <span className="truncate">Debug: Get User Info</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (organization) {
                    try {
                      const testMember = await organizationAPI.createTestMember(
                        organization.id,
                        `test-user-${Date.now()}`,
                      );
                      console.log('Created test member:', testMember);
                      alert('Test member created! Refreshing...');

                      // Reload members
                      const orgMembers = await organizationAPI.getOrganizationMembers(
                        organization.id,
                      );
                      setMembers(orgMembers);
                    } catch (error: any) {
                      console.error('Error creating test member:', error);
                      alert('Error: ' + (error.message || error));
                    }
                  }
                }}
                className="min-w-0 flex-1 sm:flex-none"
              >
                <span className="truncate">Debug: Create Test</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (members.length === 0) {
                    alert('No members to test removal with');
                    return;
                  }

                  // Get the first member that's not the current user
                  const testMember = members.find((m) => m.user_id !== userMembership?.user_id);
                  if (!testMember) {
                    alert('No other members to test removal with');
                    return;
                  }

                  try {
                    console.log('Testing removal of member:', testMember);
                    await organizationAPI.removeMember(testMember.id);
                    alert(`Successfully removed member #${testMember.id}`);

                    // Reload members
                    const orgMembers = await organizationAPI.getOrganizationMembers(
                      organization.id,
                    );
                    setMembers(orgMembers);
                  } catch (error: any) {
                    console.error('Error removing member:', error);
                    alert('Error: ' + (error.message || error));
                  }
                }}
                className="min-w-0 flex-1 sm:flex-none"
              >
                <span className="truncate">Debug: Test Remove</span>
              </Button>
            </div>
            <div className="text-sm text-yellow-700">
              <p>Organization ID: {organization?.id}</p>
              <p>Your User ID: {userMembership?.user_id}</p>
              <p>Active Members Found: {members.length}</p>
            </div>
          </CardContent>
        </Card>
      </DebugWrapper>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Organization Members ({members.length})
          </CardTitle>
          <CardDescription>People who have access to this organization</CardDescription>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <div className="space-y-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                        <span className="truncate font-medium">{getMemberEmail(member)}</span>
                        {member.user_id === userMembership?.user_id && (
                          <Badge variant="secondary" className="w-fit text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div className="block sm:hidden">
                          Joined {new Date(member.joined_at).toLocaleDateString()}
                        </div>
                        <div className="hidden sm:block">
                          Joined {new Date(member.joined_at).toLocaleDateString()} • Membership #
                          {member.id}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <Badge
                      variant={getRoleBadgeVariant(member.role)}
                      className={getRoleColor(member.role)}
                    >
                      {member.role}
                    </Badge>

                    {canManageMembers && member.id !== userMembership?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Member actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {canAssignRole(member, 'owner') && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateMemberRole(member.id, 'owner', member)}
                            >
                              <Shield className="mr-2 h-4 w-4" />
                              Make Owner
                            </DropdownMenuItem>
                          )}
                          {canAssignRole(member, 'admin') && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateMemberRole(member.id, 'admin', member)}
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Make Admin
                            </DropdownMenuItem>
                          )}
                          {canAssignRole(member, 'member') && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateMemberRole(member.id, 'member', member)}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Make Member
                            </DropdownMenuItem>
                          )}
                          {canAssignRole(member, 'guest') && (
                            <DropdownMenuItem
                              onClick={() => handleUpdateMemberRole(member.id, 'guest', member)}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Make Guest
                            </DropdownMenuItem>
                          )}

                          {/* Only show separator if there are role options above */}
                          {(canAssignRole(member, 'owner') ||
                            canAssignRole(member, 'admin') ||
                            canAssignRole(member, 'member') ||
                            canAssignRole(member, 'guest')) && <DropdownMenuSeparator />}

                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleRemoveMember(member.id, member.user_id)}
                          >
                            <UserMinus className="mr-2 h-4 w-4" />
                            Remove Member
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-medium">No members found</h3>
              <p className="text-muted-foreground">
                This organization doesn't have any members yet.
              </p>
              {canManageMembers && (
                <Button
                  className="mt-4 w-full sm:w-auto"
                  onClick={() => setIsInviteDialogOpen(true)}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite First Member
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Pending Invitations ({pendingInvitations.length})
            </CardTitle>
            <CardDescription>People who have been invited but haven't joined yet</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvitations ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-b-2 border-primary"></div>
                  <p className="text-sm text-muted-foreground">Loading invitations...</p>
                </div>
              </div>
            ) : pendingInvitations.length > 0 ? (
              <div className="space-y-4">
                {pendingInvitations.map((invitation) => {
                  const expiryStatus = getInvitationExpiryStatus(invitation.expires_at);
                  const canResend = canResendInvitation(invitation);
                  const isResending = resendingInvitationId === invitation.id;

                  return (
                    <div
                      key={invitation.id}
                      className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                          <Mail className="h-5 w-5 text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                            <span className="truncate font-medium">{invitation.invited_email}</span>
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="w-fit text-xs">
                                {invitation.user_exists ? 'Existing User' : 'New User'}
                              </Badge>
                              {expiryStatus.isExpired && (
                                <Badge variant="destructive" className="w-fit text-xs">
                                  Expired
                                </Badge>
                              )}
                              {expiryStatus.isExpiringSoon && !expiryStatus.isExpired && (
                                <Badge
                                  variant="secondary"
                                  className="w-fit bg-amber-100 text-xs text-amber-800"
                                >
                                  Expires Soon
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div className="block sm:hidden">
                              Invited {new Date(invitation.invited_at).toLocaleDateString()}
                              {expiryStatus.isExpired ? (
                                <span className="text-destructive"> • Expired</span>
                              ) : (
                                <span> • {expiryStatus.daysRemaining} days left</span>
                              )}
                            </div>
                            <div className="hidden sm:block">
                              Invited {new Date(invitation.invited_at).toLocaleDateString()} by{' '}
                              {invitation.invited_by_name}
                              {expiryStatus.isExpired ? (
                                <span className="text-destructive"> • Expired</span>
                              ) : (
                                <span> • {expiryStatus.daysRemaining} days remaining</span>
                              )}
                              {invitation.resend_count > 0 && (
                                <span>
                                  {' '}
                                  • Resent {invitation.resend_count} time
                                  {invitation.resend_count !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <Badge
                          variant={getRoleBadgeVariant(invitation.role)}
                          className={getRoleColor(invitation.role)}
                        >
                          {invitation.role}
                        </Badge>

                        <div className="flex gap-2">
                          {!expiryStatus.isExpired && canResend && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleResendInvitation(invitation)}
                              disabled={isResending}
                              className="text-xs"
                            >
                              {isResending ? (
                                <>
                                  <div className="mr-2 h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <Mail className="mr-1 h-3 w-3" />
                                  Resend
                                </>
                              )}
                            </Button>
                          )}

                          {!canResend && invitation.resend_count >= 3 && (
                            <div className="text-xs text-muted-foreground">Limit reached</div>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">Invitation actions</span>
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {!expiryStatus.isExpired && canResend && (
                                <DropdownMenuItem
                                  onClick={() => handleResendInvitation(invitation)}
                                  disabled={isResending}
                                >
                                  <Mail className="mr-2 h-4 w-4" />
                                  Resend Invitation
                                </DropdownMenuItem>
                              )}

                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() =>
                                  handleCancelInvitation(invitation.id, invitation.invited_email)
                                }
                              >
                                <UserMinus className="mr-2 h-4 w-4" />
                                Cancel Invitation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Mail className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="mt-4 text-lg font-medium">No pending invitations</h3>
                <p className="text-muted-foreground">
                  All invitations have been accepted or have expired.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite Member Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Invite Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join {organization?.name || 'the organization'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter email address"
                value={inviteForm.email}
                onChange={(e) => {
                  setInviteForm((prev) => ({ ...prev, email: e.target.value }));
                  if (inviteErrors.email) {
                    setInviteErrors((prev) => ({ ...prev, email: '' }));
                  }
                }}
                className={inviteErrors.email ? 'border-destructive' : ''}
              />

              {/* User existence status */}
              {inviteForm.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteForm.email) && (
                <div className="flex items-center gap-2 text-sm">
                  {userExistsStatus.isChecking ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                      <span className="text-muted-foreground">Checking user...</span>
                    </>
                  ) : userExistsStatus.exists === true ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-700">User exists - invitation will be sent</span>
                    </>
                  ) : userExistsStatus.exists === false ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="text-amber-700">
                        User doesn't exist - signup invitation will be sent
                      </span>
                    </>
                  ) : null}
                </div>
              )}

              {inviteErrors.email && (
                <p className="text-sm text-destructive">{inviteErrors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={inviteForm.role}
                onValueChange={(value: OrganizationRole) => {
                  setInviteForm((prev) => ({ ...prev, role: value }));
                  if (inviteErrors.role) {
                    setInviteErrors((prev) => ({ ...prev, role: '' }));
                  }
                }}
              >
                <SelectTrigger className={inviteErrors.role ? 'border-destructive' : ''}>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="guest">Guest - Limited access</SelectItem>
                  <SelectItem value="member">Member - Standard access</SelectItem>
                  <SelectItem value="admin">Admin - Can manage members</SelectItem>
                  {userMembership?.role === 'owner' && (
                    <SelectItem value="owner">Owner - Full access</SelectItem>
                  )}
                </SelectContent>
              </Select>
              {inviteErrors.role && <p className="text-sm text-destructive">{inviteErrors.role}</p>}
            </div>

            {inviteErrors.submit && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {inviteErrors.submit}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsInviteDialogOpen(false);
                setInviteForm({ email: '', role: 'member' });
                setInviteErrors({});
                setUserExistsStatus({
                  isChecking: false,
                  exists: null,
                  email: '',
                });
              }}
              disabled={isInviting}
            >
              Cancel
            </Button>
            <Button onClick={handleInviteMember} disabled={isInviting}>
              <Mail className="mr-2 h-4 w-4" />
              {isInviting ? 'Sending...' : 'Send Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Role Change Confirmation Dialog */}
      <Dialog
        open={roleChangeDialog.isOpen}
        onOpenChange={(open) => setRoleChangeDialog((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {roleChangeDialog.isOwnerPromotion
                ? 'Promote to Owner'
                : `Change Role to ${roleChangeDialog.newRole}`}
            </DialogTitle>
            <DialogDescription>
              {roleChangeDialog.isOwnerPromotion
                ? 'This will give full access and control over the organization.'
                : `This will change the member's permissions and access level.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">Attention Required</h3>
                  {roleChangeDialog.isOwnerPromotion ? (
                    <div className="mt-2">
                      <p>
                        You're about to promote this member to <strong>Owner</strong>. Owners have
                        full control over the organization, including:
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>Complete access to all organization settings</li>
                        <li>Ability to add or remove any member</li>
                        <li>Ability to delete the organization</li>
                        <li>Access to billing and payment information</li>
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2">
                      You're about to change this member's role from{' '}
                      <strong>{roleChangeDialog.targetMember?.role}</strong> to{' '}
                      <strong>{roleChangeDialog.newRole}</strong>. This will update their
                      permissions within the organization.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleChangeDialog((prev) => ({ ...prev, isOpen: false }))}
              disabled={isUpdatingRole}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmRoleChange}
              disabled={isUpdatingRole}
              variant={roleChangeDialog.isOwnerPromotion ? 'destructive' : 'default'}
            >
              {isUpdatingRole ? 'Updating...' : 'Confirm Change'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <Dialog
        open={removeMemberDialog.isOpen}
        onOpenChange={(open) => setRemoveMemberDialog((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Remove Member</DialogTitle>
            <DialogDescription>
              This will revoke the member's access to the organization.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium">Warning</h3>
                  <p className="mt-2">
                    You're about to remove this member from the organization. They will lose access
                    to all projects, files, and settings.
                  </p>
                  <p className="mt-2">
                    This action cannot be undone. The member will need to be invited again to regain
                    access.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRemoveMemberDialog((prev) => ({ ...prev, isOpen: false }))}
              disabled={isRemovingMember}
            >
              Cancel
            </Button>
            <Button onClick={confirmRemoveMember} disabled={isRemovingMember} variant="destructive">
              {isRemovingMember ? 'Removing...' : 'Remove Member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Invitation Confirmation Dialog */}
      <Dialog
        open={cancelInvitationDialog.isOpen}
        onOpenChange={(open) => setCancelInvitationDialog((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cancel Invitation</DialogTitle>
            <DialogDescription>
              This will cancel the pending invitation and prevent the user from joining.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-amber-50 p-4 text-sm text-amber-800">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-amber-800">Confirm Cancellation</h3>
                  <p className="mt-2">
                    You're about to cancel the invitation for{' '}
                    <strong>{cancelInvitationDialog.email}</strong>.
                  </p>
                  <p className="mt-2">
                    This action cannot be undone. If you want to invite this user later, you'll need
                    to send a new invitation.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelInvitationDialog((prev) => ({ ...prev, isOpen: false }))}
              disabled={isCancellingInvitation}
            >
              Keep Invitation
            </Button>
            <Button
              onClick={confirmCancelInvitation}
              disabled={isCancellingInvitation}
              variant="destructive"
            >
              {isCancellingInvitation ? 'Cancelling...' : 'Cancel Invitation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Dialog */}
      <Dialog
        open={notification.isOpen}
        onOpenChange={(open) => setNotification((prev) => ({ ...prev, isOpen: open }))}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle
              className={notification.type === 'error' ? 'text-destructive' : 'text-green-600'}
            >
              {notification.type === 'error' ? (
                <div className="flex items-center">
                  <AlertCircle className="mr-2 h-5 w-5" />
                  {notification.title}
                </div>
              ) : (
                <div className="flex items-center">
                  <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
                  {notification.title}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="py-3">
            <p
              className={
                notification.type === 'error' ? 'text-destructive/80' : 'text-muted-foreground'
              }
            >
              {notification.message}
            </p>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
              variant={notification.type === 'error' ? 'destructive' : 'default'}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
