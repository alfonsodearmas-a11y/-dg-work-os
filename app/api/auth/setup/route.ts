import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { verifyToken, consumeToken } from '@/lib/invite-tokens';
import { query } from '@/lib/db-pg';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ success: false, error: 'Token and password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const result = await verifyToken(token);
    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.reason === 'expired' ? 'This link has expired. Contact the Director General for a new invite.' : 'Invalid or already used link.' }, { status: 400 });
    }

    if (result.data.token.type !== 'invite') {
      return NextResponse.json({ success: false, error: 'Invalid token type' }, { status: 400 });
    }

    const userId = result.data.user.id;
    const passwordHash = await bcrypt.hash(password, 12);

    // Activate user
    await query(
      `UPDATE users SET password_hash = $1, status = 'active', must_change_password = false WHERE id = $2`,
      [passwordHash, userId]
    );

    // Consume the token
    await consumeToken(result.data.token.id);

    // Generate JWT tokens (same as login)
    const jwtSecret = process.env.JWT_SECRET || '';
    const accessToken = jwt.sign({ userId }, jwtSecret, { expiresIn: '8h' });
    const refreshToken = jwt.sign({ userId, type: 'refresh' }, jwtSecret, { expiresIn: '7d' });

    // Store refresh token
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [userId, tokenHash, expiresAt]
    );

    // Update last_login
    await query('UPDATE users SET last_login = NOW(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [userId]);

    // Determine redirect based on role
    const role = result.data.user.role;
    const redirectTo = ['director', 'admin'].includes(role) ? '/admin/tasks' : '/dashboard';

    const response = NextResponse.json({
      success: true,
      data: { accessToken, refreshToken, redirectTo },
    });

    response.cookies.set('tm-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('[auth/setup] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Account setup failed' }, { status: 500 });
  }
}
