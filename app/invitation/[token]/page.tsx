import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { OrganizationAPI } from '@/lib/api/organizations';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Mail, User, Calendar } from 'lucide-react';
import Link from 'next/link';

interface InvitationPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}

async function InvitationContent({ token, error }: { token: string; error?: string }) {
  const supabase = await createClient();

  // Check if user is already authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let invitation;

  try {
    const orgApi = new OrganizationAPI();
    invitation = await orgApi.getInvitationByToken(token);

    if (!invitation) {
      notFound();
    }
  } catch (error) {
    console.error('Error fetching invitation:', error);
    notFound();
  }

  // Check if invitation is expired
  if (new Date() > new Date(invitation.expires_at)) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-red-600">Invitation Expired</CardTitle>
          <CardDescription>This invitation has expired and is no longer valid.</CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Please contact the organization administrator for a new invitation.
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

  // If user is authenticated and email matches, show acceptance options
  if (user && user.email === invitation.invited_email) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <Building2 className="h-6 w-6 text-blue-600" />
          </div>
          <CardTitle>Organization Invitation</CardTitle>
          <CardDescription>You've been invited to join an organization</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-3">
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
              <strong>Role:</strong>{' '}
              {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
            </p>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          {error && (
            <div className="w-full rounded-lg bg-red-50 p-3 text-center">
              <p className="text-sm text-red-800">{decodeURIComponent(error)}</p>
            </div>
          )}

          <div className="flex w-full gap-3">
            <form action={`/api/invitations/${token}/accept`} method="POST" className="flex-1">
              <Button type="submit" className="w-full">
                Accept Invitation
              </Button>
            </form>
            <form action={`/api/invitations/${token}/decline`} method="POST" className="flex-1">
              <Button type="submit" variant="outline" className="w-full">
                Decline
              </Button>
            </form>
          </div>
        </CardFooter>
      </Card>
    );
  }

  // If user is not authenticated, redirect to signup (outside try-catch to avoid NEXT_REDIRECT error)
  if (!user) {
    redirect(`/sign-up?invitation=${token}`);
  }

  // If user is authenticated but email doesn't match
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-amber-600">Email Mismatch</CardTitle>
        <CardDescription>This invitation was sent to a different email address</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center">
        <div className="rounded-lg bg-amber-50 p-3">
          <p className="text-sm text-amber-800">
            <strong>Invitation email:</strong> {invitation.invited_email}
          </p>
          <p className="text-sm text-amber-800">
            <strong>Your email:</strong> {user.email}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Please sign in with the correct email address or contact the organization administrator.
        </p>
      </CardContent>
      <CardFooter className="flex gap-3">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/sign-out">Sign Out</Link>
        </Button>
        <Button asChild className="flex-1">
          <Link href={`/sign-up?invitation=${token}`}>Sign Up with Correct Email</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default async function InvitationPage({ params, searchParams }: InvitationPageProps) {
  const { token } = await params;
  const { error } = await searchParams;

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="animate-pulse">
                <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-gray-200"></div>
                <div className="mx-auto h-6 w-3/4 rounded bg-gray-200"></div>
                <div className="mx-auto mt-2 h-4 w-1/2 rounded bg-gray-200"></div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="animate-pulse space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded bg-gray-200"></div>
                    <div className="flex-1">
                      <div className="h-4 w-3/4 rounded bg-gray-200"></div>
                      <div className="mt-1 h-3 w-1/2 rounded bg-gray-200"></div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        }
      >
        <InvitationContent token={token} error={error} />
      </Suspense>
    </div>
  );
}
