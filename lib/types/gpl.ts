// ── GPL Domain Types ────────────────────────────────────────────────────────
// Strict interfaces for GPL Excel parsing, DB tables, and forecast I/O.

/**
 * Parsed station data from GPL Excel (Generation Status + Schedule sheets).
 * Used in gpl-excel-parser.ts as the per-station aggregate.
 */
export interface GPLStationData {
  units: number;
  installed_mva: number;
  derated_mw: number;
  available_mw: number;
  unit_details: GPLUnitDetail[];
}

export interface GPLUnitDetail {
  unit: string | number;
  installed_mva?: number;
  derated_mw: number;
  available_mw: number;
}

/**
 * Summary metrics extracted from the Excel Schedule sheet.
 */
export interface GPLParseSummaries {
  totalFossilCapacity: number;
  hampshireSolarMwp: number;
  prospectSolarMwp: number;
  trafalgarSolarMwp: number;
  totalRenewableCapacity: number;
  totalDBISCapacity: number;
  totalFossilFromSchedule?: number | null;
}

/**
 * Matches `gpl_snapshots` table (service connection tracking).
 */
export interface GPLSnapshot {
  id: string;
  snapshot_date: string;
  uploaded_at: string;
  file_name: string | null;
  track_a_outstanding: number;
  track_a_completed: number;
  track_b_design_outstanding: number;
  track_b_execution_outstanding: number;
  track_b_design_completed: number;
  track_b_execution_completed: number;
  track_b_total_outstanding: number;   // generated column
  data_quality_warnings: unknown[];
  warning_count: number;
  user_id: string | null;
}

/**
 * Matches `gpl_outstanding` table (service connection records).
 */
export interface GPLOutstanding {
  id: string;
  snapshot_id: string;
  track: 'A' | 'B';
  stage: 'metering' | 'design' | 'execution';
  row_number: number | null;
  customer_number: string | null;
  account_number: string | null;
  customer_name: string | null;
  service_address: string | null;
  town_city: string | null;
  account_status: string | null;
  cycle: string | null;
  account_type: string | null;
  division_code: string | null;
  service_order_number: string | null;
  service_type: string | null;
  date_created: string | null;
  current_date_ref: string | null;
  days_elapsed: number | null;
  days_elapsed_calculated: number | null;
}

/**
 * Shape of a row from `gpl_daily_summary` as actually stored/queried.
 * Used as the `latestDbis` in the enhanced forecast.
 */
export interface GPLDailySummary {
  id: string;
  upload_id: string;
  report_date: string;
  total_fossil_capacity_mw: number | null;
  expected_peak_demand_mw: number | null;
  reserve_capacity_mw: number | null;
  average_for: number | null;
  expected_capacity_mw: number | null;
  expected_reserve_mw: number | null;
  hampshire_solar_mwp: number | null;
  prospect_solar_mwp: number | null;
  trafalgar_solar_mwp: number | null;
  total_renewable_mwp: number | null;
  total_dbis_capacity_mw: number | null;
  evening_peak_on_bars_mw: number | null;
  evening_peak_suppressed_mw: number | null;
  day_peak_on_bars_mw: number | null;
  day_peak_suppressed_mw: number | null;
  gen_availability_at_suppressed_peak: number | null;
  approx_suppressed_peak: number | null;
  system_utilization_pct: number | null;
  reserve_margin_pct: number | null;
  created_at: string;
}

/**
 * Row from `gpl_daily_stations` as queried in forecast assembly.
 */
export interface GPLDailyStation {
  station: string;
  total_units: number;
  total_derated_capacity_mw: string;   // Supabase returns DECIMAL as string
  total_available_mw: string;          // Supabase returns DECIMAL as string
  units_online: number;
  units_offline: number;
}
