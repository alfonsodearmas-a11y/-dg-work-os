import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { revokeUserTokens, createInviteToken } from '@/lib/invite-tokens';
import { sendTaskEmail } from '@/lib/task-notifications';
import { accountSetupEmail } from '@/lib/task-email-templates';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const target = await query('SELECT id, full_name, email, role, agency, status FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    const targetUser = target.rows[0];

    // Revoke existing unconsumed invite tokens
    await revokeUserTokens(id, 'invite');

    // Ensure user is in invited state
    if (targetUser.status !== 'invited') {
      await query("UPDATE users SET status = 'invited' WHERE id = $1", [id]);
    }

    // Generate new invite token (7 days)
    const rawToken = await createInviteToken(id, 'invite', 7 * 24);
    const setupUrl = `${BASE_URL}/setup?token=${rawToken}`;

    // Send email
    let emailSent = false;
    try {
      const emailData = accountSetupEmail(targetUser.full_name, targetUser.role, targetUser.agency, setupUrl);
      await sendTaskEmail(targetUser.email, emailData.subject, emailData.html);
      emailSent = true;
    } catch (err) {
      console.error('[resend-invite] Failed to send email:', err);
    }

    return NextResponse.json({ success: true, emailSent });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[resend-invite] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to resend invite' }, { status: 500 });
  }
}
