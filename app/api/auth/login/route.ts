import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '@/lib/db-pg';
import { auditService } from '@/lib/audit';

const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5');
const LOCKOUT_DURATION = parseInt(process.env.LOCKOUT_DURATION_MINUTES || '30');

function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, process.env.JWT_SECRET || '', { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as string & jwt.SignOptions['expiresIn'] });
  const refreshToken = jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET || '', { expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as string & jwt.SignOptions['expiresIn'] });
  return { accessToken, refreshToken };
}

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ success: false, error: 'Username and password are required' }, { status: 400 });
    }

    const result = await query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    const user = result.rows[0];

    // Check account lock
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      return NextResponse.json({ success: false, error: `Account locked. Try again in ${remainingMinutes} minutes`, code: 'ACCOUNT_LOCKED' }, { status: 423 });
    }

    if (!user.is_active) {
      return NextResponse.json({ success: false, error: 'Account is deactivated' }, { status: 401 });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      let lockUntil = null;
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        lockUntil = new Date(Date.now() + LOCKOUT_DURATION * 60000);
      }
      await query('UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [newAttempts, lockUntil, user.id]);
      return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
    }

    // Reset failed attempts
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1', [user.id]);

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, tokenHash, expiresAt, request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null, request.headers.get('user-agent')]
    );

    await auditService.log({ userId: user.id, action: 'LOGIN', entityType: 'users', entityId: user.id, request });

    // Determine redirect based on role
    const redirectTo = ['director', 'admin'].includes(user.role) ? '/admin/tasks' : '/dashboard';

    const response = NextResponse.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        redirectTo,
        user: { id: user.id, username: user.username, email: user.email, fullName: user.full_name, role: user.role, agency: user.agency, mustChangePassword: user.must_change_password },
      },
    });

    // Set httpOnly cookie for task management pages
    response.cookies.set('tm-token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60, // 8 hours
    });

    return response;
  } catch (error: any) {
    console.error('[auth/login] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Login failed' }, { status: 500 });
  }
}
