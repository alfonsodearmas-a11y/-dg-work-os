import { RawContextData, ContextLevel, ModelTier } from './types';
import { formatFullContext, PAGE_DESCRIPTIONS } from './context-engine';
import { format, parseISO, isPast, isToday } from 'date-fns';

// ── Tier → Context Level Mapping ────────────────────────────────────────────

export function contextLevelForTier(tier: ModelTier): ContextLevel {
  switch (tier) {
    case 'haiku': return 'minimal';
    case 'sonnet': return 'focused';
    case 'opus': return 'full';
  }
}

// ── Compressed Context Assembly ─────────────────────────────────────────────

export function assembleCompressedContext(
  raw: RawContextData,
  currentPage: string,
  level: ContextLevel,
): string {
  switch (level) {
    case 'minimal': return assembleMinimal(raw);
    case 'focused': return assembleFocused(raw, currentPage);
    case 'full':    return formatFullContext(raw, currentPage);
  }
}

// ── Level 1: Minimal (~400 tokens) ──────────────────────────────────────────
// Flat key-value pairs, no prose. Perfect for simple factual lookups.

function assembleMinimal(raw: RawContextData): string {
  const lines: string[] = [];
  const ts = format(new Date(), "yyyy-MM-dd HH:mm 'GYT'");
  lines.push(`DATA: ${ts}`);

  if (raw.gaps.length > 0) lines.push(`GAPS: ${raw.gaps.join(', ')}`);

  // Health scores
  lines.push(`HEALTH: GPL=${raw.health.gpl.score}/10, GWI=${raw.health.gwi.score}/10, CJIA=${raw.health.cjia.score}/10, GCAA=${raw.health.gcaa.score}/10`);

  // GPL key numbers
  if (raw.gpl.summary) {
    const s = raw.gpl.summary;
    const totalOnline = raw.gpl.stations.reduce((sum: number, st: any) => sum + (Number(st.units_online) || 0), 0);
    const totalUnits = raw.gpl.stations.reduce((sum: number, st: any) => sum + (Number(st.total_units) || 0), 0);
    lines.push(`GPL: Cap=${fmtNum(s.total_fossil_capacity_mw)}MW, Peak=${fmtNum(s.expected_peak_demand_mw)}MW, Reserve=${fmtNum(s.reserve_capacity_mw)}MW, ${totalOnline}/${totalUnits} units, Suppressed=${fmtNum(s.evening_peak_suppressed_mw)}MW`);
  } else {
    lines.push('GPL: No data');
  }

  // GWI key numbers
  if (raw.gwi.report) {
    const fin = raw.gwi.report.financial_data || {};
    const cs = raw.gwi.report.customer_service_data || {};
    const coll = raw.gwi.report.collections_data || {};
    lines.push(`GWI: Profit=$${fmtM(fin.net_profit)}, Revenue=$${fmtM(fin.total_revenue)}, Collections=$${fmtM(coll.total_collections)}, Resolution=${cs.resolution_rate_pct || 0}%, Accounts=${Number(coll.active_accounts) || 0}`);
  } else {
    lines.push('GWI: No data');
  }

  // CJIA
  if (raw.cjia) {
    const pax = raw.cjia.passenger_data || {};
    const ops = raw.cjia.operations_data || {};
    lines.push(`CJIA: Pax=${Number(pax.total_passengers || pax.departures) || 0}, OnTime=${ops.on_time_performance_pct || 'N/A'}%`);
  } else {
    lines.push('CJIA: No data');
  }

  // GCAA
  if (raw.gcaa) {
    const comp = raw.gcaa.compliance_data || {};
    const insp = raw.gcaa.inspection_data || {};
    const inc = raw.gcaa.incident_data || {};
    lines.push(`GCAA: Compliance=${comp.compliance_rate_pct || 'N/A'}%, Inspections=${insp.total_inspections || 0}, Incidents=${inc.total_incidents || 0}`);
  } else {
    lines.push('GCAA: No data');
  }

  // Projects
  if (raw.portfolio) {
    const p = raw.portfolio;
    lines.push(`PROJECTS: ${p.total_projects} total, ${p.delayed} delayed, ${p.in_progress} in progress, $${fmtM(p.total_value)} value`);
  }

  // Tasks
  const activeTasks = raw.tasks.filter(t => t.status !== 'Done');
  const overdue = activeTasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  lines.push(`TASKS: ${activeTasks.length} active, ${overdue.length} overdue`);

  // Calendar today
  lines.push(`CALENDAR: ${raw.todayEvents.length} events today`);

  return lines.join('\n');
}

// ── Level 2: Focused (~1.5K tokens) ────────────────────────────────────────
// Full detail for the current page's agency, one-liners for others.

