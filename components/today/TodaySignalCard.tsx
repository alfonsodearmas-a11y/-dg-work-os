'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { TodaySignal, TodaySignalKind } from '@/lib/today/types';

// Kind grouping → pill label + CSS variable. Stagnant and rollup share one
// color because they both represent "unchanged PSIP data" to the reader.
const KIND_PILL: Record<TodaySignalKind, { label: string; color: string }> = {
  delayed_project:         { label: 'PROJECT',  color: 'var(--kind-project)' },
  tender_sla:              { label: 'TENDER',   color: 'var(--kind-tender)' },
  stagnant_tender:         { label: 'STAGNANT', color: 'var(--kind-stagnant)' },
  agency_stagnant_rollup:  { label: 'STAGNANT', color: 'var(--kind-stagnant)' },
  meeting_action:          { label: 'ACTION',   color: 'var(--kind-action)' },
  incomplete_psip_data:    { label: 'MISSING',  color: 'var(--kind-missing)' },
};

export function TodaySignalCard({ signal }: { signal: TodaySignal }) {
  const pill = KIND_PILL[signal.kind];

  return (
    <Link
      href={signal.href}
      className="card-premium group flex items-start gap-4 p-4 transition-colors hover:border-gold-500/40"
    >
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span
            className="rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: pill.color, backgroundColor: `${pill.color}22`, border: `1px solid ${pill.color}55` }}
          >
            {pill.label}
          </span>
          {signal.agency && (
            <span className="font-mono text-xs text-navy-600">{signal.agency}</span>
          )}
        </div>
        <h3 className="text-sm font-medium text-white today-title-clamp">{signal.title}</h3>
        {signal.subtitle && (
          <p className="truncate text-xs text-navy-600">{signal.subtitle}</p>
        )}
        <p className="mt-1 truncate font-mono text-xs text-slate-400">{signal.metric}</p>
      </div>

      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy-600 group-hover:text-gold-400" />
    </Link>
  );
}
