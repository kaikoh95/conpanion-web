'use client';

import React, { useEffect, useState } from 'react';
import { useProject } from '@/contexts/ProjectContext';
import { useAuth } from '@/hooks/useAuth';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  FolderOpen,
  Users,
  Plus,
  ArrowLeft,
  MoreHorizontal,
  Mail,
  Crown,
  Shield,
  User,
  UserX,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Project, ProjectMembership, ProjectMember } from '@/lib/types/project';
import { projectAPI } from '@/lib/api/projects';

export default function ProjectMembersPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const { memberships, current } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [membership, setMembership] = useState<ProjectMembership | null>(null);
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Role change confirmation dialog state
  const [roleChangeDialog, setRoleChangeDialog] = useState<{
    isOpen: boolean;
    member: ProjectMember | null;
    newRole: string;
    isOwnerPromotion: boolean;
  }>({
    isOpen: false,
    member: null,
    newRole: '',
    isOwnerPromotion: false,
  });

  // Member management state
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isRemovingMember, setIsRemovingMember] = useState(false);
  const [removeMemberDialog, setRemoveMemberDialog] = useState<{
    isOpen: boolean;
    member: ProjectMember | null;
  }>({
    isOpen: false,
    member: null,
  });

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

  const projectId = parseInt(params.id as string);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'member':
        return <User className="h-4 w-4 text-green-500" />;
      case 'guest':
        return <UserX className="h-4 w-4 text-gray-500" />;
      default:
        return <User className="h-4 w-4" />;
    }
  };

  const getRoleBadgeVariant = (role: string): 'default' | 'secondary' | 'outline' => {
    switch (role) {
      case 'owner':
        return 'default';
      case 'admin':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  // Helper function to check if a member is the current user
  const isCurrentUser = (member: ProjectMember): boolean => {
    return user?.id === member.user_id;
  };

  useEffect(() => {
    const loadProjectAndMembers = async () => {
      if (!projectId || isNaN(projectId)) {
        router.push('/protected/settings/projects');
        return;
      }

      try {
        setIsLoading(true);

        // Find the project in memberships first
        const foundMembership = memberships.find((m) => m.project_id === projectId);
        if (!foundMembership) {
          // User doesn't have access to this project
          router.push('/protected/settings/projects');
          return;
        }

        setMembership(foundMembership);
        setProject(foundMembership.project);

        // Load real project members from the database
        const members = await projectAPI.getProjectMembers(projectId);

        // Sort members: current user at top, then by role hierarchy, then by name
        const sortedMembers = [...members].sort((a, b) => {
          // Put current user at top
          if (isCurrentUser(a)) return -1;
          if (isCurrentUser(b)) return 1;

          // Then sort by role hierarchy
          const roleOrder = { owner: 1, admin: 2, member: 3, guest: 4 };
          const aOrder = roleOrder[a.role as keyof typeof roleOrder] || 5;
          const bOrder = roleOrder[b.role as keyof typeof roleOrder] || 5;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          // Finally sort by name
          const aName = a.user_name || a.user_email || '';
          const bName = b.user_name || b.user_email || '';
          return aName.localeCompare(bName);
        });

        setProjectMembers(sortedMembers);
      } catch (error: any) {
        console.error('Failed to load project and members:', error);

        setNotification({
          isOpen: true,
          type: 'error',
          title: 'Failed to Load Members',
          message: error.message || 'Unable to load project members. Please try again.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (memberships.length > 0 && user) {
      loadProjectAndMembers();
    }
  }, [memberships, projectId, router, user]);

  const handleInviteMember = async () => {
    if (!inviteEmail.trim()) {
      setInviteMessage({
        type: 'error',
        text: 'Please enter a valid email address',
      });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
      setInviteMessage({
        type: 'error',
        text: 'Please enter a valid email address',
      });
      return;
    }

    setIsInviting(true);
    try {
      // Invite user to project using real API
      await projectAPI.inviteUserToProject(projectId, inviteEmail, inviteRole);

      setInviteMessage({
        type: 'success',
        text: `Successfully invited ${inviteEmail} to the project`,
      });

      // Reset form
      setInviteEmail('');
      setInviteRole('member');
      setShowInviteDialog(false);

      // Reload members to show the new member
      const members = await projectAPI.getProjectMembers(projectId);
      setProjectMembers(members);

      // Show success notification
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Invitation Sent',
        message: `Successfully invited ${inviteEmail} to join as ${inviteRole}.`,
      });
    } catch (error: any) {
      setInviteMessage({
        type: 'error',
        text: error.message || 'Failed to send invitation',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const canManageMembers = membership?.role === 'owner' || membership?.role === 'admin';

  // Helper function to determine what roles the current user can assign
  const canAssignRole = (targetMember: ProjectMember, newRole: string): boolean => {
    if (!membership || !user) return false;

    // Can't modify your own role
    if (isCurrentUser(targetMember)) return false;

    const currentUserRole = membership.role;
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

  const handleUpdateMemberRole = (member: ProjectMember, newRole: string) => {
    if (!membership || !user) return;

    // Additional validation
    const currentUserRole = membership.role;
    const targetCurrentRole = member.role;

    // Role hierarchy validation
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
        message: 'Only project owners can promote members to owner role.',
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
      member,
      newRole,
      isOwnerPromotion: newRole === 'owner',
    });
  };

  const confirmRoleChange = async () => {
    if (!roleChangeDialog.member) return;

    setIsUpdatingRole(true);
    try {
      await projectAPI.updateMemberRole(roleChangeDialog.member.id, roleChangeDialog.newRole);

      // Update local state
      setProjectMembers((prev) =>
        prev.map((m) =>
          m.id === roleChangeDialog.member!.id ? { ...m, role: roleChangeDialog.newRole } : m,
        ),
      );

      // Close dialog
      setRoleChangeDialog({ isOpen: false, member: null, newRole: '', isOwnerPromotion: false });

      // Show success notification
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Role Updated',
        message: `Successfully updated ${roleChangeDialog.member.user_name}'s role to ${roleChangeDialog.newRole}.`,
      });
    } catch (error: any) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Role Update Failed',
        message: error.message || 'Failed to update member role. Please try again.',
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleRemoveMember = (member: ProjectMember) => {
    if (!user || isCurrentUser(member)) {
      setNotification({
        isOpen: true,
        type: 'error',
        title: 'Cannot Remove Yourself',
        message:
          'You cannot remove yourself from the project. Ask another owner or admin to remove you.',
      });
      return;
    }

    setRemoveMemberDialog({
      isOpen: true,
      member,
    });
  };

  const confirmRemoveMember = async () => {
    if (!removeMemberDialog.member) return;

    setIsRemovingMember(true);
    try {
      await projectAPI.removeMember(removeMemberDialog.member.id);

      // Update local state
      setProjectMembers((prev) => prev.filter((m) => m.id !== removeMemberDialog.member!.id));

      // Close dialog
      setRemoveMemberDialog({ isOpen: false, member: null });

      // Show success notification
      setNotification({
        isOpen: true,
        type: 'success',
        title: 'Member Removed',
        message: `Successfully removed ${removeMemberDialog.member.user_name} from the project.`,
      });
    } catch (error: any) {
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

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
            <p>Loading project members...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!project || !membership) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Project Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">
              The requested project was not found or you don't have access to it.
            </p>
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
            <Link href={`/protected/settings/projects/${project.id}`}>
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Back to Project</span>
                <span className="sm:hidden">Back</span>
              </Button>
            </Link>
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
                <Users className="h-6 w-6 flex-shrink-0 sm:h-8 sm:w-8" />
                <span>Project Members</span>
              </h1>
              <p className="text-sm text-muted-foreground sm:text-base">
                Manage members and permissions for {project.name}
              </p>
            </div>
          </div>
          {canManageMembers && (
            <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="sm:hidden">Invite</span>
                  <span className="hidden sm:inline">Invite Member</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invite Project Member</DialogTitle>
                  <DialogDescription>
                    Send an invitation to join this project. They will receive an email with
                    instructions to join.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="member@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="guest">Guest</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        {membership.role === 'owner' && (
                          <SelectItem value="owner">Owner</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowInviteDialog(false);
                      setInviteEmail('');
                      setInviteRole('member');
                      setInviteMessage(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleInviteMember} disabled={isInviting}>
                    {isInviting ? 'Sending...' : 'Send Invitation'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Invite Message */}
      {inviteMessage && (
        <Card
          className={inviteMessage.type === 'error' ? 'border-destructive' : 'border-green-500'}
        >
          <CardContent className="pt-4">
            <p className={inviteMessage.type === 'error' ? 'text-destructive' : 'text-green-600'}>
              {inviteMessage.text}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle>Project Members ({projectMembers.length})</CardTitle>
          <CardDescription>People who have access to this project and their roles</CardDescription>
        </CardHeader>
        <CardContent>
          {projectMembers.length > 0 ? (
            <div className="space-y-4">
              {/* Desktop Table - Hidden on mobile */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectMembers.map((member) => (
                      <TableRow key={member.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                              <User className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 font-medium">
                                {member.user_name || 'Unknown User'}
                                {isCurrentUser(member) && (
                                  <Badge variant="secondary" className="text-xs">
                                    You
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {member.user_email || 'No email'}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getRoleIcon(member.role)}
                            <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(member.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {canManageMembers && !isCurrentUser(member) && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {/* Role change options */}
                                {canAssignRole(member, 'owner') && (
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateMemberRole(member, 'owner')}
                                    disabled={isUpdatingRole}
                                  >
                                    <Crown className="mr-2 h-4 w-4" />
                                    Make Owner
                                  </DropdownMenuItem>
                                )}
                                {canAssignRole(member, 'admin') && (
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateMemberRole(member, 'admin')}
                                    disabled={isUpdatingRole}
                                  >
                                    <Shield className="mr-2 h-4 w-4" />
                                    Make Admin
                                  </DropdownMenuItem>
                                )}
                                {canAssignRole(member, 'member') && (
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateMemberRole(member, 'member')}
                                    disabled={isUpdatingRole}
                                  >
                                    <User className="mr-2 h-4 w-4" />
                                    Make Member
                                  </DropdownMenuItem>
                                )}
                                {canAssignRole(member, 'guest') && (
                                  <DropdownMenuItem
                                    onClick={() => handleUpdateMemberRole(member, 'guest')}
                                    disabled={isUpdatingRole}
                                  >
                                    <UserX className="mr-2 h-4 w-4" />
                                    Make Guest
                                  </DropdownMenuItem>
                                )}

                                {/* Only show separator if there are role options above */}
                                {(canAssignRole(member, 'owner') ||
                                  canAssignRole(member, 'admin') ||
                                  canAssignRole(member, 'member') ||
                                  canAssignRole(member, 'guest')) && <DropdownMenuSeparator />}

                                {/* Remove member option - prevent removing last owner and yourself */}
                                {(member.role !== 'owner' ||
                                  projectMembers.filter((m) => m.role === 'owner').length > 1) && (
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => handleRemoveMember(member)}
                                    disabled={isRemovingMember}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove Member
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          {isCurrentUser(member) && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Cards - Shown only on mobile */}
              <div className="space-y-3 sm:hidden">
                {projectMembers.map((member) => (
                  <div key={member.id} className="flex flex-col gap-3 rounded-lg border p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 font-medium">
                            <span className="truncate">{member.user_name || 'Unknown User'}</span>
                            {isCurrentUser(member) && (
                              <Badge variant="secondary" className="w-fit text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                          <div className="truncate text-sm text-muted-foreground">
                            {member.user_email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getRoleIcon(member.role)}
                        <Badge variant={getRoleBadgeVariant(member.role)}>{member.role}</Badge>
                        <span className="text-sm text-muted-foreground">
                          • {new Date(member.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {canManageMembers && !isCurrentUser(member) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                              <span className="sr-only">Member actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {/* Role change options */}
                            {canAssignRole(member, 'owner') && (
                              <DropdownMenuItem
                                onClick={() => handleUpdateMemberRole(member, 'owner')}
                                disabled={isUpdatingRole}
                              >
                                <Crown className="mr-2 h-4 w-4" />
                                Make Owner
                              </DropdownMenuItem>
                            )}
                            {canAssignRole(member, 'admin') && (
                              <DropdownMenuItem
                                onClick={() => handleUpdateMemberRole(member, 'admin')}
                                disabled={isUpdatingRole}
                              >
                                <Shield className="mr-2 h-4 w-4" />
                                Make Admin
                              </DropdownMenuItem>
                            )}
                            {canAssignRole(member, 'member') && (
                              <DropdownMenuItem
                                onClick={() => handleUpdateMemberRole(member, 'member')}
                                disabled={isUpdatingRole}
                              >
                                <User className="mr-2 h-4 w-4" />
                                Make Member
                              </DropdownMenuItem>
                            )}
                            {canAssignRole(member, 'guest') && (
                              <DropdownMenuItem
                                onClick={() => handleUpdateMemberRole(member, 'guest')}
                                disabled={isUpdatingRole}
                              >
                                <UserX className="mr-2 h-4 w-4" />
                                Make Guest
                              </DropdownMenuItem>
                            )}

                            {/* Only show separator if there are role options above */}
                            {(canAssignRole(member, 'owner') ||
                              canAssignRole(member, 'admin') ||
                              canAssignRole(member, 'member') ||
                              canAssignRole(member, 'guest')) && <DropdownMenuSeparator />}

                            {/* Remove member option - prevent removing last owner and yourself */}
                            {(member.role !== 'owner' ||
                              projectMembers.filter((m) => m.role === 'owner').length > 1) && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleRemoveMember(member)}
                                disabled={isRemovingMember}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove Member
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {isCurrentUser(member) && (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          —
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">No members found</h3>
              <p className="text-muted-foreground">This project doesn't have any members yet.</p>
              {canManageMembers && (
                <Button className="mt-4 w-full sm:w-auto" onClick={() => setShowInviteDialog(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Invite First Member
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Permissions Info */}
      <Card>
        <CardHeader>
          <CardTitle>Role Permissions</CardTitle>
          <CardDescription>Understanding what each role can do in this project</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Crown className="mt-0.5 h-5 w-5 text-yellow-500" />
              <div>
                <h4 className="font-medium">Owner</h4>
                <p className="text-sm text-muted-foreground">
                  Full access to all project features, settings, and member management. Can delete
                  the project.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <Shield className="mt-0.5 h-5 w-5 text-blue-500" />
              <div>
                <h4 className="font-medium">Admin</h4>
                <p className="text-sm text-muted-foreground">
                  Can manage project settings, invite members, and manage most project features.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <User className="mt-0.5 h-5 w-5 text-green-500" />
              <div>
                <h4 className="font-medium">Member</h4>
                <p className="text-sm text-muted-foreground">
                  Can access project content, create tasks, forms, and site diaries.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border p-4">
              <UserX className="mt-0.5 h-5 w-5 text-gray-500" />
              <div>
                <h4 className="font-medium">Guest</h4>
                <p className="text-sm text-muted-foreground">
                  Limited read-only access to specific project content.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

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
                ? 'This will give full access and control over the project.'
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
                        You're about to promote {roleChangeDialog.member?.user_name} to{' '}
                        <strong>Owner</strong>. Owners have full control over the project,
                        including:
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        <li>Complete access to all project settings</li>
                        <li>Ability to add or remove any member</li>
                        <li>Ability to delete the project</li>
                        <li>Access to all project data and configurations</li>
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-2">
                      You're about to change {roleChangeDialog.member?.user_name}'s role from{' '}
                      <strong>{roleChangeDialog.member?.role}</strong> to{' '}
                      <strong>{roleChangeDialog.newRole}</strong>. This will update their
                      permissions within the project.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() =>
                setRoleChangeDialog({
                  isOpen: false,
                  member: null,
                  newRole: '',
                  isOwnerPromotion: false,
                })
              }
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
              This will revoke the member's access to the project.
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
                    You're about to remove {removeMemberDialog.member?.user_name} from the project.
                    They will lose access to all project content, tasks, forms, and settings.
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
              onClick={() => setRemoveMemberDialog({ isOpen: false, member: null })}
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
