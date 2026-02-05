import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '@/lib/db-pg';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();
    if (!refreshToken) {
      return NextResponse.json({ success: false, error: 'Refresh token required' }, { status: 400 });
    }

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || '');
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid refresh token' }, { status: 401 });
    }

    if (decoded.type !== 'refresh') {
      return NextResponse.json({ success: false, error: 'Invalid token type' }, { status: 401 });
    }

    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const tokenResult = await query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()',
      [tokenHash]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Refresh token expired or revoked' }, { status: 401 });
    }

    // Revoke old token
    await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);

    // Generate new tokens
    const accessToken = jwt.sign({ userId: decoded.userId }, process.env.JWT_SECRET || '', { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as string & jwt.SignOptions['expiresIn'] });
    const newRefreshToken = jwt.sign({ userId: decoded.userId, type: 'refresh' }, process.env.JWT_SECRET || '', { expiresIn: '7d' as string & jwt.SignOptions['expiresIn'] });

    const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [decoded.userId, newTokenHash, expiresAt, request.headers.get('x-forwarded-for'), request.headers.get('user-agent')]
    );

    return NextResponse.json({ success: true, data: { accessToken, refreshToken: newRefreshToken } });
  } catch (error: any) {
    console.error('[auth/refresh] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Token refresh failed' }, { status: 500 });
  }
}
