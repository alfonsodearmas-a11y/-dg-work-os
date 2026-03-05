import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (
    pathname === '/login' ||
    pathname === '/403' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/push/') ||
    pathname.startsWith('/api/notifications/generate') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/serwist') ||
    pathname.startsWith('/upload')
  ) {
    return NextResponse.next();
  }

  // Redirect unauthenticated users to login
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // If user was deactivated mid-session (userId cleared by JWT callback), redirect to /403
  if (req.auth.user && !req.auth.user.id) {
    return NextResponse.redirect(new URL('/403', req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons|splash|manifest\\.json|sw\\.js|serwist|ministry-logo\\.png|app-icon\\.png).*)',
  ],
};
