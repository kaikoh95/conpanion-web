'use client';

import React, { useState, useEffect } from 'react';
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
  DialogTrigger,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertCircle, Mail, Plus, Users, Crown, Shield, User as UserIcon } from 'lucide-react';
import { projectAPI } from '@/lib/api/projects';

interface OrganizationMember {
  user_id: string;
  user_email: string;
  user_name: string;
  organization_role: string;
  is_already_project_member: boolean;
}

interface ProjectInvitationDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvitationSent: () => void;
}

export function ProjectInvitationDialog({ 
  projectId, 
  open, 
  onOpenChange, 
  onInvitationSent 
}: ProjectInvitationDialogProps) {
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);
  const [inviteMessage, setInviteMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-500" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-500" />;
      case 'member':
        return <UserIcon className="h-4 w-4 text-green-500" />;
      default:
        return <UserIcon className="h-4 w-4" />;
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

  const getInitials = (name: string, email: string) => {
    if (name && name.trim()) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    return email.slice(0, 2).toUpperCase();
  };

  const loadOrganizationMembers = async () => {
    try {
      setIsLoading(true);
      const members = await projectAPI.getOrganizationMembersForInvitation(projectId);
      setOrganizationMembers(members);
    } catch (error) {
      console.error('Failed to load organization members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadOrganizationMembers();
      // Reset form when dialog opens
      setInviteEmail('');
      setInviteRole('member');
      setSelectedMember(null);
      setInviteMessage(null);
    }
  }, [open, projectId]);

  const handleInviteByEmail = async () => {
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
      const result = await projectAPI.inviteUserToProjectByEmail(projectId, inviteEmail, inviteRole);

      if (result.success) {
        setInviteMessage({
          type: 'success',
          text: result.message || `Successfully invited ${inviteEmail} to the project`,
        });

        // Reset form
        setInviteEmail('');
        setInviteRole('member');
        
        // Reload members to update the list
        await loadOrganizationMembers();
        
        // Notify parent component
        onInvitationSent();
        
        // Close dialog after success
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        // Handle specific error cases
        if (result.error_code === 'NOT_ORGANIZATION_MEMBER') {
          setInviteMessage({
            type: 'error',
            text: 'This user must be invited to the organization first before they can be invited to projects.',
          });
        } else {
          setInviteMessage({
            type: 'error',
            text: result.error || 'Failed to send invitation',
          });
        }
      }
    } catch (error: any) {
      setInviteMessage({
        type: 'error',
        text: error.message || 'Failed to send invitation',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleInviteMember = async (member: OrganizationMember) => {
    setIsInviting(true);
    setSelectedMember(member);
    try {
      const result = await projectAPI.inviteUserToProjectByEmail(projectId, member.user_email, inviteRole);

      if (result.success) {
        setInviteMessage({
          type: 'success',
          text: result.message || `Successfully invited ${member.user_name} to the project`,
        });

        // Reload members to update the list
        await loadOrganizationMembers();
        
        // Notify parent component
        onInvitationSent();
        
        // Close dialog after success
        setTimeout(() => {
          onOpenChange(false);
        }, 1500);
      } else {
        setInviteMessage({
          type: 'error',
          text: result.error || 'Failed to send invitation',
        });
      }
    } catch (error: any) {
      setInviteMessage({
        type: 'error',
        text: error.message || 'Failed to send invitation',
      });
    } finally {
      setIsInviting(false);
      setSelectedMember(null);
    }
  };

  const availableMembers = organizationMembers.filter(member => !member.is_already_project_member);
  const existingMembers = organizationMembers.filter(member => member.is_already_project_member);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Invite Members to Project
          </DialogTitle>
          <DialogDescription>
            Invite organization members to join this project. Only users who are already members of the organization can be invited.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="browse" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="browse">Browse Members</TabsTrigger>
            <TabsTrigger value="email">Invite by Email</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4" />
              <span className="text-sm font-medium">Organization Members</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-4 max-h-80 overflow-y-auto">
                {availableMembers.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Available to Invite ({availableMembers.length})
                    </Label>
                    {availableMembers.map((member) => (
                      <Card key={member.user_id} className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-xs">
                                {getInitials(member.user_name, member.user_email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.user_name}</p>
                              <p className="text-sm text-muted-foreground">{member.user_email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getRoleBadgeVariant(member.organization_role)} className="flex items-center gap-1">
                              {getRoleIcon(member.organization_role)}
                              {member.organization_role}
                            </Badge>
                            <Button
                              size="sm"
                              onClick={() => handleInviteMember(member)}
                              disabled={isInviting}
                            >
                              {isInviting && selectedMember?.user_id === member.user_id ? (
                                'Inviting...'
                              ) : (
                                'Invite'
                              )}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No organization members available to invite.</p>
                    <p className="text-sm mt-1">All organization members are already part of this project.</p>
                  </div>
                )}

                {existingMembers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-muted-foreground">
                      Already Project Members ({existingMembers.length})
                    </Label>
                    {existingMembers.map((member) => (
                      <Card key={member.user_id} className="p-3 bg-muted/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-10 w-10">
                              <AvatarFallback className="text-xs">
                                {getInitials(member.user_name, member.user_email)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.user_name}</p>
                              <p className="text-sm text-muted-foreground">{member.user_email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={getRoleBadgeVariant(member.organization_role)} className="flex items-center gap-1">
                              {getRoleIcon(member.organization_role)}
                              {member.organization_role}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              Already Member
                            </Badge>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="email" className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="h-4 w-4" />
              <span className="text-sm font-medium">Invite by Email</span>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 p-3 border border-amber-200">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <p className="text-sm text-amber-800">
                    Only users who are already members of the organization can be invited to projects.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="Enter email address"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    disabled={isInviting}
                  />
                </div>

                <div>
                  <Label htmlFor="invite-role">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole} disabled={isInviting}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {inviteMessage && (
                  <div className={`p-3 rounded-lg ${
                    inviteMessage.type === 'success' 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <p className={`text-sm ${
                      inviteMessage.type === 'success' ? 'text-green-800' : 'text-red-800'
                    }`}>
                      {inviteMessage.text}
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleInviteByEmail}
                  disabled={isInviting || !inviteEmail.trim()}
                  className="w-full"
                >
                  {isInviting ? 'Sending Invitation...' : 'Send Invitation'}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}