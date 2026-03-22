// ── Project Domain Types ────────────────────────────────────────────────────
// Strict interfaces for the `projects` table and computed enrichment.

/**
 * Raw row shape returned by Supabase from the `projects` table.
 * Matches DB columns exactly — no computed fields.
 */
export interface RawProjectRow {
  id: string;
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string | null;
  short_name: string | null;
  region: string | null;
  tender_board_type: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  health: string;               // DB stores 'green'|'amber'|'red' but may be stale
  escalated: boolean;
  escalation_reason: string | null;
  assigned_to: string | null;
  start_date: string | null;
  revised_start_date: string | null;
  balance_remaining: number | null;
  remarks: string | null;
  project_status: string | null;
  extension_reason: string | null;
  extension_date: string | null;
  project_extended: boolean;
  total_distributed: number | null;
  total_expended: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * Normalized scraped project from oversight.gov.gy.
 * Different shape from Supabase projects — camelCase fields.
 */
export interface ScrapedOversightProject {
  id: string | null;
  reference: string | null;
  name: string | null;
  agency: string | null;
  region: string | null;
  contractor: string | null;
  contractValue: number | null;
  contractValueDisplay: string | null;
  completion: number | null;
  endDate: string | null;
  // Raw scraper fields may vary
  [key: string]: unknown;
}
