import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { projectAPI } from '@/lib/api/projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, FolderOpen, Building2, User } from 'lucide-react';
import Link from 'next/link';

interface ProjectInvitationSuccessPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ redirect?: string }>;
}

async function ProjectInvitationSuccessContent({ 
  token, 
  isPostSignup 
}: { 
  token: string; 
  isPostSignup?: boolean;
}) {
  const supabase = await createClient();
  
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    notFound();
  }

  let invitation;
  
  try {
    invitation = await projectAPI.getProjectInvitationByToken(token);
  } catch (error) {
    console.error('Error fetching project invitation:', error);
    notFound();
  }

  // Get project details for navigation
  let projectSlug: string | null = null;
  try {
    const project = await projectAPI.getProject(invitation.project_id);
    if (project) {
      // For now, we'll use the project ID since there's no slug in the current schema
      projectSlug = project.id.toString();
    }
  } catch (error) {
    console.error('Error fetching project details:', error);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <CardTitle className="text-green-600">
          {isPostSignup ? 'Welcome to Conpanion!' : 'Project Invitation Accepted!'}
        </CardTitle>
        <CardDescription>
          {isPostSignup 
            ? 'Your account has been created and you have successfully joined the project'
            : 'You have successfully joined the project'
          }
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
          
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="font-medium">
                {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
              </p>
              <p className="text-sm text-muted-foreground">Your role</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg bg-green-50 p-3">
          <p className="text-sm text-green-800">
            🎉 You're now a member of this project! You can start collaborating with your team immediately.
          </p>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col gap-3">
        <div className="flex gap-3 w-full">
          {projectSlug ? (
            <Button asChild className="flex-1">
              <Link href={`/protected/settings/projects/${projectSlug}`}>
                Go to Project
              </Link>
            </Button>
          ) : (
            <Button asChild className="flex-1">
              <Link href="/protected">
                Go to Dashboard
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" className="flex-1">
            <Link href="/protected/settings/projects">
              View All Projects
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

export default async function ProjectInvitationSuccessPage({ 
  params, 
  searchParams 
}: ProjectInvitationSuccessPageProps) {
  const { token } = await params;
  const { redirect } = await searchParams;

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
              {[...Array(3)].map((_, i) => (
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
        <ProjectInvitationSuccessContent 
          token={token} 
          isPostSignup={redirect === 'true'}
        />
      </Suspense>
    </div>
  );
}