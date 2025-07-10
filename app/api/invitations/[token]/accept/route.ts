import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.redirect(
        new URL(
          `/sign-in?message=Please sign in to accept this invitation&redirect_to=/invitation/${token}`,
          request.url,
        ),
      );
    }

    // Call the database function directly using server-side client
    const { data, error } = await supabase.rpc('accept_organization_invitation', {
      p_token: token,
    });

    if (error) {
      console.error('Accept invitation database error:', error);
      const errorMessage = encodeURIComponent(error.message || 'Failed to accept invitation');
      return NextResponse.redirect(
        new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
      );
    }

    if (data && data.success) {
      // Redirect to success page with organization context
      return NextResponse.redirect(
        new URL(`/invitation/${token}/success?redirect=true`, request.url),
      );
    } else {
      // Redirect back to invitation page with error
      const errorMessage = encodeURIComponent(data?.error || 'Failed to accept invitation');
      return NextResponse.redirect(
        new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
      );
    }
  } catch (error) {
    console.error('Error accepting invitation:', error);
    const errorMessage = encodeURIComponent('An unexpected error occurred');
    const { token } = await params;
    return NextResponse.redirect(
      new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
    );
  }
}
