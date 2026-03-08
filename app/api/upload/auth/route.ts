import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { timingSafeEqual, createHash } from 'crypto';
import { parseBody, withErrorHandler } from '@/lib/api-utils';

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

const uploadAuthSchema = z.object({
  agency: z.enum(['GPL', 'GWI']),
  code: z.string().min(1),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const ip = getClientIP(request);

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

  const { data, error } = await parseBody(request, uploadAuthSchema);
  if (error) return error;

  const envKey = `UPLOAD_ACCESS_CODE_${data!.agency}`;
  const expectedCode = process.env[envKey];
  if (!expectedCode) {
    return NextResponse.json({ error: 'Upload access not configured for this agency' }, { status: 500 });
  }

  if (!constantTimeCompare(data!.code, expectedCode)) {
    return NextResponse.json({ error: 'Invalid access code' }, { status: 401 });
  }

  const token = makeUploadToken(expectedCode, data!.agency);
  const isProduction = process.env.NODE_ENV === 'production';

  const response = NextResponse.json({ success: true, agency: data!.agency });

  response.cookies.set('upload-auth', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  response.cookies.set('upload-agency', data!.agency, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
});
