'use client';

import type { RiskTier, InterventionType, InterventionStatus } from '@/lib/delayed-projects/types';
import {
  AlertTriangle,
  MapPin, Users, Calendar, Hammer,
  FileWarning, Scale, Clock, MessageSquare,
} from 'lucide-react';

// ── Risk Tier Badge ─────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskTier, string> = {
  HIGH: 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_8px_rgba(239,68,68,0.3)]',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.25)]',
  LOW: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_6px_rgba(16,185,129,0.15)]',
  NO_DATA: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function RiskTierBadge({ tier }: { tier: RiskTier }) {
  const label = tier === 'NO_DATA' ? 'NO DATA' : tier;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${RISK_STYLES[tier]}`}>
      {label}
    </span>
  );
}

// ── Agency Badge ────────────────────────────────────────────────────────────

import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';

export function AgencyBadge({ agency }: { agency: string }) {
  const color = AGENCY_HEX_COLORS[agency] || '#64748b';
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap"
      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
    >
      {agency}
    </span>
  );
}

// ── Shared overdue color logic ──────────────────────────────────────────────

function daysOverdueColor(days: number): string {
  if (days > 365) return 'text-red-400 font-bold';
  if (days > 90) return 'text-amber-400 font-semibold';
  return 'text-slate-400';
}

// ── Days Overdue Badge ──────────────────────────────────────────────────────

export function DaysOverdueBadge({ endDate }: { endDate: string | null }) {
  if (!endDate) {
    return <span className="text-xs text-slate-500 italic">No date</span>;
  }
  const end = new Date(endDate + 'T00:00:00');
  const diff = Math.ceil((new Date().getTime() - end.getTime()) / (1000 * 60 * 60 * 24));

  if (diff <= 0) {
    const label = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return <span className="text-xs text-blue-400">Ends {label}</span>;
  }

  return <span className={`text-xs tabular-nums ${daysOverdueColor(diff)}`}>{diff.toLocaleString()}d</span>;
}

// ── Days Value (for averages, not per-project end dates) ────────────────────

export function DaysValue({ days }: { days: number }) {
  if (days === 0) return <span className="text-xs text-emerald-400">0d</span>;
  return <span className={`text-xs tabular-nums ${daysOverdueColor(days)}`}>{days.toLocaleString()}d</span>;
}

// ── Delta Indicator ─────────────────────────────────────────────────────────

export function DeltaIndicator({ delta, stalledWeeks }: { delta: number | null; stalledWeeks?: number | null }) {
  if (delta === null) {
    return <span className="text-[10px] text-navy-600 italic">New</span>;
  }

  if (stalledWeeks && stalledWeeks >= 2) {
    return (
      <span className="text-[10px] text-red-400 font-medium">
        Stalled {stalledWeeks}w
      </span>
    );
  }

  if (Math.abs(delta) < 0.5) {
    return <span className="text-[10px] text-slate-500">-</span>;
  }

  const isPositive = delta > 0;
  return (
    <span className={`text-xs tabular-nums font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
      {isPositive ? '+' : ''}{delta.toFixed(1)}%
    </span>
  );
}

// ── Completion Bar (gradient version) ──────────────────────────────────────

