'use server';

import { encodedRedirect } from '@/utils/utils';
import { createClient } from '@/utils/supabase/server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { organizationAPI } from '@/lib/api/organizations';

export const signUpAction = async (formData: FormData) => {
  const email = formData.get('email')?.toString();
  const password = formData.get('password')?.toString();
  const invitationToken = formData.get('invitation')?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get('origin');

  if (!email || !password) {
    return encodedRedirect('error', '/sign-up', 'Email and password are required');
  }

  // Determine the redirect URL based on whether there's an invitation
  const redirectTo = invitationToken
    ? `${origin}/auth/callback?invitation=${invitationToken}`
    : `${origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    console.error(error.code + ' ' + error.message);
    return encodedRedirect('error', '/sign-up', error.message);
  }

  // Check if user was created immediately (email verification disabled)
  const user = data.user;
  const isEmailVerificationDisabled = user && !data.session?.access_token;

  // If user was created immediately, handle invitation linking
  if (user && data.session) {
    // Link user to any pending invitations for their email
    const linkResult = await organizationAPI.linkUserToPendingInvitations(user.id, user.email!);
    console.log('Linked invitations after immediate signup:', linkResult);

    // If there's an invitation token, redirect directly to the invitation
    if (invitationToken) {
      return redirect(`/invitation/${invitationToken}`);
    }

    // Check if user has any pending invitations
    const hasPending = await organizationAPI.userHasPendingInvitations(user.id);
    if (hasPending) {
      const pendingInvitations = await organizationAPI.getUserPendingInvitations(user.id);
      if (pendingInvitations.success && pendingInvitations.invitations.length > 0) {
        const firstInvitation = pendingInvitations.invitations[0];
        return redirect(`/invitation/${firstInvitation.token}`);
      }
    }

    // If no invitations, redirect to protected area
    return redirect('/protected');
  } else {
    // Email verification is enabled, show success message
    const successMessage = invitationToken
      ? "Thanks for signing up! Please check your email for a verification link. After verification, you'll be able to accept your organization invitation."
      : 'Thanks for signing up! Please check your email for a verification link.';

    return encodedRedirect('success', '/sign-up', successMessage);
  }
};

export const signInAction = async (formData: FormData) => {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const invitationToken = formData.get('invitation')?.toString();

  console.log('🔄 signInAction: Starting sign-in process for:', email);
  console.log('🔄 signInAction: Invitation token:', invitationToken ? 'present' : 'none');

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error('❌ signInAction: Authentication failed:', error.message);
    return encodedRedirect('error', '/sign-in', error.message);
  }

  console.log('✅ signInAction: Authentication successful for:', email);
  console.log('🔄 signInAction: Session data:', data.session ? 'session created' : 'no session');
  console.log('🔄 signInAction: User data:', data.user ? `user ID: ${data.user.id}` : 'no user');

  // Get the user after successful sign-in
  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  if (getUserError) {
    console.error('❌ signInAction: Error getting user after sign-in:', getUserError);
    return encodedRedirect('error', '/sign-in', 'Failed to retrieve user information');
  }

  if (user) {
    console.log('✅ signInAction: User retrieved successfully:', user.email);

    try {
      // Link user to any pending invitations for their email
      console.log('🔄 signInAction: Linking pending invitations...');
      const linkResult = await organizationAPI.linkUserToPendingInvitations(user.id, user.email!);
      console.log('✅ signInAction: Linked invitations result:', linkResult);
    } catch (error) {
      console.error('❌ signInAction: Error linking invitations:', error);
      // Don't fail the sign-in if invitation linking fails
    }
  } else {
    console.error('❌ signInAction: No user found after successful authentication');
    return encodedRedirect('error', '/sign-in', 'Authentication succeeded but user not found');
  }

  // If there's an invitation token, redirect to the invitation page
  if (invitationToken) {
    console.log('🔄 signInAction: Redirecting to invitation page:', invitationToken);
    return redirect(`/invitation/${invitationToken}`);
  }

  // Check if user has any pending invitations
  if (user) {
    try {
      console.log('🔄 signInAction: Checking for pending invitations...');
      const hasPending = await organizationAPI.userHasPendingInvitations(user.id);
      console.log('🔄 signInAction: Has pending invitations:', hasPending);

      if (hasPending) {
        // Redirect to a pending invitations page or show the first one
        const pendingInvitations = await organizationAPI.getUserPendingInvitations(user.id);
        console.log('🔄 signInAction: Pending invitations result:', pendingInvitations);

        if (pendingInvitations.success && pendingInvitations.invitations.length > 0) {
          const firstInvitation = pendingInvitations.invitations[0];
          console.log(
            '🔄 signInAction: Redirecting to first pending invitation:',
            firstInvitation.token,
          );
          return redirect(`/invitation/${firstInvitation.token}`);
        }
      }
    } catch (error) {
      console.error('❌ signInAction: Error checking pending invitations:', error);
      // Don't fail the sign-in if checking invitations fails
    }
  }

  console.log('🔄 signInAction: Redirecting to protected area');
  return redirect('/protected');
};

export const forgotPasswordAction = async (formData: FormData) => {
  const email = formData.get('email')?.toString();
  const supabase = await createClient();
  const origin = (await headers()).get('origin');
  const callbackUrl = formData.get('callbackUrl')?.toString();

  if (!email) {
    return encodedRedirect('error', '/forgot-password', 'Email is required');
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
  });

  if (error) {
    console.error(error.message);
    return encodedRedirect('error', '/forgot-password', 'Could not reset password');
  }

  if (callbackUrl) {
    return redirect(callbackUrl);
  }

  return encodedRedirect(
    'success',
    '/forgot-password',
    'Check your email for a link to reset your password.',
  );
};

export const resetPasswordAction = async (formData: FormData) => {
  const supabase = await createClient();

  const password = formData.get('password') as string;
  const confirmPassword = formData.get('confirmPassword') as string;

  if (!password || !confirmPassword) {
    encodedRedirect(
      'error',
      '/protected/reset-password',
      'Password and confirm password are required',
    );
  }

  if (password !== confirmPassword) {
    encodedRedirect('error', '/protected/reset-password', 'Passwords do not match');
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  });

  if (error) {
    encodedRedirect('error', '/protected/reset-password', 'Password update failed');
  }

  encodedRedirect('success', '/protected/reset-password', 'Password updated');
};

export const signOutAction = async () => {
  const supabase = await createClient();

  // Sign out from server-side (this clears the server-side session)
  const { error } = await supabase.auth.signOut({ scope: 'global' });
  if (error) {
    console.error('Server-side signout error:', error);
  }

  return redirect('/sign-in');
};
