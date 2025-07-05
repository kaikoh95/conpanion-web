import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const supabase = await createClient();

    // Call the database function directly using server-side client
    const { data, error } = await supabase.rpc('decline_organization_invitation', {
      p_token: token,
    });

    if (error) {
      console.error('Decline invitation database error:', error);
      const errorMessage = encodeURIComponent(error.message || 'Failed to decline invitation');
      return NextResponse.redirect(
        new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
      );
    }

    if (data && data.success) {
      // Redirect to declined page
      return NextResponse.redirect(new URL(`/invitation/${token}/declined`, request.url));
    } else {
      // Redirect back to invitation page with error
      const errorMessage = encodeURIComponent(data?.error || 'Failed to decline invitation');
      return NextResponse.redirect(
        new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
      );
    }
  } catch (error) {
    console.error('Error declining invitation:', error);
    const errorMessage = encodeURIComponent('An unexpected error occurred');
    const { token } = await params;
    return NextResponse.redirect(
      new URL(`/invitation/${token}?error=${errorMessage}`, request.url),
    );
  }
}
