import { signUpAction } from '@/app/actions';
import { FormMessage, Message } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building2, Mail } from 'lucide-react';
import Link from 'next/link';
import { SmtpMessage } from '../smtp-message';
import { createClient } from '@/utils/supabase/server';
import { ClientAuthHandler } from '../sign-in/ClientAuthHandler';
import { Suspense } from 'react';

interface SignupProps {
  searchParams: Promise<Message & { invitation?: string }>;
}

export default async function Signup(props: SignupProps) {
  const searchParams = await props.searchParams;
  const invitationToken = searchParams.invitation;

  // Get invitation details if token is provided
  let invitationDetails = null;
  let debugInfo = null;

  if (invitationToken) {
    try {
      const supabase = await createClient();
      const { data: invitation, error: invitationError } = await supabase.rpc(
        'get_invitation_by_token',
        {
          p_token: invitationToken,
        },
      );

      console.log('Signup page - invitation fetch result:', { invitation, invitationError });
      debugInfo = { invitation, invitationError, token: invitationToken };

      if (invitationError) {
        console.error('Error getting invitation:', invitationError);
      } else if (invitation && invitation.success && invitation.invitation) {
        const invData = invitation.invitation;
        console.log('Raw invitation data:', invData);

        invitationDetails = {
          organization_name: invData.organization_name || 'Unknown Organization',
          invited_email: invData.invited_email || 'Unknown Email',
          invited_by_name: invData.invited_by_name || 'Unknown Inviter',
        };
        console.log('Parsed invitation details:', invitationDetails);
      } else {
        console.log('Invitation not found or invalid:', invitation);
      }
    } catch (error) {
      console.error('Error fetching invitation details:', error);
      debugInfo = {
        error: error instanceof Error ? error.message : 'Unknown error',
        token: invitationToken,
      };
    }
  }

  if ('message' in searchParams) {
    return (
      <div className="flex h-screen w-full flex-1 items-center justify-center gap-2 p-4 sm:max-w-md">
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <>
      {/* Client-side auth handler for automatic redirects */}
      <Suspense fallback={null}>
        <ClientAuthHandler />
      </Suspense>

      <div className="flex w-full max-w-sm flex-col gap-6">
        {/* Debug info for invitation fetching */}
        {invitationToken && !invitationDetails && (
          <Card className="border-amber-200 bg-amber-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-amber-900">Debug: Invitation Loading</CardTitle>
              <CardDescription className="text-xs text-amber-700">
                Token: {invitationToken}
              </CardDescription>
            </CardHeader>
            {debugInfo && (
              <CardContent className="pt-0">
                <pre className="overflow-auto text-xs text-amber-800">
                  {JSON.stringify(debugInfo, null, 2)}
                </pre>
              </CardContent>
            )}
          </Card>
        )}

        {/* Show invitation context if available */}
        {invitationDetails && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-sm text-blue-900">Organization Invitation</CardTitle>
                  <CardDescription className="text-xs text-blue-700">
                    You're signing up to join {invitationDetails.organization_name}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 text-xs text-blue-700">
                <Mail className="h-3 w-3" />
                <span>Invited by {invitationDetails.invited_by_name}</span>
              </div>
            </CardContent>
          </Card>
        )}

        <form className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-medium">
              {invitationDetails ? 'Join Organization' : 'Sign up'}
            </h1>
            <p className="text-sm text-foreground">
              Already have an account?{' '}
              <Link
                className="font-medium text-primary underline"
                href={invitationToken ? `/sign-in?invitation=${invitationToken}` : '/sign-in'}
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {/* Hidden field to pass invitation token */}
            {invitationToken && <input type="hidden" name="invitation" value={invitationToken} />}

            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                name="email"
                placeholder="you@example.com"
                defaultValue={invitationDetails?.invited_email || ''}
                required
              />
              {invitationDetails && (
                <p className="text-xs text-muted-foreground">
                  Use the email address that received the invitation
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                type="password"
                name="password"
                placeholder="Your password"
                minLength={6}
                required
              />
            </div>

            <SubmitButton formAction={signUpAction} pendingText="Signing up...">
              {invitationDetails ? 'Sign up & Join Organization' : 'Sign up'}
            </SubmitButton>

            <FormMessage message={searchParams} />
          </div>
        </form>
        <SmtpMessage />
      </div>
    </>
  );
}
