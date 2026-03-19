'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { InsightCard } from '@/components/ui/InsightCard';
import { hasValue } from '@/lib/gwi-metric-display';
import type { GWIInsights } from '@/lib/gwi-insights';

// ── Shared Constants ────────────────────────────────────────────────────────

export type MetricStatusColor = 'good' | 'warning' | 'critical' | 'neutral' | 'muted';

export const STATUS_COLORS: Record<MetricStatusColor, string> = {
  good: 'text-emerald-400',
  warning: 'text-amber-400',
  critical: 'text-red-400',
  neutral: 'text-slate-100',
  muted: 'text-navy-600',
};

// ── Threshold Status Helper ─────────────────────────────────────────────────

/**
 * Map a numeric value to a status color using thresholds.
 * Returns 'muted' for null/NaN, otherwise compares against good/warn thresholds.
 * Assumes good >= warn (higher is better).
 */
export function thresholdStatus(
  value: number | undefined | null,
  good: number,
  warn: number,
): MetricStatusColor {
  if (!hasValue(value)) return 'muted';
  if (value >= good) return 'good';
  if (value >= warn) return 'warning';
  return 'critical';
}

// ── Insight Card Builder ────────────────────────────────────────────────────

type InsightDomain = 'financial' | 'operational' | 'customer_service' | 'procurement';

const DOMAIN_EMOJI: Record<InsightDomain, string> = {
  financial: '\uD83D\uDCB0',
  operational: '\uD83D\uDCCA',
  customer_service: '\uD83D\uDC65',
  procurement: '\uD83D\uDCE6',
};

const DOMAIN_FALLBACK_TITLE: Record<InsightDomain, string> = {
  financial: 'Financial Analysis',
  operational: 'Collections Analysis',
  customer_service: 'Customer Service Analysis',
  procurement: 'Procurement Analysis',
};

export function DomainInsightCard({ insights, domain }: { insights: GWIInsights | null; domain: InsightDomain }) {
  const section = insights?.[domain];
  if (!section) return null;
  return (
    <InsightCard
      card={{
        emoji: DOMAIN_EMOJI[domain],
        title: section.headline || DOMAIN_FALLBACK_TITLE[domain],
        severity: section.severity || 'stable',
        summary: section.summary || '',
        detail: section.recommendations?.join('\n') || null,
      }}
    />
  );
}

// ── Detail Cell (small metric in secondary/expandable sections) ─────────────

export function DetailCell({ label, value, color, subtitle }: {
  label: string;
  value: string;
  color?: string;
  subtitle?: string;
}) {
  const isMissing = value === 'N/R';
  return (
    <div className="bg-navy-950 rounded-lg p-2.5 border border-navy-800">
      <p className="text-navy-600 text-[11px] mb-0.5">{label}</p>
      <p className={`text-base font-bold ${isMissing ? 'text-navy-600' : (color || 'text-slate-100')}`}>
        {value}
      </p>
      {subtitle && <p className="text-[10px] mt-0.5 opacity-70" style={{ color: 'inherit' }}>{subtitle}</p>}
    </div>
  );
}

// ── Score Badge ─────────────────────────────────────────────────────────────

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-navy-800 text-navy-600">
        N/A
      </span>
    );
  }

  const style = score >= 7.5
    ? 'bg-emerald-500/15 text-emerald-400'
    : score >= 5.0
    ? 'bg-amber-500/15 text-amber-400'
    : 'bg-red-500/15 text-red-400';

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${style}`}>
      {score.toFixed(1)}
    </span>
  );
}

// ── Metric Card ─────────────────────────────────────────────────────────────

export interface MetricCardProps {
  title: string;
  value: string;
  status?: MetricStatusColor;
  badge?: ReactNode;
  tooltip?: string | null;
  estimated?: boolean;
}

export function MetricCard({ title, value, badge, status = 'neutral', tooltip, estimated }: MetricCardProps) {
  return (
    <div className="bg-navy-950 rounded-lg border border-navy-800 p-3" title={tooltip || undefined}>
      <div className="flex items-center gap-1 mb-1.5">
        <p className="text-slate-400 text-xs">{title}</p>
        {estimated && <Info className="w-3 h-3 text-cyan-400/60" />}
      </div>
      <p className={`text-lg md:text-xl font-bold leading-tight ${STATUS_COLORS[status]}`}>{value}</p>
      {badge && <div className="mt-1.5">{badge}</div>}
    </div>
  );
}

// ── Signal Card (larger variant for the top-level signal row) ───────────────

export function SignalCard({ title, value, status = 'neutral', tooltip }: {
  title: string;
  value: string;
  status?: MetricStatusColor;
  tooltip?: string | null;
}) {
  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 p-3 md:p-4" title={tooltip || undefined}>
      <p className="text-slate-400 text-xs md:text-[13px] mb-1.5">{title}</p>
      <p className={`text-xl md:text-[28px] font-bold leading-tight ${STATUS_COLORS[status]}`}>{value}</p>
    </div>
  );
}

// ── Domain Card Wrapper ─────────────────────────────────────────────────────

interface DomainCardProps {
  title: string;
  /** Per-domain score from AI insights (1-10). TODO: Derive deterministic per-domain scores from health breakdown factors. */
  score: number | null | undefined;
  primaryMetrics: ReactNode;
  secondaryContent: ReactNode;
  insightContent?: ReactNode;
}

export function DomainCard({ title, score, primaryMetrics, secondaryContent, insightContent }: DomainCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="bg-navy-900 rounded-xl border border-navy-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h4 className="text-[15px] font-semibold text-white">{title}</h4>
        <ScoreBadge score={score} />
      </div>

      {/* Primary Metrics — always visible */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2">
          {primaryMetrics}
        </div>
      </div>

      {/* Details toggle + secondary content */}
      <div className="border-t border-navy-800">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] transition-colors"
        >
          <span>{showDetails ? 'Hide details' : 'View details'}</span>
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showDetails ? 'rotate-180' : ''}`} />
        </button>
        <div className={`collapse-grid ${showDetails ? 'open' : ''}`}>
          <div>
            <div className="px-4 pb-4 space-y-3">
              {secondaryContent}
              {insightContent}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
