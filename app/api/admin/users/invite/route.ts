import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { createInviteToken } from '@/lib/invite-tokens';
import { sendTaskEmail } from '@/lib/task-notifications';
import { accountSetupEmail } from '@/lib/task-email-templates';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const { full_name, email, agency, role } = await request.json();
    if (!full_name || !email || !agency || !role) {
      return NextResponse.json({ success: false, error: 'full_name, email, agency, and role are required' }, { status: 400 });
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ success: false, error: 'A user with this email already exists' }, { status: 409 });
    }

    // Generate unique username from email
    const baseUsername = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
    let username = baseUsername;
    const existingUsernames = await query(
      `SELECT username FROM users WHERE username = $1 OR username LIKE $2`,
      [baseUsername, `${baseUsername}_%`]
    );
    if (existingUsernames.rows.length > 0) {
      const taken = new Set(existingUsernames.rows.map((r: { username: string }) => r.username));
      if (taken.has(baseUsername)) {
        let suffix = 2;
        while (taken.has(`${baseUsername}_${suffix}`)) suffix++;
        username = `${baseUsername}_${suffix}`;
      }
    }

    // Create user with status='invited', no password
    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name, role, agency, is_active, status)
       VALUES ($1, $2, NULL, $3, $4, $5, true, 'invited')
       RETURNING id, username, email, full_name, role, agency, status`,
      [username, email, full_name, role, agency]
    );

    const newUser = result.rows[0];

    // Generate invite token (7-day expiry)
    const rawToken = await createInviteToken(newUser.id, 'invite', 7 * 24);
    const setupUrl = `${BASE_URL}/setup?token=${rawToken}`;

    // Send setup email
    let emailSent = false;
    try {
      const emailData = accountSetupEmail(full_name, role, agency, setupUrl);
      await sendTaskEmail(email, emailData.subject, emailData.html);
      emailSent = true;
    } catch (err) {
      console.error('[invite] Failed to send invite email:', err);
    }

    return NextResponse.json({
      success: true,
      data: { ...newUser, emailSent },
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[admin/invite] Error:', error.message);
    if (error.code === '23505') {
      return NextResponse.json({ success: false, error: 'A user with this email or username already exists' }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: 'Failed to create user' }, { status: 500 });
  }
}