export function CompletionBar({ pct }: { pct: number }) {
  const safePct = pct ?? 0;

  // Gradient position: 0% = leftmost (red), 50% = middle (amber), 100% = rightmost (green)
  // We show the gradient up to the fill point so the bar color reflects the health
  const hue = safePct <= 50
    ? (safePct / 50) * 40 // 0 (red) → 40 (amber)
    : 40 + ((safePct - 50) / 50) * 120; // 40 (amber) → 160 (emerald)
  const saturation = safePct === 0 ? 0 : safePct < 30 ? 80 : 70;
  const lightness = safePct === 0 ? 25 : 50;

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-navy-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={safePct} aria-valuemin={0} aria-valuemax={100} aria-label={`Completion: ${safePct}%`}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.min(safePct, 100)}%`,
            background: safePct > 0
              ? `linear-gradient(90deg, hsl(${Math.max(hue - 20, 0)}, ${saturation}%, ${lightness}%), hsl(${hue}, ${saturation}%, ${lightness}%))`
              : undefined,
          }}
        />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right tabular-nums">{safePct}%</span>
    </div>
  );
}

// ── Risk Tier Hex Colors (for inline styles like border-left) ──────────────

export const RISK_TIER_HEX: Record<RiskTier, string> = {
  HIGH: '#dc2626',
  MEDIUM: '#d4af37',
  LOW: '#2d3a52',
  NO_DATA: '#64748b',
};

// ── Exposure / Proportion Bar ──────────────────────────────────────────────

export function ExposureBar({ pct }: { pct: number }) {
  // Higher exposure = more alarming color
  const gradientStop = pct > 60 ? 'from-orange-500 to-red-500' : pct > 30 ? 'from-amber-500 to-orange-500' : 'from-gold-500 to-amber-500/60';

  return (
    <div className="flex-1 h-2 bg-navy-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${gradientStop} transition-all duration-300`}
        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
      />
    </div>
  );
}

// ── KPI Card (glassmorphism) ───────────────────────────────────────────────

export function WarRoomKpiCard({ label, value, sub, accent, bgAccent, alert, icon: Icon }: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  bgAccent: string;
  alert?: boolean;
  icon: typeof AlertTriangle;
}) {
  return (
    <div
      className={`
        relative rounded-xl p-4 overflow-hidden transition-all duration-300
        bg-[rgba(255,255,255,0.03)] backdrop-blur-xl
        border hover:border-gold-500/30 hover:shadow-[0_0_24px_rgba(212,175,55,0.08)]
        ${alert ? 'border-red-500/30 border-l-2 border-l-red-500' : 'border-[rgba(255,255,255,0.08)]'}
      `}
    >
      {alert && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />}
      <div className={`w-10 h-10 rounded-lg ${bgAccent} flex items-center justify-center mb-3`}>
        <Icon className={`w-[18px] h-[18px] ${accent}`} />
      </div>
      <p className="font-serif font-normal text-2xl text-white tracking-tight leading-none mb-1">{value}</p>
      <p className="text-[10px] uppercase tracking-[0.15em] text-navy-600 font-semibold">{label}</p>
      {sub && <p className="text-[10px] text-navy-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Intervention Type Badge ─────────────────────────────────────────────────

const INTERVENTION_ICONS: Record<InterventionType, typeof AlertTriangle> = {
  SITE_VISIT: MapPin,
  CONTRACTOR_MEETING: Users,
  ESCALATION_TO_PS: AlertTriangle,
  BOND_WARNING: FileWarning,
  TERMINATION_NOTICE: Scale,
  TIMELINE_EXTENSION: Calendar,
  VARIATION_ORDER: Hammer,
  OTHER: MessageSquare,
};

const INTERVENTION_COLORS: Record<InterventionType, string> = {
  SITE_VISIT: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  CONTRACTOR_MEETING: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  ESCALATION_TO_PS: 'bg-red-500/20 text-red-400 border-red-500/30',
  BOND_WARNING: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  TERMINATION_NOTICE: 'bg-red-500/20 text-red-400 border-red-500/30',
  TIMELINE_EXTENSION: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  VARIATION_ORDER: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  OTHER: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

export function InterventionTypeBadge({ type }: { type: InterventionType }) {
  const Icon = INTERVENTION_ICONS[type];
  const label = type.replace(/_/g, ' ');
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${INTERVENTION_COLORS[type]}`}>
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Intervention Status Badge ───────────────────────────────────────────────

const STATUS_STYLES: Record<InterventionStatus, string> = {
  PENDING: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  IN_PROGRESS: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  OVERDUE: 'bg-red-500/20 text-red-400 border-red-500/30',
};

export function InterventionStatusBadge({ status }: { status: InterventionStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap ${STATUS_STYLES[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
