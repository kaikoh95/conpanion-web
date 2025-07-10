'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signInAction } from '@/app/actions';
import { FormMessage, Message } from '@/components/form-message';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SignInFormProps {
  invitationToken?: string;
  searchParams: Message;
}

export function SignInForm({ invitationToken, searchParams }: SignInFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();
  const supabase = getSupabaseClient();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    console.log('🔄 SignInForm: Starting client-side sign-in process');
    console.log('🔄 SignInForm: Email:', email);
    console.log('🔄 SignInForm: Invitation token:', invitationToken || 'none');

    startTransition(async () => {
      try {
        // Step 1: Call Supabase client-side authentication
        console.log('🔄 SignInForm: Calling Supabase signInWithPassword...');
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          console.error('❌ SignInForm: Supabase authentication failed:', authError.message);
          setError(authError.message);
          return;
        }

        console.log('✅ SignInForm: Supabase authentication successful');
        console.log('🔄 SignInForm: Session:', data.session ? 'created' : 'none');
        console.log('🔄 SignInForm: User:', data.user ? data.user.email : 'none');

        // Step 2: Refresh the auth context to pick up the new session
        console.log('🔄 SignInForm: Refreshing auth context...');
        await refreshUser();

        // Step 3: Handle server-side operations (invitation linking, etc.)
        console.log('🔄 SignInForm: Calling server action for additional processing...');
        try {
          const formData = new FormData();
          formData.append('email', email);
          formData.append('password', password);
          if (invitationToken) {
            formData.append('invitation', invitationToken);
          }

          // Note: signInAction will try to authenticate again, but that's okay
          // It will handle invitation linking and other server-side logic
          await signInAction(formData);
        } catch (serverError) {
          console.warn('⚠️ SignInForm: Server action failed, but auth succeeded:', serverError);
          // Continue with client-side redirect since auth succeeded
        }

        // Step 4: Handle client-side redirect
        console.log('🔄 SignInForm: Handling client-side redirect...');
        if (invitationToken) {
          console.log('🔄 SignInForm: Redirecting to invitation page');
          router.push(`/invitation/${invitationToken}`);
        } else {
          console.log('🔄 SignInForm: Redirecting to protected area');
          router.push('/protected');
        }
      } catch (error) {
        console.error('❌ SignInForm: Unexpected error during sign-in:', error);
        setError(error instanceof Error ? error.message : 'An unexpected error occurred');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Hidden field to pass invitation token */}
      {invitationToken && <input type="hidden" name="invitation" value={invitationToken} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link className="text-xs text-foreground underline" href="/forgot-password">
            Forgot Password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          name="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Signing In...' : 'Sign in'}
      </Button>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <FormMessage message={searchParams} />
    </form>
  );
}
