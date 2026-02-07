import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function POST() {
  try {
    await supabaseAdmin.from('project_uploads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { error } = await supabaseAdmin.from('projects').delete().neq('project_id', '');
    if (error) throw error;
    return NextResponse.json({ success: true, message: 'All project data cleared' });
  } catch (error) {
    console.error('Clear projects error:', error);
    return NextResponse.json({ error: 'Failed to clear projects', details: String(error) }, { status: 500 });
  }
}
