import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

// PUT /api/admin/users/[id]/password — DG sets/resets a user's Supabase Auth
// password. Supabase owns credentials post-cutover, so this updates
// auth.users.encrypted_password via the admin API (not users.password_hash).
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await requireRole(['superadmin']);
  if (authResult instanceof NextResponse) return authResult;

  const { password } = await req.json();
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
