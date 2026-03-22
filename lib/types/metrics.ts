// ── Metrics Domain Types ────────────────────────────────────────────────────
// Types for daily metric analysis and agency health snapshots.

/**
 * Shape of a parsed daily metric record (from daily-excel-parser.ts).
 * Used as input to ai-analysis.ts `analyzeMetrics()`.
 */
export interface MetricRow {
  row: number;
  metric_name: string;
  category: string | null;
  subcategory: string | null;
  agency: string | null;
  unit: string | null;
  raw_value: string | number | null;
  numeric_value: number | null;
  value_type: 'number' | 'percentage' | 'currency' | 'text' | 'error' | 'empty';
  has_error: boolean;
  error_detail: string | null;
}

/**
 * Matches `agency_health_snapshots` table.
 */
export interface AgencyHealthSnapshot {
  id: string;
  agency_slug: string;
  health_score: number | null;
  status: 'live' | 'building' | 'offline';
  kpi_snapshot: Record<string, unknown> | null;
  computed_at: string;
}
