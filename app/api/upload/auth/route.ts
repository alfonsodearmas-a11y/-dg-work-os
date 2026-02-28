import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual, createHash } from 'crypto';

const VALID_AGENCIES = ['GPL', 'GWI'] as const;
type Agency = typeof VALID_AGENCIES[number];

// In-memory rate limiter
const attempts = new Map<string, { count: number; resetAt: number }>();

function getClientIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }

  entry.count++;
  if (entry.count > 5) return true;
  return false;
}

function constantTimeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf-8');
    const bufB = Buffer.from(b, 'utf-8');
    if (bufA.length !== bufB.length) {
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function makeUploadToken(code: string, agency: string): string {
  return createHash('sha256').update(code + '_upload_' + agency).digest('hex');
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  // Check if this is a logout request
  const url = new URL(request.url);
  if (url.searchParams.get('action') === 'logout') {
    const response = NextResponse.json({ success: true });
    response.cookies.set('upload-auth', '', { maxAge: 0, path: '/' });
    response.cookies.set('upload-agency', '', { maxAge: 0, path: '/' });
    return response;
  }

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 1 minute.' },
      { status: 429 }
    );
  }

  let body: { agency?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { agency, code } = body;

  if (!agency || !VALID_AGENCIES.includes(agency as Agency)) {
    return NextResponse.json({ error: 'Invalid agency. Must be GPL or GWI.' }, { status: 400 });
  }

  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Access code required' }, { status: 400 });
  }

  const envKey = `UPLOAD_ACCESS_CODE_${agency}`;
  const expectedCode = process.env[envKey];
  if (!expectedCode) {
    return NextResponse.json({ error: 'Upload access not configured for this agency' }, { status: 500 });
  }

  if (!constantTimeCompare(code, expectedCode)) {
    return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
  }

  const token = makeUploadToken(expectedCode, agency);
  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ success: true, agency });

  response.cookies.set('upload-auth', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  response.cookies.set('upload-agency', agency, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
