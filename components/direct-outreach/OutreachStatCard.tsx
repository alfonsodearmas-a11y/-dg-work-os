'use client';

import type { LucideIcon } from 'lucide-react';

interface OutreachStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  sub?: string;
  active?: boolean;
  onClick?: () => void;
}

/** KPI stat card — same visual grammar as the Today module's StatSummaryCard. */
export function OutreachStatCard({
  label,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  sub,
  active = false,
  onClick,
}: OutreachStatCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
            style={{ background: iconBg, color: iconColor }}
            aria-hidden="true"
          >
            <Icon size={14} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
            {label}
          </span>
        </div>
      </div>
      <p className="text-4xl font-bold text-white tabular-nums leading-none">{value}</p>
      {sub && <p className="text-xs text-navy-600 mt-3">{sub}</p>}
    </>
  );

  if (!onClick) {
    return (
      <div className="card-premium p-4 lg:p-5" aria-label={`${label}: ${value}`}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={`${label}: ${value}`}
      className={`card-premium block w-full text-left p-4 lg:p-5 transition-colors ${
        active ? 'ring-1 ring-gold-500/40' : ''
      }`}
    >
      {body}
    </button>
  );
}
