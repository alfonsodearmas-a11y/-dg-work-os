'use client';

import type { RiskTier, InterventionType, InterventionStatus } from '@/lib/delayed-projects/types';
import {
  AlertTriangle,
  MapPin, Users, Calendar, Hammer,
  FileWarning, Scale, Clock, MessageSquare,
} from 'lucide-react';

// ── Risk Tier Badge ─────────────────────────────────────────────────────────

const RISK_STYLES: Record<RiskTier, string> = {
  HIGH: 'bg-red-500/20 text-red-400 border-red-500/30',
  MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  LOW: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
};

export function RiskTierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${RISK_STYLES[tier]}`}>
      {tier}
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

// ── Days Overdue Badge ──────────────────────────────────────────────────────

export function DaysOverdueBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="text-xs text-slate-500">No date</span>;
  }
  if (days === 0) {
    return <span className="text-xs text-emerald-400">On time</span>;
  }

  let color = 'text-slate-400';
  if (days > 365) color = 'text-red-400 font-semibold';
  else if (days > 90) color = 'text-amber-400';

  return <span className={`text-xs tabular-nums ${color}`}>{days.toLocaleString()}d</span>;
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

// ── Completion Bar (re-export existing ProgressBar) ─────────────────────────

export { ProgressBar as CompletionBar } from '@/components/oversight/shared';

// ── KPI Card ────────────────────────────────────────────────────────────────

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
    <div className={`relative rounded-xl border p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] overflow-hidden ${alert ? 'border-amber-500/30' : 'border-navy-800'}`}>
      {alert && <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />}
      <div className={`w-9 h-9 rounded-lg ${bgAccent} flex items-center justify-center mb-3`}>
        <Icon className={`w-[18px] h-[18px] ${accent}`} />
      </div>
      <p className="text-2xl font-bold text-white tracking-tight leading-none mb-1">{value}</p>
      <p className="text-xs text-navy-600 font-medium">{label}</p>
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
