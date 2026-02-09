import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/gate',
  '/api/push/',
  '/api/notifications/generate',
  '/_next',
  '/favicon.ico',
  '/ministry-logo.png',
  '/manifest.json',
  '/icons',
  '/serwist',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname.startsWith(p));
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (isPublicPath(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  const accessCode = process.env.APP_ACCESS_CODE;

  // If no access code is configured, skip auth (development)
  if (!accessCode) {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get('dg-auth')?.value;

  if (!authCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Verify the cookie matches the expected hash (Web Crypto API for Edge Runtime)
  const expectedToken = await sha256Hex(accessCode + '_dg_work_os');

  if (authCookie !== expectedToken) {
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
