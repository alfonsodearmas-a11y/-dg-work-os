import { supabaseAdmin } from '@/lib/db';
import { fetchAllTasks, Task } from '@/lib/notion';
import { fetchTodayEvents, fetchWeekEvents } from '@/lib/google-calendar';
import { getPortfolioSummary, getDelayedProjects, PortfolioSummary, Project } from '@/lib/project-queries';
import { CalendarEvent } from '@/lib/calendar-types';
import { format, parseISO, isPast, isToday, differenceInDays, addDays } from 'date-fns';

// ── Cache ────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  context: string;
  timestamp: number;
  page: string;
}

let contextCache: CacheEntry | null = null;

export function invalidateContextCache(): void {
  contextCache = null;
}

// ── Health Scores ────────────────────────────────────────────────────────────

interface HealthScore {
  score: number;       // 0-10
  label: string;
  breakdown: string;
}

function healthLabel(score: number): string {
  if (score >= 8) return 'Strong';
  if (score >= 6) return 'Adequate';
  if (score >= 4) return 'Concerning';
  if (score >= 2) return 'Poor';
  return 'Critical';
}

function computeGPLHealth(summary: Record<string, unknown> | null, stations: Record<string, unknown>[] | null, kpis: Record<string, number>): HealthScore {
  if (!summary) return { score: 0, label: 'No Data', breakdown: 'No GPL data uploaded' };

  let score = 5; // baseline
  const parts: string[] = [];

  // Reserve margin (higher is better, 15%+ is good)
  const reserveMw = Number(summary.reserve_capacity_mw) || 0;
  const peakMw = Number(summary.expected_peak_demand_mw) || 1;
  const reservePct = (reserveMw / peakMw) * 100;
  if (reservePct >= 20) score += 2;
  else if (reservePct >= 10) score += 1;
  else if (reservePct < 5) score -= 2;
  else score -= 1;
  parts.push(`Reserve Margin ${reservePct.toFixed(1)}%`);

  // Station availability
  const totalUnits = stations?.reduce((s, st) => s + (Number(st.total_units) || 0), 0) || 0;
  const onlineUnits = stations?.reduce((s, st) => s + (Number(st.units_online) || 0), 0) || 0;
  const availPct = totalUnits > 0 ? (onlineUnits / totalUnits) * 100 : 0;
  if (availPct >= 70) score += 1;
  else if (availPct < 50) score -= 2;
  else score -= 1;
  parts.push(`${onlineUnits}/${totalUnits} units online`);

  // Suppressed demand (lower is better)
  const suppressed = Number(summary.evening_peak_suppressed_mw) || 0;
  if (suppressed === 0) score += 1;
  else if (suppressed > 20) score -= 1;
  if (suppressed > 0) parts.push(`${suppressed.toFixed(1)}MW suppressed`);

  // Collection rate from KPIs
  const collectionRate = kpis['Collection Rate %'];
  if (collectionRate !== undefined) {
    if (collectionRate >= 95) score += 1;
    else if (collectionRate < 85) score -= 1;
    parts.push(`Collection ${collectionRate.toFixed(1)}%`);
  }

  const clamped = Math.max(0, Math.min(10, score));
  return { score: clamped, label: healthLabel(clamped), breakdown: parts.join(', ') };
}

function computeGWIHealth(report: Record<string, any> | null): HealthScore {
  if (!report) return { score: 0, label: 'No Data', breakdown: 'No GWI data uploaded' };

  let score = 5;
  const parts: string[] = [];
  const cs = report.customer_service_data || {};
  const coll = report.collections_data || {};
  const fin = report.financial_data || {};

  // Resolution rate
  const resRate = Number(cs.resolution_rate_pct) || 0;
  if (resRate >= 90) score += 2;
  else if (resRate >= 75) score += 1;
  else if (resRate < 60) score -= 2;
  else score -= 1;
  parts.push(`Resolution ${resRate}%`);

  // Within timeline
  const timeline = Number(cs.within_timeline_pct) || 0;
  if (timeline >= 80) score += 1;
  else if (timeline < 50) score -= 1;
  parts.push(`Within Timeline ${timeline}%`);

  // Collections vs billings
  const collections = Number(coll.total_collections) || 0;
  const billings = Number(coll.total_billings) || 1;
  const collRatio = (collections / billings) * 100;
  if (collRatio >= 100) score += 1;
  else if (collRatio < 80) score -= 1;
  parts.push(`Collections $${(collections / 1e6).toFixed(0)}M`);

  // Net profit vs budget
  const profit = Number(fin.net_profit) || 0;
  const profitBudget = Number(fin.net_profit_budget) || 1;
  if (profit >= profitBudget) score += 1;
  else if (profit < 0) score -= 2;

  const clamped = Math.max(0, Math.min(10, score));
  return { score: clamped, label: healthLabel(clamped), breakdown: parts.join(', ') };
}

