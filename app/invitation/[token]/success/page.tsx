import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle, Building2 } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';

interface SuccessPageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ redirect?: string }>;
}

async function SuccessContent({
  token,
  shouldRedirect,
}: {
  token: string;
  shouldRedirect: boolean;
}) {
  let organizationSlug = null;
  let userEmail = null;
  let isAuthenticated = false;

  try {
    // Check current authentication status
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    isAuthenticated = !authError && !!user;
    userEmail = user?.email;

    console.log('Success page - Auth status:', { isAuthenticated, userEmail, authError });

    if (shouldRedirect && isAuthenticated) {
      // Get invitation details directly from database
      const { data: invitation, error: invitationError } = await supabase.rpc(
        'get_invitation_by_token',
        {
          p_token: token,
        },
      );

      if (invitationError) {
        console.error('Error getting invitation:', invitationError);
      } else if (invitation && invitation.success) {
        organizationSlug = invitation.organization_slug;
        console.log('Found organization slug:', organizationSlug);
      }
    }
  } catch (error) {
    console.error('Error in success page:', error);
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <CardTitle className="text-green-600">Invitation Accepted!</CardTitle>
        <CardDescription>You have successfully joined the organization</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4 text-center">
        <div className="rounded-lg bg-green-50 p-4">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-green-600" />
          <p className="text-sm font-medium text-green-800">Welcome to your new organization!</p>
          <p className="mt-1 text-sm text-green-700">
            You can now access all organization features and collaborate with your team.
          </p>
        </div>

        {!isAuthenticated && (
          <div className="rounded-lg bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-800">⚠️ Session Issue Detected</p>
            <p className="mt-1 text-sm text-amber-700">
              You may need to sign in again to access organization settings.
            </p>
            {userEmail && <p className="mt-1 text-xs text-amber-600">User: {userEmail}</p>}
          </div>
        )}

        {shouldRedirect && isAuthenticated && (
          <div className="text-sm text-muted-foreground">
            <p>Redirecting you to organization settings...</p>
            {organizationSlug && <p className="mt-1 text-xs">Organization: {organizationSlug}</p>}
          </div>
        )}

        {!shouldRedirect && (
          <div className="text-sm text-muted-foreground">
            <p>You can now access your organization dashboard.</p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        {!isAuthenticated ? (
          <>
            <Button asChild className="w-full">
              <Link href="/sign-in">Sign In Again</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/">Go to Home</Link>
            </Button>
          </>
        ) : organizationSlug ? (
          <>
            <Button asChild className="w-full">
              <Link href={`/protected/settings/organizations/${organizationSlug}`}>
                Go to Organization Settings
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/protected">Go to Dashboard</Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild className="w-full">
              <Link href="/protected">Go to Dashboard</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/protected/settings/organizations">Manage Organizations</Link>
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export default async function InvitationSuccessPage({ params, searchParams }: SuccessPageProps) {
  const { token } = await params;
  const { redirect } = await searchParams;
  const shouldRedirect = redirect === 'true';

  return (
    <div className="flex min-h-screen w-full items-center justify-center p-4">
      <Suspense
        fallback={
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="animate-pulse">
                <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-200"></div>
                <div className="mx-auto h-6 w-3/4 rounded bg-gray-200"></div>
                <div className="mx-auto mt-2 h-4 w-1/2 rounded bg-gray-200"></div>
              </div>
            </CardHeader>
          </Card>
        }
      >
        <SuccessContent token={token} shouldRedirect={shouldRedirect} />
      </Suspense>
    </div>
  );
}
