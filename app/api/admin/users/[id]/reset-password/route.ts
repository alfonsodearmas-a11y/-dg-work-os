import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { revokeUserTokens, createInviteToken } from '@/lib/invite-tokens';
import { sendTaskEmail } from '@/lib/task-notifications';
import { passwordResetEmail } from '@/lib/task-email-templates';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const target = await query('SELECT id, full_name, email, status FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const targetUser = target.rows[0];
    if (targetUser.status !== 'active') {
      return NextResponse.json({ success: false, error: 'Can only reset password for active users' }, { status: 400 });
    }

    // Revoke existing reset tokens
    await revokeUserTokens(id, 'password_reset');

    // Generate token (1-hour expiry)
    const rawToken = await createInviteToken(id, 'password_reset', 1);
    const resetUrl = `${BASE_URL}/reset-password?token=${rawToken}`;

    // Send email
    let emailSent = false;
    try {
      const emailData = passwordResetEmail(targetUser.full_name, resetUrl);
      await sendTaskEmail(targetUser.email, emailData.subject, emailData.html);
      emailSent = true;
    } catch (err) {
      console.error('[reset-password] Failed to send email:', err);
    }

    return NextResponse.json({ success: true, emailSent, resetUrl });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[reset-password] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to initiate password reset' }, { status: 500 });
  }
}
