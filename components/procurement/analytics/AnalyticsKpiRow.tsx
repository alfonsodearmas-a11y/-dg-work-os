'use client';

import { Package, Clock, AlertTriangle } from 'lucide-react';
import type { PipelineStats } from '@/lib/procurement-types';

interface AnalyticsKpiRowProps {
  stats: PipelineStats | null;
}

interface KpiCard {
  label: string;
  value: string;
  icon: typeof Package;
  accent: string;
  bgAccent: string;
  alert?: boolean;
}

export function AnalyticsKpiRow({ stats }: AnalyticsKpiRowProps) {
  if (!stats) return null;

  const cards: KpiCard[] = [
    {
      label: 'Active Tenders',
      value: stats.total_active.toLocaleString(),
      icon: Package,
      accent: 'text-blue-400',
      bgAccent: 'bg-blue-500/15',
    },
    {
      label: 'Avg Days to Award',
      value: stats.avg_days_to_award > 0 ? `${stats.avg_days_to_award}d` : '—',
      icon: Clock,
      accent: 'text-slate-300',
      bgAccent: 'bg-slate-500/15',
    },
    {
      label: 'Stuck Tenders',
      value: stats.stalled_count.toLocaleString(),
      icon: AlertTriangle,
      accent: stats.stalled_count > 0 ? 'text-amber-400' : 'text-emerald-400',
      bgAccent: stats.stalled_count > 0 ? 'bg-amber-500/15' : 'bg-emerald-500/15',
      alert: stats.stalled_count > 0,
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className={`relative rounded-xl border p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] overflow-hidden ${
              card.alert ? 'border-amber-500/30' : 'border-navy-800'
            }`}
          >
            {card.alert && (
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
            )}
            <div className={`w-9 h-9 rounded-lg ${card.bgAccent} flex items-center justify-center mb-3`}>
              <Icon className={`w-4.5 h-4.5 ${card.accent}`} />
            </div>
            <p className="text-2xl font-bold text-white tracking-tight leading-none mb-1">{card.value}</p>
            <p className="text-xs text-navy-600 font-medium">{card.label}</p>
          </div>
        );
      })}
    </div>
  );
}
