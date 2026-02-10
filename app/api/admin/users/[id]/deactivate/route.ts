import { NextRequest, NextResponse } from 'next/server';
import { authenticateAny, authorizeRoles, AuthError } from '@/lib/auth';
import { query } from '@/lib/db-pg';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateAny(request);
    authorizeRoles(user, 'director', 'admin');
    const { id } = await params;

    if (id === user.id) {
      return NextResponse.json({ success: false, error: 'Cannot deactivate your own account' }, { status: 400 });
    }

    await query('UPDATE users SET is_active = false WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof AuthError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
