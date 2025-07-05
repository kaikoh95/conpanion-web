import { signInAction } from '@/app/actions';
import { FormMessage, Message } from '@/components/form-message';
import { SubmitButton } from '@/components/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { ClientAuthHandler } from './ClientAuthHandler';
import { SignInForm } from './SignInForm';
import { Suspense } from 'react';

interface LoginProps {
  searchParams: Promise<Message & { invitation?: string }>;
}

export default async function Login(props: LoginProps) {
  const searchParams = await props.searchParams;
  const invitationToken = searchParams.invitation;

  return (
    <>
      {/* Client-side auth handler for automatic redirects */}
      <Suspense fallback={null}>
        <ClientAuthHandler />
      </Suspense>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-medium">Sign in</h1>
          <p className="text-sm text-foreground">
            Don't have an account?{' '}
            <Link
              className="font-medium text-foreground underline"
              href={invitationToken ? `/sign-up?invitation=${invitationToken}` : '/sign-up'}
            >
              Sign up
            </Link>
          </p>
        </div>

        <SignInForm invitationToken={invitationToken} searchParams={searchParams} />
      </div>
    </>
  );
}
