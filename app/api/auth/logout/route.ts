import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db-pg';
import { authenticateAny, AuthError } from '@/lib/auth';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    const body = await request.json().catch(() => ({}));

    if (body.refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(body.refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }

    await auditService.log({ userId: user.id, action: 'LOGOUT', entityType: 'users', entityId: user.id, request });

    const response = NextResponse.json({ success: true, message: 'Logged out successfully' });
    response.cookies.set('tm-token', '', { maxAge: 0, path: '/' });
    return response;
  } catch (error: any) {
    if (error instanceof AuthError) {
      // Even if auth fails, clear the cookie
      const response = NextResponse.json({ success: false, error: error.message }, { status: error.status });
      response.cookies.set('tm-token', '', { maxAge: 0, path: '/' });
      return response;
    }
    return NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
  }
}
