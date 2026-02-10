import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { sendTaskEmail } from '@/lib/task-notifications';
import { userInviteEmail } from '@/lib/task-email-templates';

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

    // Generate temp password and username
    const tempPassword = crypto.randomBytes(6).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const result = await query(
      `INSERT INTO users (username, email, password_hash, full_name, role, agency, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id, username, email, full_name, role, agency`,
      [username, email, passwordHash, full_name, role, agency]
    );

    // Send invite email (track success/failure)
    let emailSent = false;
    try {
      const emailData = userInviteEmail(full_name, tempPassword);
      await sendTaskEmail(email, emailData.subject, emailData.html);
      emailSent = true;
    } catch (err) {
      console.error('[invite] Failed to send invite email:', err);
    }

    return NextResponse.json({
      success: true,
      data: { ...result.rows[0], tempPassword, emailSent },
    }, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[admin/invite] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
