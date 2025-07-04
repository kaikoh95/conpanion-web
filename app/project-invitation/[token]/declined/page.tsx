import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { projectAPI } from '@/lib/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { XCircle, FolderOpen, Building2 } from 'lucide-react';
import Link from 'next/link';

interface ProjectInvitationDeclinedPageProps {
  params: Promise<{ token: string }>;
}

async function ProjectInvitationDeclinedContent({ token }: { token: string }) {
  let invitation;
  
  try {
    invitation = await projectAPI.getProjectInvitationByToken(token);
  } catch (error) {
    console.error('Error fetching project invitation:', error);
    notFound();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <XCircle className="h-8 w-8 text-gray-600" />
        </div>
        <CardTitle className="text-gray-600">Project Invitation Declined</CardTitle>
        <CardDescription>
          You have declined the invitation to join the project
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
          
          <div className="flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">{invitation.organization_name}</p>
              <p className="text-sm text-muted-foreground">Organization</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-sm text-gray-700">
            The invitation has been marked as declined. If you change your mind, you'll need to ask the project administrator for a new invitation.
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        <div className="flex gap-3 w-full">
          <Button asChild className="flex-1">
            <Link href="/protected">
              Go to Dashboard
            </Link>
          </Button>
          <Button asChild variant="outline" className="flex-1">
            <Link href="/sign-in">
              Sign In
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default async function ProjectInvitationDeclinedPage({ 
  params 
}: ProjectInvitationDeclinedPageProps) {
  const { token } = await params;

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Suspense fallback={
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="animate-pulse">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-200"></div>
              <div className="h-6 w-3/4 mx-auto bg-gray-200 rounded"></div>
              <div className="h-4 w-1/2 mx-auto bg-gray-200 rounded mt-2"></div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="animate-pulse space-y-3">
              {[...Array(2)].map((_, i) => (
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
        <ProjectInvitationDeclinedContent token={token} />
      </Suspense>
    </div>
  );
}