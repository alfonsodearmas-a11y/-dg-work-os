'use client';

import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { METHOD_CONFIG } from '@/lib/procurement-types';
import type { ProcurementPackage, ProcurementMethod } from '@/lib/procurement-types';
import { CHART_TOOLTIP_STYLE } from '@/lib/chart-styles';

const METHOD_COLORS: Record<ProcurementMethod, string> = {
  open_tender: '#60a5fa',
  selective_tender: '#d4af37',
  sole_source: '#f97316',
  request_for_quotation: '#a78bfa',
};

interface Props {
  packages: ProcurementPackage[];
  isMobile?: boolean;
}

export function AnalyticsMethodDistribution({ packages, isMobile = false }: Props) {
  const { data, total, soleSourcePct } = useMemo(() => {
    const counts: Record<ProcurementMethod, number> = {
      open_tender: 0,
      selective_tender: 0,
      sole_source: 0,
      request_for_quotation: 0,
    };

    for (const pkg of packages) {
      counts[pkg.procurement_method]++;
    }

    const t = packages.length || 1;
    const d = (Object.entries(counts) as [ProcurementMethod, number][])
      .filter(([, count]) => count > 0)
      .map(([method, count]) => ({
        name: METHOD_CONFIG[method].label,
        value: count,
        color: METHOD_COLORS[method],
        pct: Math.round((count / t) * 100),
        method,
      }));

    return {
      data: d,
      total: packages.length,
      soleSourcePct: Math.round((counts.sole_source / t) * 100),
    };
  }, [packages]);

  if (packages.length === 0) {
    return (
      <div className="card-premium p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-white mb-4">Procurement Method</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-navy-600 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Procurement Method</h3>
        {soleSourcePct > 20 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
            Sole Source {soleSourcePct}%
          </span>
        )}
      </div>

      <div className="flex items-center gap-6 flex-1">
        {/* Donut */}
        <div className={`relative ${isMobile ? 'w-28 h-28' : 'w-36 h-36'} shrink-0`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={isMobile ? 30 : 40}
                outerRadius={isMobile ? 50 : 64}
                paddingAngle={3}
                strokeWidth={0}
              >
                {data.map((entry) => (
                  <Cell key={entry.method} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [`${value} packages`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-xl font-bold text-white leading-none">{total}</p>
              <p className="text-[9px] text-navy-600 mt-0.5">total</p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="space-y-2.5 flex-1 min-w-0">
          {data.map((entry) => (
            <div key={entry.method} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-slate-300 truncate flex-1">{entry.name}</span>
              <span className="text-xs text-white font-medium tabular-nums">{entry.value}</span>
              <span className="text-[10px] text-navy-600 tabular-nums w-8 text-right">{entry.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
