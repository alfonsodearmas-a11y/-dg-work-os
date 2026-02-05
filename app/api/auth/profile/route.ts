import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request);
    const result = await query(
      'SELECT id, username, email, full_name, role, agency, last_login, created_at FROM users WHERE id = $1',
      [user.id]
    );

    const row = result.rows[0];
    return NextResponse.json({
      success: true,
      data: { id: row.id, username: row.username, email: row.email, fullName: row.full_name, role: row.role, agency: row.agency, lastLogin: row.last_login, createdAt: row.created_at },
    });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ success: false, error: 'Failed to get profile' }, { status: 500 });
  }
}
