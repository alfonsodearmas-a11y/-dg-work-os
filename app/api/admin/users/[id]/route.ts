import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import type { Role } from '@/lib/auth';

const VALID_ROLES: Role[] = ['dg', 'minister', 'ps', 'agency_admin', 'officer'];
const VALID_AGENCIES = ['gpl', 'cjia', 'gwi', 'gcaa', 'heci', 'marad', 'has'];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireRole(['dg']);
  if (authResult instanceof NextResponse) return authResult;
  const { session } = authResult;
  const { id } = await params;

  if (session.user.id === id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }
    updates.role = body.role;
  }

  if (body.agency !== undefined) {
    if (body.agency !== null && !VALID_AGENCIES.includes(body.agency)) {
      return NextResponse.json({ error: 'Invalid agency' }, { status: 400 });
    }
    updates.agency = body.agency;
  }

  if (body.is_active !== undefined) {
    updates.is_active = Boolean(body.is_active);
    // Sync status with is_active toggle
    updates.status = body.is_active ? 'active' : 'inactive';
  }

  // Enforce constraint: ministry roles must have null agency, agency roles must have agency
  const newRole = (updates.role as string) || undefined;
  if (newRole) {
    if (['dg', 'minister', 'ps'].includes(newRole)) {
      updates.agency = null;
    } else if (['agency_admin', 'officer'].includes(newRole) && !updates.agency && body.agency === undefined) {
      // Need to check if existing user already has an agency
      const { data: existing } = await supabaseAdmin
        .from('users')
        .select('agency')
        .eq('id', id)
        .single();
      if (!existing?.agency) {
        return NextResponse.json({ error: 'Agency is required for agency_admin and officer roles' }, { status: 400 });
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updates)
    .eq('id', id)
    .select('id, email, name, role, agency, is_active')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ user: data });
}
