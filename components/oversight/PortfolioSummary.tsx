'use client';

import React from 'react';
import { Building2, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { fmtCurrency } from './types';
import type { PortfolioSummary } from './types';

function PortfolioKpiCard({ icon: Icon, label, value, color, subtitle }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; color: 'gold' | 'red' | 'green' | 'blue' | 'grey' | 'amber'; subtitle?: string;
}) {
  const colors = {
    gold: { bg: 'bg-gold-500/20', text: 'text-gold-500' }, red: { bg: 'bg-red-500/20', text: 'text-red-400' },
    green: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' }, blue: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
    grey: { bg: 'bg-navy-700/20', text: 'text-slate-400' }, amber: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  };
  const c = colors[color];
  return (
    <div className="card-premium p-3 md:p-5 min-w-[130px] md:min-w-0">
      <div className={`w-8 h-8 md:w-10 md:h-10 rounded-lg ${c.bg} flex items-center justify-center mb-2 md:mb-3`}><Icon className={`h-4 w-4 md:h-5 md:w-5 ${c.text}`} /></div>
      <p className={`text-lg md:text-2xl font-bold ${c.text} truncate`}>{value}</p>
      <p className="text-navy-600 text-xs mt-1">{label}</p>
      {subtitle && <p className="text-navy-700 text-[10px] mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function PortfolioSummarySection({ summary }: { summary: PortfolioSummary | null }) {
  if (!summary) return null;

  return (
    <>
      {/* Portfolio Dashboard Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
        <PortfolioKpiCard icon={Building2} label="Active Projects" value={String(summary.total_projects)} color="gold" />
        <PortfolioKpiCard icon={DollarSign} label="Portfolio Value" value={summary.total_value > 0 ? fmtCurrency(summary.total_value) : '$0'} color="gold" />
        <PortfolioKpiCard icon={AlertTriangle} label="At Risk" value={String(summary.at_risk)} color="amber" subtitle="Amber + Red health" />
        <PortfolioKpiCard icon={CheckCircle} label="Completion Rate" value={summary.total_projects > 0 ? `${Math.round((summary.complete / summary.total_projects) * 100)}%` : '0%'} color="green" subtitle={`${summary.complete} of ${summary.total_projects}`} />
        <PortfolioKpiCard icon={AlertTriangle} label="Delayed" value={String(summary.delayed)} color="red" subtitle={summary.delayed_value > 0 ? fmtCurrency(summary.delayed_value) : undefined} />
      </div>

      {/* Regional Spread */}
      {Object.keys(summary.regions).length > 1 && (
        <div className="card-premium p-4">
          <h3 className="text-white text-sm font-semibold mb-3">Regional Spread</h3>
          <div className="flex items-end gap-1 h-16">
            {Object.entries(summary.regions)
              .map(([reg, count]) => {
                const n = parseInt(reg, 10);
                const label = !isNaN(n) ? `R${n}` : (reg && reg !== 'Unknown' ? reg : 'Other');
                const sortKey = !isNaN(n) ? n : 999;
                return { label, count, sortKey, key: reg };
              })
              .sort((a, b) => a.sortKey - b.sortKey)
              .map(({ label, count, key }) => {
                const maxCount = Math.max(...Object.values(summary.regions));
                const h = Math.max((count / maxCount) * 100, 8);
                return (<div key={key} className="flex-1 flex flex-col items-center gap-1"><span className="text-gold-500 text-[10px] font-medium">{count}</span><div className="w-full bg-gold-500/30 rounded-t" style={{ height: `${h}%` }} /><span className="text-navy-600 text-[9px]">{label}</span></div>);
              })}
          </div>
        </div>
      )}
    </>
  );
}
