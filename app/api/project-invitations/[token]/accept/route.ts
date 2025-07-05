import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { projectAPI } from '@/lib/api/projects';

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    
    if (!token) {
      return NextResponse.redirect(new URL('/project-invitation/invalid', request.url));
    }

    const supabase = await createClient();
    
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    try {
      const result = await projectAPI.acceptProjectInvitation(token);
      
      if (result.success) {
        // Redirect to project dashboard or success page
        return NextResponse.redirect(new URL('/protected?invitation_accepted=true', request.url));
      } else {
        // Redirect back to invitation page with error
        const errorMessage = encodeURIComponent(result.message || 'Failed to accept invitation');
        return NextResponse.redirect(new URL(`/project-invitation/${token}?error=${errorMessage}`, request.url));
      }
    } catch (error: any) {
      console.error('Error accepting project invitation:', error);
      const errorMessage = encodeURIComponent(error.message || 'Failed to accept invitation');
      return NextResponse.redirect(new URL(`/project-invitation/${token}?error=${errorMessage}`, request.url));
    }
  } catch (error) {
    console.error('Error in accept project invitation route:', error);
    return NextResponse.redirect(new URL('/project-invitation/invalid', request.url));
  }
}