function assembleFocused(raw: RawContextData, currentPage: string): string {
  const lines: string[] = [];
  const ts = format(new Date(), "yyyy-MM-dd HH:mm 'GYT'");
  lines.push(`=== DATA AS OF ${ts} ===`);
  if (raw.gaps.length > 0) lines.push(`GAPS: ${raw.gaps.join(', ')}`);

  // Health scores always
  lines.push('\n== HEALTH ==');
  lines.push(`GPL: ${raw.health.gpl.score}/10 (${raw.health.gpl.label}) — ${raw.health.gpl.breakdown}`);
  lines.push(`GWI: ${raw.health.gwi.score}/10 (${raw.health.gwi.label}) — ${raw.health.gwi.breakdown}`);
  lines.push(`CJIA: ${raw.health.cjia.score}/10 (${raw.health.cjia.label}) — ${raw.health.cjia.breakdown}`);
  lines.push(`GCAA: ${raw.health.gcaa.score}/10 (${raw.health.gcaa.label}) — ${raw.health.gcaa.breakdown}`);

  // Determine focus agency
  const focusAgency = detectFocusAgency(currentPage);

  // GPL
  if (focusAgency === 'gpl' && raw.gpl.summary) {
    lines.push(buildGPLDetail(raw));
  } else if (raw.gpl.summary) {
    const s = raw.gpl.summary;
    const totalOnline = raw.gpl.stations.reduce((sum: number, st: any) => sum + (Number(st.units_online) || 0), 0);
    const totalUnits = raw.gpl.stations.reduce((sum: number, st: any) => sum + (Number(st.total_units) || 0), 0);
    lines.push(`\nGPL: Cap ${fmtNum(s.total_fossil_capacity_mw)}MW, Peak ${fmtNum(s.expected_peak_demand_mw)}MW, Reserve ${fmtNum(s.reserve_capacity_mw)}MW, ${totalOnline}/${totalUnits} units`);
  }

  // GWI
  if (focusAgency === 'gwi' && raw.gwi.report) {
    lines.push(buildGWIDetail(raw));
  } else if (raw.gwi.report) {
    const fin = raw.gwi.report.financial_data || {};
    const cs = raw.gwi.report.customer_service_data || {};
    lines.push(`\nGWI: Profit $${fmtM(fin.net_profit)}, Revenue $${fmtM(fin.total_revenue)}, Resolution ${cs.resolution_rate_pct || 0}%`);
  }

  // CJIA
  if (focusAgency === 'cjia' && raw.cjia) {
    lines.push(buildCJIADetail(raw));
  } else if (raw.cjia) {
    const pax = raw.cjia.passenger_data || {};
    lines.push(`\nCJIA: ${Number(pax.total_passengers || pax.departures) || 0} passengers, On-time ${raw.cjia.operations_data?.on_time_performance_pct || 'N/A'}%`);
  }

  // GCAA
  if (focusAgency === 'gcaa' && raw.gcaa) {
    lines.push(buildGCAADetail(raw));
  } else if (raw.gcaa) {
    const comp = raw.gcaa.compliance_data || {};
    lines.push(`\nGCAA: Compliance ${comp.compliance_rate_pct || 'N/A'}%, Incidents ${raw.gcaa.incident_data?.total_incidents || 0}`);
  }

  // Projects (always included, compact)
  if (raw.portfolio) {
    const p = raw.portfolio;
    lines.push(`\n== PROJECTS ==`);
    lines.push(`Total: ${p.total_projects}, Delayed: ${p.delayed}, Value: $${fmtM(p.total_value)}`);
    if (raw.delayed.length > 0 && (currentPage.startsWith('/projects') || focusAgency === null)) {
      const top5 = raw.delayed.slice(0, 5);
      top5.forEach((d, i) => {
        lines.push(`${i + 1}. ${d.project_name || d.project_id} — ${d.days_overdue}d overdue — ${d.completion_pct}%`);
      });
    }
  }

  // Tasks (compact)
  const activeTasks = raw.tasks.filter(t => t.status !== 'Done');
  const overdue = activeTasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)));
  const dueToday = activeTasks.filter(t => t.due_date && isToday(new Date(t.due_date)));
  lines.push(`\n== TASKS: ${activeTasks.length} active, ${overdue.length} overdue, ${dueToday.length} today ==`);

  // Calendar today
  if (raw.todayEvents.length > 0) {
    lines.push(`\n== TODAY: ${raw.todayEvents.length} events ==`);
    for (const ev of raw.todayEvents.slice(0, 5)) {
      const time = ev.all_day ? 'All day' : ev.start_time ? format(parseISO(ev.start_time), 'h:mm a') : '??';
      lines.push(`- ${time}: ${ev.title}`);
    }
  }

  // Page context
  const pageDesc = PAGE_DESCRIPTIONS[currentPage] || currentPage;
  lines.push(`\nCONTEXT: ${currentPage} — ${pageDesc}`);

  return lines.join('\n');
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function detectFocusAgency(page: string): string | null {
  if (page.includes('/gpl')) return 'gpl';
  if (page.includes('/gwi')) return 'gwi';
  if (page.includes('/cjia')) return 'cjia';
  if (page.includes('/gcaa')) return 'gcaa';
  return null;
}

