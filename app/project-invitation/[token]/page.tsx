import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { projectAPI } from '@/lib/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Mail, User, Calendar, Building2 } from 'lucide-react';
import Link from 'next/link';

interface ProjectInvitationPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

async function ProjectInvitationContent({ token, error }: { token: string; error?: string }) {
  const supabase = await createClient();
  
  // Check if user is already authenticated
  const { data: { user } } = await supabase.auth.getUser();
  
  let invitation;
  
  try {
    invitation = await projectAPI.getProjectInvitationByToken(token);
    
    if (!invitation) {
      notFound();
    }
  } catch (error) {
    console.error('Error fetching project invitation:', error);
    notFound();
  }

  // Check if invitation is expired
  if (invitation.is_expired) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-red-600">Invitation Expired</CardTitle>
          <CardDescription>
            This project invitation has expired and is no longer valid.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Please contact the project administrator for a new invitation.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Button asChild variant="outline">
            <Link href="/sign-in">Go to Sign In</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // If user is not authenticated, redirect to signin
  if (!user) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/project-invitation/${token}`)}`);
  }

  // If user is authenticated, show acceptance options
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <FolderOpen className="h-6 w-6 text-blue-600" />
        </div>
        <CardTitle>Project Invitation</CardTitle>
        <CardDescription>
          You've been invited to join a project
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{invitation.project_name}</p>
              <p className="text-sm text-muted-foreground">Project</p>
            </div>
          </div>
          
          {invitation.project_description && (
            <div className="flex items-center gap-3">
              <div className="h-4 w-4"></div>
              <div>
                <p className="text-sm text-muted-foreground">{invitation.project_description}</p>
              </div>
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{invitation.organization_name}</p>
              <p className="text-sm text-muted-foreground">Organization</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{invitation.invited_by_name}</p>
              <p className="text-sm text-muted-foreground">Invited by</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{invitation.invited_email}</p>
              <p className="text-sm text-muted-foreground">Invitation email</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {new Date(invitation.expires_at).toLocaleDateString()}
              </p>
              <p className="text-sm text-muted-foreground">Expires on</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 p-3">
          <p className="text-sm text-blue-800">
            <strong>Role:</strong> {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        {error && (
          <div className="w-full rounded-lg bg-red-50 p-3 text-center">
            <p className="text-sm text-red-800">{decodeURIComponent(error)}</p>
          </div>
        )}
        
        <div className="flex gap-3 w-full">
          <form action={`/api/project-invitations/${token}/accept`} method="POST" className="flex-1">
            <Button type="submit" className="w-full">
              Accept Invitation
            </Button>
          </form>
          <form action={`/api/project-invitations/${token}/decline`} method="POST" className="flex-1">
            <Button type="submit" variant="outline" className="w-full">
              Decline
            </Button>
          </form>
        </div>
      </CardFooter>
    </Card>
  );
}

export default async function ProjectInvitationPage({ params, searchParams }: ProjectInvitationPageProps) {
  const { token } = await params;
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Suspense fallback={
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="animate-pulse">
              <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gray-200"></div>
              <div className="h-6 w-3/4 mx-auto bg-gray-200 rounded"></div>
              <div className="h-4 w-1/2 mx-auto bg-gray-200 rounded mt-2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-4 w-4 bg-gray-200 rounded"></div>
                  <div className="flex-1">
                    <div className="h-4 w-3/4 bg-gray-200 rounded"></div>
                    <div className="h-3 w-1/2 bg-gray-200 rounded mt-1"></div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      }>
        <ProjectInvitationContent token={token} error={error} />
      </Suspense>
    </div>
  );
}