/**
 * Merge multiple report-type rows for the same month into a single combined object.
 * GWI stores management, cscr, and procurement data in separate rows
 * with unique constraint (report_month, report_type).
 *
 * After merging, applies a fallback hierarchy:
 *   1. Direct extraction (Claude found it in report text)
 *   2. Component sum (derive total from extracted sub-items)
 *   3. Cross-report derivation (e.g., CSCR billings → total_revenue)
 *   4. Explicitly missing with reason
 */

export const GWI_REPORT_COLUMNS = 'id, report_month, report_type, financial_data, collections_data, customer_service_data, procurement_data, created_at';

interface ReportRow {
  id: string;
  report_month: string;
  report_type: string;
  financial_data: Record<string, unknown> | null;
  collections_data: Record<string, unknown> | null;
  customer_service_data: Record<string, unknown> | null;
  procurement_data: Record<string, unknown> | null;
  created_at: string;
}

export interface MergedReport {
  id: string;
  report_month: string;
  financial_data: Record<string, unknown>;
  collections_data: Record<string, unknown>;
  customer_service_data: Record<string, unknown>;
  procurement_data: Record<string, unknown>;
  created_at: string;
}

export interface MetaEntry {
  source: 'extracted' | 'computed' | 'cscr_billings_fallback' | 'gog_funded_fallback' | 'missing';
  reason?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function hasData(obj: Record<string, unknown> | null): obj is Record<string, unknown> {
  return obj != null && Object.keys(obj).length > 0;
}

function isNum(v: unknown): v is number {
  if (v == null) return false;
  if (typeof v === 'number') return !isNaN(v);
  if (typeof v === 'string' && v.trim() !== '') return !isNaN(Number(v));
  return false;
}

function toNum(v: unknown): number {
  return Number(v);
}

function missingReason(field: string): string {
  switch (field) {
    case 'total_revenue':
      return 'Value embedded as image in management report; not found in narrative text or CSCR billings';
    case 'operating_cost':
      return 'Value embedded as image in management report; insufficient cost components to compute';
    case 'govt_subvention':
      return 'Not found in management report narrative or procurement GoG funding data';
    case 'net_profit':
      return 'Not found in narrative text; could not compute (requires both total_revenue and operating_cost)';
    case 'cash_at_bank':
      return 'Balance sheet value embedded as image; not found in narrative text';
    case 'net_assets':
      return 'Balance sheet value embedded as image; not found in narrative text';
    default:
      return 'Not found in uploaded reports';
  }
}

// ── Core merge ───────────────────────────────────────────────────────────────

export function mergeReportTypes(rows: ReportRow[]): MergedReport | null {
  if (!rows || rows.length === 0) return null;

  const merged: MergedReport = {
    id: rows[0].id,
    report_month: rows[0].report_month,
    financial_data: {},
    collections_data: {},
    customer_service_data: {},
    procurement_data: {},
    created_at: rows[0].created_at,
  };

  for (const row of rows) {
    if (hasData(row.financial_data)) {
      Object.assign(merged.financial_data, row.financial_data);
    }
    if (hasData(row.collections_data)) {
      Object.assign(merged.collections_data, row.collections_data);
    }
    if (hasData(row.customer_service_data)) {
      Object.assign(merged.customer_service_data, row.customer_service_data);
    }
    if (hasData(row.procurement_data)) {
      Object.assign(merged.procurement_data, row.procurement_data);
    }
  }

  applyFallbacks(merged);
  return merged;
}

/** Group rows by report_month and merge each group. Returns groups in original order. */
export function groupAndMerge(rows: ReportRow[]): MergedReport[] {
  const groups = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const existing = groups.get(row.report_month);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(row.report_month, [row]);
    }
  }
  const results: MergedReport[] = [];
  for (const group of groups.values()) {
    const merged = mergeReportTypes(group);
    if (merged) results.push(merged);
  }
  return results;
}

// ── Fallback hierarchy ───────────────────────────────────────────────────────

const KEY_FIELDS = ['total_revenue', 'operating_cost', 'govt_subvention', 'net_profit', 'cash_at_bank', 'net_assets'] as const;

function applyFallbacks(merged: MergedReport): void {
  const fin = merged.financial_data;
  const coll = merged.collections_data;
  const proc = merged.procurement_data;
  const meta: Record<string, MetaEntry> = {};

  // 1. Mark fields that were directly extracted
  for (const key of KEY_FIELDS) {
    if (isNum(fin[key])) {
      meta[key] = { source: 'extracted' };
    }
  }

  // 2. Fallback: total_revenue from component sum
  if (!isNum(fin.total_revenue)) {
    const parts = [fin.tariff_revenue, fin.other_operating_revenue, fin.non_operating_revenue];
    const valid = parts.filter(isNum);
    if (valid.length >= 2) {
      fin.total_revenue = valid.reduce((s, v) => s + toNum(v), 0);
      meta.total_revenue = { source: 'computed' };
    }
  }

  // 3. Fallback: total_revenue from CSCR total_billings
  if (!isNum(fin.total_revenue) && isNum(coll.total_billings)) {
    fin.total_revenue = toNum(coll.total_billings);
    meta.total_revenue = { source: 'cscr_billings_fallback' };
  }

  // 4. Fallback: operating_cost from component sum
  if (!isNum(fin.operating_cost)) {
    const components = ['employment_cost', 'premises_cost', 'supplies_services', 'transport_cost', 'admin_cost', 'depreciation'];
    const valid = components.map(k => fin[k]).filter(isNum);
    if (valid.length >= 3) {
      fin.operating_cost = valid.reduce((s: number, v) => s + toNum(v), 0);
      meta.operating_cost = { source: 'computed' };
    }
  }

  // 5. Fallback: govt_subvention from procurement GoG funded
  if (!isNum(fin.govt_subvention) && isNum(proc.gog_funded)) {
    fin.govt_subvention = toNum(proc.gog_funded);
    meta.govt_subvention = { source: 'gog_funded_fallback' };
  }

  // 6. Fallback: net_profit from total_revenue - operating_cost
  if (!isNum(fin.net_profit) && isNum(fin.total_revenue) && isNum(fin.operating_cost)) {
    fin.net_profit = toNum(fin.total_revenue) - toNum(fin.operating_cost);
    meta.net_profit = { source: 'computed', reason: 'total_revenue - operating_cost' };
  }

  // 7. Mark anything still null as explicitly missing
  for (const key of KEY_FIELDS) {
    if (!meta[key]) {
      if (isNum(fin[key])) {
        meta[key] = { source: 'extracted' };
      } else {
        meta[key] = { source: 'missing', reason: missingReason(key) };
      }
    }
  }

  fin._meta = meta;
}
