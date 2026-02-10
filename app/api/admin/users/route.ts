import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    authorizeRoles(user, 'director', 'admin');

    const result = await query(
      `SELECT
         u.id,
         u.username,
         u.email,
         u.full_name,
         u.role,
         u.agency,
         u.is_active,
         u.status,
         u.must_change_password,
         u.last_login,
         u.created_at,
         COUNT(t.id) FILTER (WHERE t.status != 'verified') AS active_tasks,
         COUNT(t.id) FILTER (WHERE t.status = 'overdue') AS overdue_tasks,
         COUNT(t.id) FILTER (WHERE t.status = 'verified' AND t.verified_at >= NOW() - INTERVAL '30 days') AS completed_30d,
         latest_invite.created_at AS invite_sent_at,
         latest_invite.expires_at AS invite_expires_at
       FROM users u
       LEFT JOIN tasks t ON t.assignee_id = u.id
       LEFT JOIN LATERAL (
         SELECT created_at, expires_at
         FROM invite_tokens
         WHERE user_id = u.id AND type = 'invite'
         ORDER BY created_at DESC LIMIT 1
       ) latest_invite ON true
       GROUP BY u.id, u.username, u.email, u.full_name, u.role, u.agency,
                u.is_active, u.status, u.must_change_password, u.last_login, u.created_at,
                latest_invite.created_at, latest_invite.expires_at
       ORDER BY u.created_at DESC`
    );

    // Compute displayStatus
    const users = result.rows.map((u: any) => {
      let displayStatus = u.status || 'active';
      if (displayStatus === 'invited' && u.invite_expires_at && new Date(u.invite_expires_at) < new Date()) {
        displayStatus = 'expired';
      }
      return { ...u, displayStatus };
    });

    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
