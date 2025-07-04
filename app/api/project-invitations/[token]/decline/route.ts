import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = await createClient();
    
    // Note: We allow declining without authentication (unlike accepting)
    // But we still check if user is authenticated to link the decline action
    const { data: { user } } = await supabase.auth.getUser();

    // Call the database function directly using server-side client
    const { data, error } = await supabase.rpc('decline_project_invitation', {
      p_token: token,
    });

    if (error) {
      console.error('Decline project invitation database error:', error);
      const errorMessage = encodeURIComponent(error.message || 'Failed to decline project invitation');
      return NextResponse.redirect(new URL(`/project-invitation/${token}?error=${errorMessage}`, request.url));
    }

    if (data && data.success) {
      // Redirect to declined page
      return NextResponse.redirect(new URL(`/project-invitation/${token}/declined`, request.url));
    } else {
      // Redirect back to invitation page with error
      const errorMessage = encodeURIComponent(data?.error || 'Failed to decline project invitation');
      return NextResponse.redirect(new URL(`/project-invitation/${token}?error=${errorMessage}`, request.url));
    }
  } catch (error) {
    console.error('Error declining project invitation:', error);
    const errorMessage = encodeURIComponent('An unexpected error occurred');
    const { token } = await params;
    return NextResponse.redirect(new URL(`/project-invitation/${token}?error=${errorMessage}`, request.url));
  }
}