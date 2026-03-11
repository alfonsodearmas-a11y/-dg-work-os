import type { HealthBreakdownItem } from '@/lib/agency-health';

// ---------------------------------------------------------------------------
// Shared types for GPL detail tab components
// ---------------------------------------------------------------------------

export interface EnrichedStation {
  name: string;
  units: number;
  derated: number;
  available: number;
  availability: number;
  status: 'operational' | 'degraded' | 'critical' | 'offline';
}

export interface GPLSummary {
  totalDerated: number;
  totalAvailable: number;
  totalOffline: number;
  availability: number;
  totalUnits: number;
  totalSolar: number;
  totalDBIS: number;
  stations: EnrichedStation[];
  operational: EnrichedStation[];
  degraded: EnrichedStation[];
  critical: EnrichedStation[];
  offline: EnrichedStation[];
}

export interface ConsolidatedAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  station: string | null;
  detail: string | null;
  recommendation: string | null;
  category?: string;
}

export interface KpiDataEntry {
  value: number;
  changePct: number | null;
  previousValue: number | null;
}

export interface KpiState {
  latest: { success?: boolean; hasData?: boolean; kpis?: Record<string, KpiDataEntry> } | null;
  trends: any[];
  analysis: any;
}

export interface ComputedProjections {
  currentDbis: number;
  currentEsq: number;
  dbis: { '6mo': number; '12mo': number; '24mo': number; growthRate: number };
  esq: { '6mo': number; '12mo': number; '24mo': number; growthRate: number };
  usingFallback: boolean;
  chartData: { period: string; dbis: number; esq: number }[];
  capacity: any[];
  loadShedding: any;
}

export interface GPLHealthResult {
  score: number;
  label: string;
  severity: 'critical' | 'warning' | 'stable' | 'positive';
  breakdown: HealthBreakdownItem[];
}

// ---------------------------------------------------------------------------
// Shared utility functions
// ---------------------------------------------------------------------------

export function getStatusColor(status: string): string {
  return ({
    operational: '#10b981',
    degraded: '#f59e0b',
    critical: '#f97316',
    offline: '#ef4444'
  } as Record<string, string>)[status] || '#64748b';
}

export function getStatusBg(status: string): string {
  return ({
    operational: 'bg-emerald-500/[0.15] border-emerald-500/30 text-emerald-400',
    degraded: 'bg-amber-500/[0.15] border-amber-500/30 text-amber-400',
    critical: 'bg-orange-500/[0.15] border-orange-500/30 text-orange-400',
    offline: 'bg-red-500/[0.15] border-red-500/30 text-red-400'
  } as Record<string, string>)[status] || 'bg-navy-600/[0.15] border-navy-600/30 text-slate-400';
}
