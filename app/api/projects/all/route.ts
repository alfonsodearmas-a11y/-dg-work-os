import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('projects')
      .select('*')
      .limit(20);

    if (error) {
      console.error('Projects fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      count: data?.length || 0,
      projects: data || []
    });
  } catch (error) {
    console.error('Projects all error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}