function computeCJIAHealth(report: Record<string, any> | null): HealthScore {
  if (!report) return { score: 0, label: 'No Data', breakdown: 'No CJIA data uploaded' };

  let score = 5;
  const parts: string[] = [];
  const ops = report.operations_data || {};
  const pax = report.passenger_data || {};

  const totalPax = Number(pax.total_passengers) || Number(pax.departures) || 0;
  if (totalPax > 0) parts.push(`${(totalPax / 1000).toFixed(1)}K passengers`);

  const onTime = Number(ops.on_time_performance_pct) || 0;
  if (onTime > 0) {
    if (onTime >= 85) score += 2;
    else if (onTime >= 70) score += 1;
    else score -= 1;
    parts.push(`On-time ${onTime}%`);
  }

  const clamped = Math.max(0, Math.min(10, score));
  return { score: clamped, label: healthLabel(clamped), breakdown: parts.length > 0 ? parts.join(', ') : 'Limited data available' };
}

function computeGCAAHealth(report: Record<string, any> | null): HealthScore {
  if (!report) return { score: 0, label: 'No Data', breakdown: 'No GCAA data uploaded' };

  let score = 5;
  const parts: string[] = [];
  const compliance = report.compliance_data || {};
  const inspections = report.inspection_data || {};

  const compRate = Number(compliance.compliance_rate_pct) || 0;
  if (compRate > 0) {
    if (compRate >= 90) score += 2;
    else if (compRate >= 75) score += 1;
    else score -= 1;
    parts.push(`Compliance ${compRate}%`);
  }

  const inspTotal = Number(inspections.total_inspections) || 0;
  if (inspTotal > 0) parts.push(`${inspTotal} inspections`);

  const incidents = Number(report.incident_data?.total_incidents) || 0;
  if (incidents === 0) score += 1;
  else if (incidents > 5) score -= 1;
  if (incidents > 0) parts.push(`${incidents} incidents`);

  const clamped = Math.max(0, Math.min(10, score));
  return { score: clamped, label: healthLabel(clamped), breakdown: parts.length > 0 ? parts.join(', ') : 'Limited data available' };
}

// ── Formatting Helpers ───────────────────────────────────────────────────────

