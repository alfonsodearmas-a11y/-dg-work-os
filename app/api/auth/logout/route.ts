import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { query } from '@/lib/db-pg';
import { authenticateRequest, AuthError } from '@/lib/auth';
import { auditService } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const body = await request.json().catch(() => ({}));

    if (body.refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(body.refreshToken).digest('hex');
      await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }

    await auditService.log({ userId: user.id, action: 'LOGOUT', entityType: 'users', entityId: user.id, request });
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: 'Logout failed' }, { status: 500 });
  }
}
