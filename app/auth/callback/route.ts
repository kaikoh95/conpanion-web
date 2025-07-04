import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';
import { organizationAPI } from '@/lib/api/organizations';
import { projectAPI } from '@/lib/api/projects';

export async function GET(request: Request) {
  // The `/auth/callback` route is required for the server-side auth flow implemented
  // by the SSR package. It exchanges an auth code for the user's session.
  // https://supabase.com/docs/guides/auth/server-side/nextjs
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const origin = requestUrl.origin;
  const redirectTo = requestUrl.searchParams.get('redirect_to')?.toString();
  const invitationToken = requestUrl.searchParams.get('invitation')?.toString();
  const projectInvitationToken = requestUrl.searchParams.get('project-invitation')?.toString();

  console.log('🔄 auth/callback: Processing callback');
  console.log('🔄 auth/callback: Code present:', code ? 'yes' : 'no');
  console.log('🔄 auth/callback: Redirect to:', redirectTo || 'none');
  console.log('🔄 auth/callback: Organization invitation token:', invitationToken || 'none');
  console.log('🔄 auth/callback: Project invitation token:', projectInvitationToken || 'none');

  if (code) {
    console.log('🔄 auth/callback: Exchanging code for session...');
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('❌ auth/callback: Error exchanging code for session:', error);
    } else {
      console.log('✅ auth/callback: Successfully exchanged code for session');
    }
    
    // After successful auth, link user to pending invitations
    const { data: { user }, error: getUserError } = await supabase.auth.getUser();
    
    if (getUserError) {
      console.error('❌ auth/callback: Error getting user after session exchange:', getUserError);
    } else if (user && user.email) {
      console.log('✅ auth/callback: User retrieved:', user.email);
      try {
        console.log('🔄 auth/callback: Linking pending organization invitations...');
        const linkResult = await organizationAPI.linkUserToPendingInvitations(user.id, user.email);
        console.log('✅ auth/callback: Linked organization invitations result:', linkResult);
        
        console.log('🔄 auth/callback: Linking pending project invitations...');
        const projectLinkResult = await projectAPI.linkUserToPendingProjectInvitations(user.id);
        console.log('✅ auth/callback: Linked project invitations result:', projectLinkResult);
      } catch (error) {
        console.error('❌ auth/callback: Error linking invitations:', error);
        // Don't fail the callback if invitation linking fails
      }
    } else {
      console.log('⚠️ auth/callback: No user found after session exchange');
    }
  }

  // If there's an organization invitation token, redirect to the invitation page for acceptance
  if (invitationToken) {
    console.log('🔄 auth/callback: Redirecting to organization invitation page:', invitationToken);
    return NextResponse.redirect(`${origin}/invitation/${invitationToken}`);
  }

  // If there's a project invitation token, redirect to the project invitation page for acceptance
  if (projectInvitationToken) {
    console.log('🔄 auth/callback: Redirecting to project invitation page:', projectInvitationToken);
    return NextResponse.redirect(`${origin}/project-invitation/${projectInvitationToken}`);
  }

  if (redirectTo) {
    console.log('🔄 auth/callback: Redirecting to specified redirect_to:', redirectTo);
    return NextResponse.redirect(`${origin}${redirectTo}`);
  }

  // Check for pending invitations and redirect to first one if exists
  try {
    console.log('🔄 auth/callback: Checking for pending invitations...');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      console.log('🔄 auth/callback: User found, checking pending invitations for:', user.email);
      
      // Check for pending organization invitations first
      const hasPendingOrg = await organizationAPI.userHasPendingInvitations(user.id);
      console.log('🔄 auth/callback: Has pending organization invitations:', hasPendingOrg);
      
      if (hasPendingOrg) {
        const pendingInvitations = await organizationAPI.getUserPendingInvitations(user.id);
        console.log('🔄 auth/callback: Pending organization invitations result:', pendingInvitations);
        
        if (pendingInvitations.success && pendingInvitations.invitations.length > 0) {
          const firstInvitation = pendingInvitations.invitations[0];
          console.log('🔄 auth/callback: Redirecting to first pending organization invitation:', firstInvitation.token);
          return NextResponse.redirect(`${origin}/invitation/${firstInvitation.token}`);
        }
      }
      
      // Check for pending project invitations if no organization invitations
      const hasPendingProject = await projectAPI.userHasPendingProjectInvitations(user.id);
      console.log('🔄 auth/callback: Has pending project invitations:', hasPendingProject);
      
      if (hasPendingProject) {
        const pendingProjectInvitations = await projectAPI.getUserPendingProjectInvitations(user.id);
        console.log('🔄 auth/callback: Pending project invitations result:', pendingProjectInvitations);
        
        if (pendingProjectInvitations.success && pendingProjectInvitations.invitations.length > 0) {
          const firstProjectInvitation = pendingProjectInvitations.invitations[0];
          console.log('🔄 auth/callback: Redirecting to first pending project invitation:', firstProjectInvitation.token);
          return NextResponse.redirect(`${origin}/project-invitation/${firstProjectInvitation.token}`);
        }
      }
    } else {
      console.log('⚠️ auth/callback: No user found when checking pending invitations');
    }
  } catch (error) {
    console.error('❌ auth/callback: Error checking pending invitations:', error);
    // Don't fail the callback if checking invitations fails
  }

  // URL to redirect to after sign up process completes
  console.log('🔄 auth/callback: Redirecting to protected area (default)');
  return NextResponse.redirect(`${origin}/protected`);
}
