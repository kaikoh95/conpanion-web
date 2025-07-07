import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';
import {
  isInvitationRoute,
  validateInvitationRoute,
  getInvalidInvitationRedirect,
} from '@/lib/utils/invitation-utils';

export const updateSession = async (request: NextRequest) => {
  // This `try/catch` block is only here for the interactive tutorial.
  // Feel free to remove once you have Supabase connected.
  try {
    // Create an unmodified response
    let response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({
              request,
            });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    // This will refresh session if expired - required for Server Components
    // https://supabase.com/docs/guides/auth/server-side/nextjs
    const user = await supabase.auth.getUser();

    // Handle invitation routes (both UI and API)
    if (isInvitationRoute(request.nextUrl.pathname)) {
      const validation = validateInvitationRoute(request.nextUrl.pathname);

      if (!validation.isValid) {
        // Handle invalid invitation tokens
        if (request.nextUrl.pathname.startsWith('/api/')) {
          // Return 400 for invalid API requests
          return NextResponse.json(
            { error: validation.error || 'Invalid invitation token' },
            { status: 400 },
          );
        } else {
          // Redirect to invalid page for UI routes
          return NextResponse.redirect(
            new URL(getInvalidInvitationRedirect(request.url), request.url),
          );
        }
      }

      // Allow access to valid invitation routes regardless of auth status
      return response;
    }

    // Allow public access to auth pages
    if (
      request.nextUrl.pathname.startsWith('/sign-in') ||
      request.nextUrl.pathname.startsWith('/sign-up') ||
      request.nextUrl.pathname.startsWith('/forgot-password') ||
      request.nextUrl.pathname.startsWith('/auth/')
    ) {
      return response;
    }

    // Redirect to sign-in if accessing root page without auth
    if (request.nextUrl.pathname === '/' && user.error) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    // Redirect to protected if accessing root page with auth
    if (request.nextUrl.pathname === '/' && !user.error) {
      return NextResponse.redirect(new URL('/protected', request.url));
    }

    // Redirect to sign-in if accessing protected routes without auth
    if (request.nextUrl.pathname.startsWith('/protected') && user.error) {
      return NextResponse.redirect(new URL('/sign-in', request.url));
    }

    return response;
  } catch (e) {
    // If you are here, a Supabase client could not be created!
    // This is likely because you have not set up environment variables.
    // Check out http://localhost:3000 for Next Steps.
    return NextResponse.next({
      request: {
        headers: request.headers,
      },
    });
  }
};
