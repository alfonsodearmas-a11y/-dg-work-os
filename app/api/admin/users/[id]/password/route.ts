import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

// PUT /api/admin/users/[id]/password — DG sets/resets a user's password
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;

  const { password } = await req.json();
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const { error } = await supabaseAdmin
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
