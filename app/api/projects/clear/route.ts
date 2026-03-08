import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { apiError } from '@/lib/api-utils';

export async function POST() {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  try {
    await supabaseAdmin.from('project_uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabaseAdmin.from('projects').delete().neq('project_id', '');
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'All project data cleared' });
  } catch (err) {
    console.error('Clear projects error:', err);
    return apiError('CLEAR_FAILED', 'Failed to clear projects', 500);
  }
}
