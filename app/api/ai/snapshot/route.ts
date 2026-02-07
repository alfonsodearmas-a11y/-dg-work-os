import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { MetricSnapshot } from '@/lib/ai/types';
import { assembleRawData, computeGPLHealth, computeGWIHealth, computeCJIAHealth, computeGCAAHealth } from '@/lib/ai/context-engine';
import { isPast, isToday } from 'date-fns';

// ── GET /api/ai/snapshot ────────────────────────────────────────────────────
// Returns today's metric snapshot for the ChatPanel's local answer engine.
// If no precomputed snapshot exists, builds one on the fly.

export async function GET(_request: NextRequest) {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Try precomputed snapshot first
    const { data: cached } = await supabaseAdmin
      .from('ai_metric_snapshot')
      .select('snapshot_data')
      .eq('snapshot_date', today)
      .maybeSingle();

    if (cached?.snapshot_data) {
      return NextResponse.json(cached.snapshot_data);
    }

    // Build on the fly from raw data
    const raw = await assembleRawData();
    const snapshot = buildSnapshot(raw);

    // Store for later
    try {
      await supabaseAdmin.from('ai_metric_snapshot').upsert({
        snapshot_date: today,
        snapshot_data: snapshot,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'snapshot_date' });
    } catch { /* ignore store errors */ }

    return NextResponse.json(snapshot);
  } catch (err: any) {
    console.error('[ai/snapshot] Error:', err.message);
    return NextResponse.json({ error: 'Failed to build snapshot' }, { status: 500 });
  }
}

// ── Build Snapshot from Raw Data ────────────────────────────────────────────

function buildSnapshot(raw: import('@/lib/ai/types').RawContextData): MetricSnapshot {
  const activeTasks = raw.tasks.filter(t => t.status !== 'Done');
  const overdue = activeTasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const dueToday = activeTasks.filter(t => t.due_date && isToday(new Date(t.due_date)));

  return {
    timestamp: new Date().toISOString(),
    gpl: {
      health: raw.health.gpl,
      capacity_mw: raw.gpl.summary ? Number(raw.gpl.summary.total_fossil_capacity_mw) || null : null,
      peak_demand_mw: raw.gpl.summary ? Number(raw.gpl.summary.expected_peak_demand_mw) || null : null,
      reserve_mw: raw.gpl.summary ? Number(raw.gpl.summary.reserve_capacity_mw) || null : null,
      units_online: raw.gpl.stations.reduce((s, st: any) => s + (Number(st.units_online) || 0), 0) || null,
      units_total: raw.gpl.stations.reduce((s, st: any) => s + (Number(st.total_units) || 0), 0) || null,
      suppressed_mw: raw.gpl.summary ? Number(raw.gpl.summary.evening_peak_suppressed_mw) || null : null,
      report_date: raw.gpl.reportDate,
    },
    gwi: {
      health: raw.health.gwi,
      net_profit: raw.gwi.report?.financial_data?.net_profit ?? null,
      total_revenue: raw.gwi.report?.financial_data?.total_revenue ?? null,
      collections: raw.gwi.report?.collections_data?.total_collections ?? null,
      resolution_rate_pct: raw.gwi.report?.customer_service_data?.resolution_rate_pct ?? null,
      active_accounts: raw.gwi.report?.collections_data?.active_accounts ?? null,
      report_month: raw.gwi.report?.report_month ?? null,
    },
    cjia: {
      health: raw.health.cjia,
      total_passengers: raw.cjia?.passenger_data?.total_passengers ?? raw.cjia?.passenger_data?.departures ?? null,
      on_time_pct: raw.cjia?.operations_data?.on_time_performance_pct ?? null,
      report_month: raw.cjia?.report_month ?? null,
    },
    gcaa: {
      health: raw.health.gcaa,
      compliance_rate_pct: raw.gcaa?.compliance_data?.compliance_rate_pct ?? null,
      total_inspections: raw.gcaa?.inspection_data?.total_inspections ?? null,
      incidents: raw.gcaa?.incident_data?.total_incidents ?? null,
      report_month: raw.gcaa?.report_month ?? null,
    },
    projects: {
      total: raw.portfolio?.total_projects ?? 0,
      delayed: raw.portfolio?.delayed ?? 0,
      in_progress: raw.portfolio?.in_progress ?? 0,
      complete: raw.portfolio?.complete ?? 0,
      not_started: raw.portfolio?.not_started ?? 0,
      total_value: raw.portfolio?.total_value ?? 0,
    },
    tasks: {
      active: activeTasks.length,
      overdue: overdue.length,
      due_today: dueToday.length,
    },
  };
}