function $(n: number | null | undefined, decimals = 0): string {
  if (n == null || isNaN(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(decimals + 1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(decimals)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(decimals)}K`;
  return `$${n.toFixed(decimals)}`;
}

function pct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return 'N/A';
  return `${n.toFixed(1)}%`;
}

function num(n: number | null | undefined, decimals = 1): string {
  if (n == null || isNaN(n)) return 'N/A';
  return n.toFixed(decimals);
}

// ── Data Fetchers ────────────────────────────────────────────────────────────

async function fetchGWILatest(): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabaseAdmin
      .from('gwi_monthly_reports')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

async function fetchGWIInsights(): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabaseAdmin
      .from('gwi_ai_insights')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

async function fetchGWIComplaints(): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabaseAdmin
      .from('gwi_weekly_reports')
      .select('*')
      .order('report_week', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

async function fetchGPLLatestSummary(): Promise<{ summary: Record<string, any> | null; stations: Record<string, any>[]; reportDate: string | null }> {
  try {
    const { data: upload } = await supabaseAdmin
      .from('gpl_uploads')
      .select('id, report_date')
      .eq('status', 'confirmed')
      .order('report_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!upload) return { summary: null, stations: [], reportDate: null };

    const [summaryRes, stationsRes] = await Promise.all([
      supabaseAdmin
        .from('gpl_daily_summary')
        .select('*')
        .eq('upload_id', upload.id)
        .maybeSingle(),
      supabaseAdmin
        .from('gpl_daily_stations')
        .select('*')
        .eq('upload_id', upload.id)
        .order('station'),
    ]);

    return {
      summary: summaryRes.data,
      stations: stationsRes.data || [],
      reportDate: upload.report_date,
    };
  } catch { return { summary: null, stations: [], reportDate: null }; }
}

async function fetchGPLKpis(): Promise<{ kpis: Record<string, number>; month: string | null }> {
  try {
    const { data: latest } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('report_month')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latest) return { kpis: {}, month: null };

    const { data: rows } = await supabaseAdmin
      .from('gpl_monthly_kpis')
      .select('kpi_name, value')
      .eq('report_month', latest.report_month);

    const kpis: Record<string, number> = {};
    for (const r of rows || []) {
      kpis[r.kpi_name] = parseFloat(r.value);
    }
    return { kpis, month: latest.report_month };
  } catch { return { kpis: {}, month: null }; }
}

async function fetchCJIALatest(): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabaseAdmin
      .from('cjia_monthly_reports')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

async function fetchGCAALatest(): Promise<Record<string, any> | null> {
  try {
    const { data } = await supabaseAdmin
      .from('gcaa_monthly_reports')
      .select('*')
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  } catch { return null; }
}

// ── Page Descriptions ────────────────────────────────────────────────────────

const PAGE_DESCRIPTIONS: Record<string, string> = {
  '/': 'Daily Briefing — overview of tasks, calendar, and alerts',
  '/intel': 'Agency Intel Overview — comparison of all agencies',
  '/intel/gpl': 'GPL Deep Dive — power generation, stations, KPIs, forecasts',
  '/intel/gwi': 'GWI Deep Dive — water utility metrics and financials',
  '/intel/cjia': 'CJIA Deep Dive — airport passenger analytics',
  '/intel/gcaa': 'GCAA Deep Dive — civil aviation compliance',
  '/projects': 'PSIP Project Tracker — infrastructure project oversight',
  '/documents': 'Document Vault — uploaded documents and AI analysis',
  '/admin': 'Admin Portal — user management and data entry',
  '/calendar': 'Calendar — schedule and meetings',
};

// ── Main Assembly ────────────────────────────────────────────────────────────

export async function assembleSystemContext(currentPage: string): Promise<string> {
  // Check cache
  if (contextCache && contextCache.page === currentPage && (Date.now() - contextCache.timestamp) < CACHE_TTL_MS) {
    return contextCache.context;
  }

  const timestamp = format(new Date(), "yyyy-MM-dd HH:mm 'GYT'");
  const gaps: string[] = [];

  // Fetch all data in parallel
  const [
    gwiReport,
    gwiInsights,
    gwiComplaints,
    gplData,
    gplKpiData,
    cjiaReport,
    gcaaReport,
    portfolioResult,
    delayedResult,
    tasksResult,
    todayEventsResult,
    weekEventsResult,
  ] = await Promise.allSettled([
    fetchGWILatest(),
    fetchGWIInsights(),
    fetchGWIComplaints(),
    fetchGPLLatestSummary(),
    fetchGPLKpis(),
    fetchCJIALatest(),
    fetchGCAALatest(),
    getPortfolioSummary(),
    getDelayedProjects(),
    fetchAllTasks(),
    fetchTodayEvents(),
    fetchWeekEvents(),
  ]);

  // Extract values with fallbacks
  const gwi = gwiReport.status === 'fulfilled' ? gwiReport.value : null;
  const gwiAi = gwiInsights.status === 'fulfilled' ? gwiInsights.value : null;
  const gwiComp = gwiComplaints.status === 'fulfilled' ? gwiComplaints.value : null;
  const gpl = gplData.status === 'fulfilled' ? gplData.value : { summary: null, stations: [], reportDate: null };
  const gplKpi = gplKpiData.status === 'fulfilled' ? gplKpiData.value : { kpis: {}, month: null };
  const cjia = cjiaReport.status === 'fulfilled' ? cjiaReport.value : null;
  const gcaa = gcaaReport.status === 'fulfilled' ? gcaaReport.value : null;
  const portfolio = portfolioResult.status === 'fulfilled' ? portfolioResult.value : null;
  const delayed = delayedResult.status === 'fulfilled' ? delayedResult.value : [];
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : [];
  const todayEvents = todayEventsResult.status === 'fulfilled' ? todayEventsResult.value : [];
  const weekEvents = weekEventsResult.status === 'fulfilled' ? weekEventsResult.value : [];

  if (tasksResult.status === 'rejected') gaps.push('Notion tasks unavailable');
  if (todayEventsResult.status === 'rejected') gaps.push('Google Calendar unavailable');

  // Compute health scores
  const gplHealth = computeGPLHealth(gpl.summary, gpl.stations, gplKpi.kpis);
  const gwiHealth = computeGWIHealth(gwi);
  const cjiaHealth = computeCJIAHealth(cjia);
  const gcaaHealth = computeGCAAHealth(gcaa);

  // ── Build context string ──

  const lines: string[] = [];
  lines.push(`=== SYSTEM DATA AS OF ${timestamp} ===`);
  if (gaps.length > 0) {
    lines.push(`\nDATA GAPS: ${gaps.join('; ')}`);
  }

  // ── Health Scores ──
  lines.push('\n== AGENCY HEALTH SCORES ==');
  lines.push(`GPL: ${gplHealth.score}/10 (${gplHealth.label}) — ${gplHealth.breakdown}`);
  lines.push(`GWI: ${gwiHealth.score}/10 (${gwiHealth.label}) — ${gwiHealth.breakdown}`);
  lines.push(`CJIA: ${cjiaHealth.score}/10 (${cjiaHealth.label}) — ${cjiaHealth.breakdown}`);
  lines.push(`GCAA: ${gcaaHealth.score}/10 (${gcaaHealth.label}) — ${gcaaHealth.breakdown}`);

  // ── GWI Section ──
  if (gwi) {
    const month = gwi.report_month ? format(parseISO(gwi.report_month), 'MMMM yyyy') : 'Unknown';
    lines.push(`\n== GWI — LATEST REPORT (${month}) ==`);

    const fin = gwi.financial_data || {};
    const profitVarPct = Number(fin.net_profit_variance_pct) || 0;
    const revBudget = Number(fin.total_revenue_budget) || 1;
    const revActual = Number(fin.total_revenue) || 0;
    const revVarPct = ((revActual - revBudget) / revBudget * 100);
    const opBudget = Number(fin.operating_cost_budget) || 1;
    const opActual = Number(fin.operating_cost) || 0;
    const opVarPct = ((opActual - opBudget) / opBudget * 100);
    lines.push(`Financial: Net Profit ${$(fin.net_profit)} (${profitVarPct > 0 ? '+' : ''}${profitVarPct}% vs budget), Total Revenue ${$(fin.total_revenue)} (${revVarPct > 0 ? '+' : ''}${revVarPct.toFixed(0)}% vs budget), Govt Subvention ${$(fin.govt_subvention)}, Operating Cost ${$(fin.operating_cost)} (${opVarPct > 0 ? '+' : ''}${opVarPct.toFixed(0)}% vs budget), Cash at Bank ${$(fin.cash_at_bank)}, Net Assets ${$(fin.net_assets)}`);

    const coll = gwi.collections_data || {};
    lines.push(`Collections: Total ${$(coll.total_collections)}, YTD ${$(coll.ytd_collections)}, On-time ${pct(coll.on_time_payment_pct)}, Active Accounts ${(Number(coll.active_accounts) || 0).toLocaleString()}, Receivable ${$(coll.accounts_receivable)}`);

    if (currentPage === '/intel/gwi' || currentPage === '/intel') {
      // Extra regional detail
      lines.push(`  Regional: R1 ${$(coll.region_1_collections)}, R2 ${$(coll.region_2_collections)}, R3 ${$(coll.region_3_collections)}, R4 ${$(coll.region_4_collections)}, R5 ${$(coll.region_5_collections)}`);
      lines.push(`  Arrears: 30-day ${$(coll.arrears_30_days)}, 60-day ${$(coll.arrears_60_days)}, 90+ ${$(coll.arrears_90_plus_days)}`);
    }

    const cs = gwi.customer_service_data || {};
    lines.push(`Customer Service: Complaints ${cs.total_complaints}, Resolved ${cs.resolved_complaints} (${pct(cs.resolution_rate_pct)}), Within timeline ${pct(cs.within_timeline_pct)}, Unresolved ${cs.unresolved_complaints}, Disconnections ${cs.disconnections}, Reconnections ${cs.reconnections}`);

    const proc = gwi.procurement_data || {};
    lines.push(`Procurement: Total ${$(proc.total_purchases)}, GOG ${$(proc.gog_funded)} (${pct(proc.gog_funded_pct)}), GWI ${$(proc.gwi_funded)} (${pct(proc.gwi_funded_pct)}), Major contracts ${proc.major_contracts_count} @ ${$(proc.major_contracts_value)}, Minor ${proc.minor_contracts_count} @ ${$(proc.minor_contracts_value)}, Inventory ${$(proc.inventory_value)}`);

    // GWI AI insights if on GWI page
    if ((currentPage === '/intel/gwi' || currentPage === '/intel') && gwiAi?.insight_json) {
      const insight = gwiAi.insight_json;
      if (insight.executive_summary) {
        lines.push(`\nGWI AI ANALYSIS: ${insight.executive_summary}`);
      }
    }
  } else {
    lines.push('\n== GWI — No data uploaded ==');
  }

  // ── GWI Weekly Complaints ──
  if (gwiComp) {
    const week = gwiComp.report_week ? format(parseISO(gwiComp.report_week), 'MMM d, yyyy') : 'Unknown';
    const cd = gwiComp.complaints_data || {};
    lines.push(`\nGWI Weekly Complaints (${week}): ${JSON.stringify(cd).length > 10 ? `Total ${cd.total_complaints || 'N/A'}, New ${cd.new_complaints || 'N/A'}, Resolved ${cd.resolved || 'N/A'}` : 'No data'}`);
  }

  // ── GPL Section ──
  if (gpl.summary) {
    const rd = gpl.reportDate ? format(parseISO(gpl.reportDate), 'MMM d, yyyy') : 'Unknown';
    lines.push(`\n== GPL — LATEST DATA (${rd}) ==`);

    const s = gpl.summary;
    lines.push(`System: Fossil Capacity ${num(Number(s.total_fossil_capacity_mw))}MW, Peak Demand ${num(Number(s.expected_peak_demand_mw))}MW, Reserve ${num(Number(s.reserve_capacity_mw))}MW`);
    lines.push(`Evening Peak: On-bars ${num(Number(s.evening_peak_on_bars_mw))}MW, Suppressed ${num(Number(s.evening_peak_suppressed_mw))}MW`);
    lines.push(`Renewables: Hampshire ${num(Number(s.solar_hampshire_mwp))}MWp, Prospect ${num(Number(s.solar_prospect_mwp))}MWp, Trafalgar ${num(Number(s.solar_trafalgar_mwp))}MWp, Total ${num(Number(s.total_renewable_mwp))}MWp`);

    // Stations
    if (gpl.stations.length > 0) {
      const stationLines = gpl.stations.map((st: any) =>
        `  ${st.station}: ${st.units_online}/${st.total_units} online, ${num(Number(st.total_available_mw))}/${num(Number(st.total_derated_capacity_mw))}MW`
      );

      if (currentPage === '/intel/gpl' || currentPage === '/intel') {
        // Full station detail
        lines.push('Stations:');
        lines.push(...stationLines);
      } else {
        // Summary only
        const totalOnline = gpl.stations.reduce((s: number, st: any) => s + (Number(st.units_online) || 0), 0);
        const totalUnits = gpl.stations.reduce((s: number, st: any) => s + (Number(st.total_units) || 0), 0);
        lines.push(`Stations: ${gpl.stations.length} stations, ${totalOnline}/${totalUnits} units online`);
      }
    }

    // Monthly KPIs
    if (Object.keys(gplKpi.kpis).length > 0) {
      const m = gplKpi.month ? format(parseISO(gplKpi.month), 'MMM yyyy') : '';
      lines.push(`Monthly KPIs (${m}):`);
      for (const [name, val] of Object.entries(gplKpi.kpis)) {
        lines.push(`  ${name}: ${num(val, 2)}`);
      }
    }
  } else {
    lines.push('\n== GPL — No data uploaded ==');
  }

  // ── CJIA Section ──
  if (cjia) {
    const month = cjia.report_month ? format(parseISO(cjia.report_month), 'MMMM yyyy') : 'Unknown';
    lines.push(`\n== CJIA — LATEST REPORT (${month}) ==`);
    const ops = cjia.operations_data || {};
    const pax = cjia.passenger_data || {};
    const rev = cjia.revenue_data || {};
    if (Object.keys(pax).length > 0) lines.push(`Passengers: ${JSON.stringify(pax)}`);
    if (Object.keys(ops).length > 0) lines.push(`Operations: ${JSON.stringify(ops)}`);
    if (Object.keys(rev).length > 0) lines.push(`Revenue: ${JSON.stringify(rev)}`);
  } else {
    lines.push('\n== CJIA — No data uploaded ==');
  }

  // ── GCAA Section ──
  if (gcaa) {
    const month = gcaa.report_month ? format(parseISO(gcaa.report_month), 'MMMM yyyy') : 'Unknown';
    lines.push(`\n== GCAA — LATEST REPORT (${month}) ==`);
    const comp = gcaa.compliance_data || {};
    const insp = gcaa.inspection_data || {};
    const inc = gcaa.incident_data || {};
    if (Object.keys(comp).length > 0) lines.push(`Compliance: ${JSON.stringify(comp)}`);
    if (Object.keys(insp).length > 0) lines.push(`Inspections: ${JSON.stringify(insp)}`);
    if (Object.keys(inc).length > 0) lines.push(`Incidents: ${JSON.stringify(inc)}`);
  } else {
    lines.push('\n== GCAA — No data uploaded ==');
  }

  // ── Projects Section ──
  if (portfolio) {
    lines.push('\n== PROJECTS OVERVIEW ==');
    lines.push(`Total: ${portfolio.total_projects} projects, ${$(portfolio.total_value)} portfolio value`);
    lines.push(`By Status: ${portfolio.in_progress} In Progress, ${portfolio.delayed} Delayed, ${portfolio.complete} Complete, ${portfolio.not_started} Not Started`);

    // By agency
    const agencyLine = portfolio.agencies.map(a =>
      `${a.agency} ${a.total} (${$(a.total_value)}, ${a.delayed} delayed)`
    ).join(', ');
    lines.push(`By Agency: ${agencyLine}`);

    // Top delayed projects
    const maxDelayed = (currentPage === '/projects' || currentPage.startsWith('/projects/')) ? delayed.length : 10;
    const topDelayed = delayed.slice(0, maxDelayed);
    if (topDelayed.length > 0) {
      lines.push(`\nTOP DELAYED PROJECTS (most overdue):`);
      topDelayed.forEach((p, i) => {
        lines.push(`${i + 1}. ${p.project_name || p.project_id} — ${p.sub_agency || 'Unknown'} — ${p.days_overdue} days overdue — ${$(Number(p.contract_value))} — ${p.completion_pct}% complete`);
      });
    }
  } else {
    lines.push('\n== PROJECTS — No data available ==');
  }

  // ── Tasks Section ──
  lines.push('\n== TASKS ==');
  if (tasks.length > 0) {
    const now = new Date();
    const overdue = tasks.filter(t => t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date)) && t.status !== 'Done');
    const dueToday = tasks.filter(t => t.due_date && isToday(new Date(t.due_date)) && t.status !== 'Done');
    const dueThisWeek = tasks.filter(t => {
      if (!t.due_date || t.status === 'Done') return false;
      const d = new Date(t.due_date);
      return !isToday(d) && !isPast(d) && d <= addDays(now, 7);
    });
    const activeTasks = tasks.filter(t => t.status !== 'Done');

    lines.push(`Total: ${activeTasks.length} active tasks, ${overdue.length} overdue, ${dueToday.length} due today, ${dueThisWeek.length} due this week`);

    // By agency
    const byAgency: Record<string, { total: number; overdue: number }> = {};
    for (const t of activeTasks) {
      const ag = t.agency || 'General';
      if (!byAgency[ag]) byAgency[ag] = { total: 0, overdue: 0 };
      byAgency[ag].total++;
      if (t.due_date && isPast(new Date(t.due_date)) && !isToday(new Date(t.due_date))) {
        byAgency[ag].overdue++;
      }
    }
    const agLine = Object.entries(byAgency).map(([ag, v]) =>
      `${ag} ${v.total}${v.overdue > 0 ? ` (${v.overdue} overdue)` : ''}`
    ).join(', ');
    lines.push(`By Agency: ${agLine}`);

    // Overdue tasks
    if (overdue.length > 0) {
      lines.push('\nOVERDUE TASKS:');
      overdue.forEach((t, i) => {
        const daysOver = differenceInDays(now, new Date(t.due_date!));
        lines.push(`${i + 1}. ${t.title} — ${t.agency || 'General'} — due ${t.due_date} — ${daysOver} days overdue — ${t.status}`);
      });
    }

    // Due today
    if (dueToday.length > 0) {
      lines.push('\nDUE TODAY:');
      dueToday.forEach((t, i) => {
        lines.push(`${i + 1}. ${t.title} — ${t.agency || 'General'} — ${t.status}`);
      });
    }

    // On briefing page, include all active tasks
    if (currentPage === '/' || currentPage === '/briefing') {
      if (dueThisWeek.length > 0) {
        lines.push('\nDUE THIS WEEK:');
        dueThisWeek.forEach((t, i) => {
          lines.push(`${i + 1}. ${t.title} — ${t.agency || 'General'} — due ${t.due_date} — ${t.status}`);
        });
      }
    }
  } else {
    lines.push('No tasks available (Notion may be disconnected)');
  }

  // ── Calendar Section ──
  lines.push('\n== CALENDAR ==');
  const todayStr = format(new Date(), 'EEEE, MMMM d, yyyy');
  if (todayEvents.length > 0) {
    lines.push(`Today (${todayStr}): ${todayEvents.length} events`);
    for (const ev of todayEvents) {
      const time = ev.all_day ? 'All day' : ev.start_time ? format(parseISO(ev.start_time), 'h:mm a') : '??';
      const end = ev.end_time && !ev.all_day ? ` – ${format(parseISO(ev.end_time), 'h:mm a')}` : '';
      const loc = ev.location ? ` [${ev.location}]` : '';
      lines.push(`- ${time}${end}: ${ev.title}${loc}`);
    }
  } else {
    lines.push(`Today (${todayStr}): No events`);
  }

  // Week events grouped by day
  if (weekEvents.length > 0) {
    const byDay: Record<string, CalendarEvent[]> = {};
    for (const ev of weekEvents) {
      if (!ev.start_time) continue;
      const dayKey = format(parseISO(ev.start_time), 'EEEE, MMM d');
      if (!byDay[dayKey]) byDay[dayKey] = [];
      byDay[dayKey].push(ev);
    }

    lines.push('This Week:');
    for (const [day, evs] of Object.entries(byDay)) {
      const titles = evs.map(e => e.title).join(', ');
      lines.push(`- ${day}: ${evs.length} events — ${titles}`);
    }
  }

  // ── Current Context ──
  const pageDesc = PAGE_DESCRIPTIONS[currentPage] || `Page: ${currentPage}`;
  lines.push(`\n== CURRENT CONTEXT ==`);
  lines.push(`User is on: ${currentPage} — ${pageDesc}`);

  const context = lines.join('\n');

  // Update cache
  contextCache = { context, timestamp: Date.now(), page: currentPage };

  return context;
}
