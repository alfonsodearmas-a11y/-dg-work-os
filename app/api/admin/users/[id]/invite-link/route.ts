import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';
import { createInviteToken } from '@/lib/invite-tokens';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');

    const target = await query('SELECT id, status FROM users WHERE id = $1', [id]);
    if (target.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Always generate a fresh token (can't reverse hash of existing ones)
    const rawToken = await createInviteToken(id, 'invite', 7 * 24);
    const url = `${BASE_URL}/setup?token=${rawToken}`;

    return NextResponse.json({ success: true, url });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[invite-link] Error:', error.message);
    return NextResponse.json({ success: false, error: 'Failed to generate link' }, { status: 500 });
  }
}
