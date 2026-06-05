import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Supabase Auth middleware. Refreshes the @supabase/ssr cookie session on every
// request and guards non-public routes.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/403' ||
    pathname === '/set-password' ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/push/') ||
    pathname.startsWith('/api/notifications/generate') ||
    pathname.startsWith('/api/action-items/poll-fireflies') ||
    pathname.startsWith('/api/action-items/digest') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/integrations/trello/webhook') ||
    pathname.startsWith('/api/ai/precompute-daily') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/oversight/sync') ||
    pathname.startsWith('/api/tm/cron/') ||
    pathname.startsWith('/serwist') ||
    pathname.startsWith('/upload')
  );
}

export async function middleware(req: NextRequest) {
  // Start with a passthrough response we can attach refreshed cookies to.
  let response = NextResponse.next({ request: req });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        response = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT (@supabase/ssr footgun): getUser() refreshes the session, and the
  // SAME `response` object (carrying refreshed Set-Cookie headers) MUST be
  // returned — otherwise the cookie never persists and users bounce to /login.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;
  if (isPublicPath(pathname)) return response;

  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // Deactivation: a deactivated user's profile is denied by auth() (buildSession
  // returns null for !is_active), so every requireRole()/server auth() call rejects
  // them. (A hard session kill — banning the auth user on deactivation — is a
  // follow-up; until then getUser() may still succeed but the app denies access.)
  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons|splash|manifest\\.json|sw\\.js|serwist|ministry-logo\\.png|app-icon\\.png).*)',
  ],
};