function fmtNum(v: unknown): string {
  const n = Number(v);
  return isNaN(n) ? 'N/A' : n.toFixed(1);
}

function fmtM(v: unknown): string {
  const n = Number(v);
  if (isNaN(n)) return 'N/A';
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

function buildGPLDetail(raw: RawContextData): string {
  const s = raw.gpl.summary!;
  const lines: string[] = [];
  lines.push(`\n== GPL DETAIL ==`);
  lines.push(`System: Capacity ${fmtNum(s.total_fossil_capacity_mw)}MW, Peak ${fmtNum(s.expected_peak_demand_mw)}MW, Reserve ${fmtNum(s.reserve_capacity_mw)}MW`);
  lines.push(`Evening Peak: On-bars ${fmtNum(s.evening_peak_on_bars_mw)}MW, Suppressed ${fmtNum(s.evening_peak_suppressed_mw)}MW`);
  if (raw.gpl.stations.length > 0) {
    lines.push('Stations:');
    for (const st of raw.gpl.stations) {
      const stAny = st as any;
      lines.push(`  ${stAny.station}: ${stAny.units_online}/${stAny.total_units} online, ${fmtNum(stAny.total_available_mw)}/${fmtNum(stAny.total_derated_capacity_mw)}MW`);
    }
  }
  if (Object.keys(raw.gpl.kpis).length > 0) {
    const m = raw.gpl.kpiMonth ? format(parseISO(raw.gpl.kpiMonth), 'MMM yyyy') : '';
    lines.push(`KPIs (${m}):`);
    for (const [name, val] of Object.entries(raw.gpl.kpis)) {
      lines.push(`  ${name}: ${val.toFixed(2)}`);
    }
  }
  return lines.join('\n');
}

function buildGWIDetail(raw: RawContextData): string {
  const gwi = raw.gwi.report!;
  const lines: string[] = [];
  lines.push(`\n== GWI DETAIL ==`);
  const fin = gwi.financial_data || {};
  lines.push(`Financial: Profit $${fmtM(fin.net_profit)}, Revenue $${fmtM(fin.total_revenue)}, OpCost $${fmtM(fin.operating_cost)}, Cash $${fmtM(fin.cash_at_bank)}`);
  const coll = gwi.collections_data || {};
  lines.push(`Collections: Total $${fmtM(coll.total_collections)}, On-time ${coll.on_time_payment_pct || 'N/A'}%, Receivable $${fmtM(coll.accounts_receivable)}`);
  const cs = gwi.customer_service_data || {};
  lines.push(`Service: Complaints ${cs.total_complaints}, Resolved ${cs.resolved_complaints} (${cs.resolution_rate_pct}%), Timeline ${cs.within_timeline_pct}%`);
  return lines.join('\n');
}

function buildCJIADetail(raw: RawContextData): string {
  const cjia = raw.cjia!;
  const lines: string[] = [];
  lines.push(`\n== CJIA DETAIL ==`);
  const pax = cjia.passenger_data || {};
  const ops = cjia.operations_data || {};
  const rev = cjia.revenue_data || {};
  if (Object.keys(pax).length > 0) lines.push(`Passengers: ${JSON.stringify(pax)}`);
  if (Object.keys(ops).length > 0) lines.push(`Operations: ${JSON.stringify(ops)}`);
  if (Object.keys(rev).length > 0) lines.push(`Revenue: ${JSON.stringify(rev)}`);
  return lines.join('\n');
}

function buildGCAADetail(raw: RawContextData): string {
  const gcaa = raw.gcaa!;
  const lines: string[] = [];
  lines.push(`\n== GCAA DETAIL ==`);
  const comp = gcaa.compliance_data || {};
  const insp = gcaa.inspection_data || {};
  const inc = gcaa.incident_data || {};
  if (Object.keys(comp).length > 0) lines.push(`Compliance: ${JSON.stringify(comp)}`);
  if (Object.keys(insp).length > 0) lines.push(`Inspections: ${JSON.stringify(insp)}`);
  if (Object.keys(inc).length > 0) lines.push(`Incidents: ${JSON.stringify(inc)}`);
  return lines.join('\n');
}
