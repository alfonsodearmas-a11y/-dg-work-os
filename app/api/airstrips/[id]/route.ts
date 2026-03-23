import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logger } from '@/lib/logger';

// GET /api/airstrips/[id] — full detail with related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireRole(['dg', 'minister', 'ps', 'agency_admin', 'officer']);
    if (authResult instanceof NextResponse) return authResult;

    const { id } = await params;

    // Fetch airstrip + related data in parallel
    const [airstripRes, maintenanceRes, photosRes, inspectionsRes, statusLogRes] = await Promise.all([
      supabaseAdmin.from('airstrips').select('*').eq('id', id).single(),
      supabaseAdmin
        .from('airstrip_maintenance_log')
        .select('*, verified_by_user:users!airstrip_maintenance_log_verified_by_fkey(name)')
        .eq('airstrip_id', id)
        .order('performed_date', { ascending: false }),
      supabaseAdmin
        .from('airstrip_photos')
        .select('*')
        .eq('airstrip_id', id)
        .order('uploaded_at', { ascending: false }),
      supabaseAdmin
        .from('airstrip_inspections')
        .select('*')
        .eq('airstrip_id', id)
        .order('inspection_date', { ascending: false }),
      supabaseAdmin
        .from('airstrip_status_log')
        .select('*, changed_by_user:users!airstrip_status_log_changed_by_fkey(name)')
        .eq('airstrip_id', id)
        .order('changed_at', { ascending: false }),
    ]);

    if (airstripRes.error || !airstripRes.data) {
      return NextResponse.json({ error: 'Airstrip not found' }, { status: 404 });
    }

    // Compute quick stats
    const now = new Date();
    const currentQ = Math.ceil((now.getMonth() + 1) / 3);
    const currentYear = now.getFullYear();
    const quarterStr = `Q${currentQ} ${currentYear}`;

    const maintenance = maintenanceRes.data || [];
    const quarterMaintenance = maintenance.filter(m => m.quarter === quarterStr);

    return NextResponse.json({
      airstrip: airstripRes.data,
      maintenance,
      photos: photosRes.data || [],
      inspections: inspectionsRes.data || [],
      statusLog: (statusLogRes.data || []).map((s: Record<string, unknown>) => ({
        ...s,
        changed_by_name: (s.changed_by_user as { name: string } | null)?.name || null,
      })),
      quickStats: {
        currentQuarter: quarterStr,
        maintenanceThisQuarter: quarterMaintenance.length,
        verifiedThisQuarter: quarterMaintenance.filter(m => m.verified).length,
        unverifiedThisQuarter: quarterMaintenance.filter(m => !m.verified).length,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Airstrip detail error');
    return NextResponse.json({ error: 'Failed to fetch airstrip' }, { status: 500 });
  }
}
