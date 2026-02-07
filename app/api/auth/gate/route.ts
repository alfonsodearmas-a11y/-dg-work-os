import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

// Simple in-memory rate limiter
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
      // Still do a comparison to avoid timing leak on length
      timingSafeEqual(bufA, Buffer.alloc(bufA.length));
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again in 1 minute.' },
      { status: 429 }
    );
  }

  const accessCode = process.env.APP_ACCESS_CODE;
  if (!accessCode) {
    return NextResponse.json(
      { error: 'Access code not configured' },
      { status: 500 }
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { password } = body;
  if (!password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Password required' }, { status: 400 });
  }

  if (!constantTimeCompare(password, accessCode)) {
    return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
  }

  // Create a simple token — hash of the access code for cookie verification
  const { createHash } = await import('crypto');
  const token = createHash('sha256').update(accessCode + '_dg_work_os').digest('hex');

  const response = NextResponse.json({ success: true });
  response.cookies.set('dg-auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });

  return response;
}
