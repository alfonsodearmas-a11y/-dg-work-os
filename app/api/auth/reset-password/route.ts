import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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
      return NextResponse.json({ success: false, error: result.reason === 'expired' ? 'This reset link has expired. Ask the Director General for a new one.' : 'Invalid or already used link.' }, { status: 400 });
    }

    if (result.data.token.type !== 'password_reset') {
      return NextResponse.json({ success: false, error: 'Invalid token type' }, { status: 400 });
    }

    const userId = result.data.user.id;
    const passwordHash = await bcrypt.hash(password, 12);

    // Update password
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [passwordHash, userId]);

    // Consume the token
    await consumeToken(result.data.token.id);

    // Invalidate all refresh tokens (force re-login)
    await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[auth/reset-password] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Password reset failed' }, { status: 500 });
  }
}
