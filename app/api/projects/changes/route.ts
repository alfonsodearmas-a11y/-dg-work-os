import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('project_uploads')
      .select('*')
      .order('uploaded_at', { ascending: false })
      .limit(10);

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Changes error:', error);
    return NextResponse.json({ error: 'Failed to fetch changes' }, { status: 500 });
  }
}
