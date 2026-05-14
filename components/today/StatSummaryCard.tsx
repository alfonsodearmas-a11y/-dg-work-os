'use client';

import Link from 'next/link';
import { Clock, AlertTriangle, FileText, ArrowUpRight } from 'lucide-react';
import type { TodaySignal, TodaySignalKind } from '@/lib/today/types';
import { agencyColor } from './agency-colors';

type SummaryKind = 'tender_sla' | 'delayed_project' | 'incomplete_psip_data';

const CONFIG: Record<SummaryKind, {
  label: string;
  href: string;
  icon: typeof Clock;
  iconBg: string;
  iconColor: string;
  matchKinds: TodaySignalKind[];
}> = {
  tender_sla: {
    label: 'SLA Breaches',
    href: '/procurement',
    icon: Clock,
    iconBg: 'rgba(220,38,38,0.15)',
    iconColor: '#f87171',
    matchKinds: ['tender_sla'],
  },
  delayed_project: {
    label: 'Delayed Projects',
    href: '/projects/delayed',
    icon: AlertTriangle,
    iconBg: 'rgba(212,175,55,0.15)',
    iconColor: '#f4d03f',
    matchKinds: ['delayed_project'],
  },
  incomplete_psip_data: {
    label: 'Missing PSIP Data',
    href: '/procurement/missing',
    icon: FileText,
    iconBg: 'rgba(74,130,245,0.15)',
    iconColor: '#7AB8FF',
    matchKinds: ['incomplete_psip_data'],
  },
};

interface StatSummaryCardProps {
  kind: SummaryKind;
  signals: TodaySignal[];
}

export function StatSummaryCard({ kind, signals }: StatSummaryCardProps) {
  const cfg = CONFIG[kind];
  const matched = signals.filter(s => cfg.matchKinds.includes(s.kind));
  const total = matched.reduce((acc, s) => acc + (s.rollupCount ?? 1), 0);
  const examples = matched.slice(0, 2);
  const Icon = cfg.icon;

  return (
    <Link
      href={cfg.href}
      className="card-premium block p-4 lg:p-5 group transition-colors"
      aria-label={`${cfg.label}: ${total}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span
            className="w-7 h-7 rounded-lg inline-flex items-center justify-center"
            style={{ background: cfg.iconBg, color: cfg.iconColor }}
            aria-hidden="true"
          >
            <Icon size={14} />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
            {cfg.label}
          </span>
        </div>
        <ArrowUpRight
          size={14}
          className="text-navy-600 group-hover:text-gold-500 transition-colors"
          aria-hidden="true"
        />
      </div>

      <p className="text-4xl font-bold text-white tabular-nums leading-none">{total}</p>

      {examples.length > 0 && (
        <ul className="mt-4 pt-3 border-t border-navy-800/40 space-y-2">
          {examples.map(ex => (
            <li key={ex.id} className="flex items-baseline gap-2 text-xs">
              <span
                className="font-mono font-semibold tracking-wider shrink-0"
                style={{ color: agencyColor(ex.agency) }}
              >
                {ex.agency ?? '—'}
              </span>
              <span className="text-slate-400 truncate">{ex.title}</span>
            </li>
          ))}
        </ul>
      )}
    </Link>
  );
}
