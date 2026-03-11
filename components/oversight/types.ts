// ── Scraped Oversight Types ────────────────────────────────────────────────

export interface OversightData {
  metadata: {
    generatedAt: string;
    totalProjects: number;
    analysisDate: string;
  };
  dashboard: {
    kpis: {
      totalContractCost: number | null;
      totalContractCostDisplay: string | null;
      totalDisbursement: number | null;
      totalDisbursementDisplay: string | null;
      totalBalance: number | null;
      totalBalanceDisplay: string | null;
      totalProjects: number | null;
      utilizationPercent: number | null;
      engineerEstimate: number | null;
      engineerEstimateDisplay: string | null;
    };
    statusChart: Record<string, { percent: number; count: number } | number | null>;
    scrapedAt: string;
  };
  summary: {
    delayed: number;
    overdue: number;
    endingSoon: number;
    atRisk: number;
    bondWarnings: number;
  };
  delayed: any[];
  overdue: any[];
  endingSoon: any[];
  atRisk: any[];
  bondWarnings: any[];
  agencyBreakdown: {
    agency: string;
    agencyFull: string | null;
    projectCount: number;
    totalValue: number;
    totalValueDisplay: string | null;
    avgCompletion: number | null;
  }[];
  top10: any[];
}

// ── PSIP Project Types ─────────────────────────────────────────────────────

export interface Project {
  id: string;
  project_id: string;
  executing_agency: string | null;
  sub_agency: string | null;
  project_name: string | null;
  short_name: string | null;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  project_end_date: string | null;
  completion_pct: number;
  has_images: number;
  status: string;
  days_overdue: number;
  health: 'green' | 'amber' | 'red';
  escalated: boolean;
  escalation_reason: string | null;
  assigned_to: string | null;
  start_date: string | null;
  revised_start_date: string | null;
  // Detail fields from oversight scraper
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

export interface PortfolioSummary {
  total_projects: number;
  total_value: number;
  complete: number;
  in_progress: number;
  delayed: number;
  not_started: number;
  delayed_value: number;
  at_risk: number;
  agencies: { agency: string; total: number; complete: number; in_progress: number; delayed: number; not_started: number; total_value: number; avg_completion: number }[];
  regions: Record<string, number>;
}

export interface SavedFilter {
  id: string;
  filter_name: string;
  filter_params: Record<string, any>;
  created_at: string;
}

export type ViewMode = 'list' | 'timeline';
export type TabMode = 'alerts' | 'projects';

// ── Constants ──────────────────────────────────────────────────────────────

export const AGENCY_OPTIONS = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];
export const REGION_OPTIONS = [
  { value: '01', label: 'Region 1 – Barima-Waini' },
  { value: '02', label: 'Region 2 – Pomeroon-Supenaam' },
  { value: '03', label: 'Region 3 – Essequibo Islands-West Demerara' },
  { value: '04', label: 'Region 4 – Demerara-Mahaica' },
  { value: '05', label: 'Region 5 – Mahaica-Berbice' },
  { value: '06', label: 'Region 6 – East Berbice-Corentyne' },
  { value: '07', label: 'Region 7 – Cuyuni-Mazaruni' },
  { value: '08', label: 'Region 8 – Potaro-Siparuni' },
  { value: '09', label: 'Region 9 – Upper Takutu-Upper Essequibo' },
  { value: '10', label: 'Region 10 – Upper Demerara-Berbice' },
  { value: 'GT', label: 'Georgetown' },
  { value: 'MR', label: 'Multi-Region' },
];
export const STATUS_OPTIONS = ['Commenced', 'Delayed', 'Awarded', 'Designed', 'Completed', 'Rollover', 'Cancelled'];
export const HEALTH_OPTIONS = [
  { value: 'green', label: 'On Track', color: 'bg-emerald-500' },
  { value: 'amber', label: 'Minor Issues', color: 'bg-amber-500' },
  { value: 'red', label: 'Critical', color: 'bg-red-500' },
];

export { PROJECT_STATUS_VARIANTS as STATUS_STYLES, HEALTH_DOT } from '@/lib/constants/agencies';

// ── Formatting ─────────────────────────────────────────────────────────────

export function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return '-';
  if (value > 1e11) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

export function fmtCurrency(value: number | string | null | undefined, allowZero = false): string {
  if (value === null || value === undefined || value === '-') return 'N/A';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num)) return 'N/A';
  if (num === 0) return allowZero ? '$0' : 'N/A';
  if (num < 0) return 'N/A';
  if (num > 1e11) return 'N/A';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtRegion(code: string | null): string {
  if (!code) return '-';
  if (code === 'GT') return 'Georgetown';
  if (code === 'MR') return 'Multi-Region';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}
