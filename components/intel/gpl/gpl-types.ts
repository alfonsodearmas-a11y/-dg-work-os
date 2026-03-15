import type { HealthBreakdownItem } from '@/lib/agency-health';

// ---------------------------------------------------------------------------
// Shared types for GPL detail tab components
// ---------------------------------------------------------------------------

export interface EnrichedStation {
  name: string;
  units: number;
  derated: number;
  available: number;
  /** Clamped to [0, 100] for display. Use `overCapacity` to detect anomalies. */
  availability: number;
  /** True when raw available MW exceeds derated capacity (data anomaly). */
  overCapacity: boolean;
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

/** Enrich a raw station (derated + available) into display-ready form. */
export function enrichStation(s: { name: string; units: number; derated: number; available: number }): EnrichedStation {
  const ratio = s.derated > 0 ? s.available / s.derated : 0;
  return {
    ...s,
    availability: Math.min(ratio * 100, 100),
    overCapacity: s.available > s.derated && s.derated > 0,
    status: s.available === 0 ? 'offline'
      : ratio < 0.5 ? 'critical'
      : ratio < 0.7 ? 'degraded'
      : 'operational',
  };
}

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
