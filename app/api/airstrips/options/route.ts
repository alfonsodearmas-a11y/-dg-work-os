import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';

// GET /api/airstrips/options?category=activity_type
// or  /api/airstrips/options?categories=activity_type,verification_method
export async function GET(request: NextRequest) {
  try {
    const authResult = await requireRole(['superadmin', 'agency_manager']);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const single = searchParams.get('category');
    const multi = searchParams.get('categories');

    const categories = single
      ? [single]
      : multi
        ? multi.split(',').map(c => c.trim()).filter(Boolean)
        : [];

    if (categories.length === 0) {
      return NextResponse.json({ error: 'Provide ?category= or ?categories=' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('airstrip_option_types')
      .select('id, category, label, value, sort_order, is_active')
      .in('category', categories)
      .eq('is_active', true)
      .order('category')
      .order('sort_order');

    if (error) throw error;

    // Group by category for batch requests
    const grouped: Record<string, typeof data> = {};
    for (const row of data ?? []) {
      if (!grouped[row.category]) grouped[row.category] = [];
      grouped[row.category].push(row);
    }

    return NextResponse.json({ options: grouped });
  } catch (error) {
    console.error('Airstrip options error:', error);
    return NextResponse.json({ error: 'Failed to fetch options' }, { status: 500 });
  }
}
