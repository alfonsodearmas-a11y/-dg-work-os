import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { requireRole } from '@/lib/auth-helpers';
import { apiError } from '@/lib/api-utils';
import { logger } from '@/lib/logger';

export async function POST() {
  const result = await requireRole(['dg']);
  if (result instanceof NextResponse) return result;

  try {
    await supabaseAdmin.from('project_uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabaseAdmin.from('projects').delete().neq('project_id', '');
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'All project data cleared' });
  } catch (err) {
    logger.error({ err }, 'Failed to clear projects');
    return apiError('CLEAR_FAILED', 'Failed to clear projects', 500);
  }
}
