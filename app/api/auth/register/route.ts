import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db-pg';
import { emailService } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { username, password, email, fullName, agency } = await request.json();

    if (!username || !password || !email || !fullName || !agency) {
      return NextResponse.json({ success: false, error: 'All fields are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Check for existing username/email
    const existing = await query('SELECT id FROM users WHERE username = $1 OR email = $2', [username.toLowerCase(), email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'Username or email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    const result = await query(
      `INSERT INTO users (username, password_hash, email, full_name, role, agency, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, 'staff', $5, false, true)
       RETURNING id, username, email, full_name, role, agency`,
      [username.toLowerCase(), passwordHash, email.toLowerCase(), fullName, agency.toLowerCase()]
    );

    // Send notification email
    emailService.sendRegistrationNotification({ fullName, email, username, agency }).catch(err => {
      console.error('[auth/register] Email notification failed:', err);
    });

    return NextResponse.json({ success: true, message: 'Registration submitted. Awaiting admin approval.', data: result.rows[0] }, { status: 201 });
  } catch (error: any) {
    console.error('[auth/register] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Registration failed' }, { status: 500 });
  }
}
