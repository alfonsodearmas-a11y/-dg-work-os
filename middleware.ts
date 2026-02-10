import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/',
  '/api/push/',
  '/api/notifications/generate',
  '/api/webhooks/',
  '/_next',
  '/favicon.ico',
  '/ministry-logo.png',
  '/manifest.json',
  '/icons',
  '/serwist',
];

// Routes that require JWT (tm-token cookie) instead of access code
const JWT_PROTECTED_PREFIXES = [
  '/dashboard',
  '/api/tm/',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
}

function isJwtProtected(pathname: string): boolean {
  return JWT_PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
}

function isStaticAsset(pathname: string): boolean {
  return /\.(png|jpg|jpeg|gif|svg|ico|css|js|woff|woff2|ttf|eot|webp|json)$/i.test(pathname);
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Lightweight JWT decode for edge runtime (no verification — that happens in route handlers) */
function decodeJwtPayload(token: string): { userId?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (isPublicPath(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // ── JWT-protected routes (/dashboard/*, /api/tm/*) ────────────────────
  if (isJwtProtected(pathname)) {
    const tmToken = request.cookies.get('tm-token')?.value;
    const isApiRoute = pathname.startsWith('/api/');

    if (!tmToken) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/login?mode=user', request.url));
    }

    // Basic expiry check in middleware (full verify in route handlers)
    const payload = decodeJwtPayload(tmToken);
    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
      if (isApiRoute) {
        return NextResponse.json({ error: 'Token expired' }, { status: 401 });
      }
      const response = NextResponse.redirect(new URL('/login?mode=user', request.url));
      response.cookies.set('tm-token', '', { maxAge: 0, path: '/' });
      return response;
    }

    return NextResponse.next();
  }

  // ── Access-code-protected routes (DG app pages) ───────────────────────

  // For API routes: also allow through if the user has a valid JWT (tm-token cookie or Bearer header)
  // This lets JWT-authenticated users call /api/admin/* endpoints
  const isApiRoute = pathname.startsWith('/api/');
  if (isApiRoute) {
    const tmToken = request.cookies.get('tm-token')?.value;
    const bearerToken = request.headers.get('authorization')?.startsWith('Bearer ') ? request.headers.get('authorization')!.slice(7) : null;
    const jwtToken = tmToken || bearerToken;
    if (jwtToken) {
      const payload = decodeJwtPayload(jwtToken);
      if (payload?.userId && (!payload.exp || payload.exp * 1000 > Date.now())) {
        return NextResponse.next();
      }
    }
  }

  const accessCode = process.env.APP_ACCESS_CODE;

  // If no access code is configured, skip auth (development)
  if (!accessCode) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get('dg-auth')?.value;

  if (!authCookie) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify the cookie matches the expected hash (Web Crypto API for Edge Runtime)
  const expectedToken = await sha256Hex(accessCode + '_dg_work_os');

  if (authCookie !== expectedToken) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set('dg-auth', '', { maxAge: 0, path: '/' });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image).*)',
  ],
};
