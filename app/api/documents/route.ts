import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agency = searchParams.get('agency');
    const type = searchParams.get('type');
    const search = searchParams.get('search');

    let query = supabaseAdmin
      .from('documents')
      .select('*')
      .eq('processing_status', 'completed');

    if (agency) {
      query = query.eq('agency', agency);
    }
    if (type) {
      query = query.eq('document_type', type);
    }
    if (search) {
      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
    }

    const { data, error } = await query
      .order('uploaded_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Documents list error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
