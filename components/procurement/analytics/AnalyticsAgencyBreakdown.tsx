'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { fmtCurrency } from '@/lib/format';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import type { ProcurementPackage } from '@/lib/procurement-types';

interface Props {
  packages: ProcurementPackage[];
}

interface AgencyRow {
  code: string;
  color: string;
  active: number;
  totalValue: number;
  avgDays: number;
}

type SortKey = 'active' | 'totalValue' | 'avgDays';

function SortIndicator({ active, asc }: { active: boolean; asc: boolean }) {
  if (!active) return null;
  return asc
    ? <ChevronUp className="w-3 h-3 text-gold-500 inline ml-0.5" />
    : <ChevronDown className="w-3 h-3 text-gold-500 inline ml-0.5" />;
}

export function AnalyticsAgencyBreakdown({ packages }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('totalValue');
  const [sortAsc, setSortAsc] = useState(false);

  const rows = useMemo(() => {
    const map = new Map<string, { count: number; value: number; days: number[] }>();

    for (const pkg of packages) {
      const code = pkg.agency.toUpperCase();
      const entry = map.get(code) || { count: 0, value: 0, days: [] };
      if (pkg.current_stage !== 'awarded') {
        entry.count++;
        entry.value += pkg.estimated_value;
        entry.days.push(pkg.days_at_current_stage);
      }
      map.set(code, entry);
    }

    const result: AgencyRow[] = [];
    map.forEach((v, code) => {
      result.push({
        code,
        color: AGENCY_HEX_COLORS[code] || '#94a3b8',
        active: v.count,
        totalValue: v.value,
        avgDays: v.days.length > 0 ? Math.round(v.days.reduce((a, b) => a + b, 0) / v.days.length) : 0,
      });
    });

    return result;
  }, [packages]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const diff = a[sortBy] - b[sortBy];
      return sortAsc ? diff : -diff;
    });
    return copy;
  }, [rows, sortBy, sortAsc]);

  const maxValue = Math.max(...rows.map((r) => r.totalValue), 1);

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
  };


  if (rows.length === 0) {
    return (
      <div className="card-premium p-5 h-full flex flex-col">
        <h3 className="text-sm font-semibold text-white mb-4">Agency Breakdown</h3>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-navy-600 text-sm">No data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-premium p-5 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-white mb-4">Agency Breakdown</h3>

      {/* Header */}
      <div className="grid grid-cols-[1fr_60px_1fr_60px] gap-2 mb-2 px-1">
        <span className="text-[10px] uppercase tracking-wider text-navy-600 font-medium">Agency</span>
        <button onClick={() => handleSort('active')} className="text-[10px] uppercase tracking-wider text-navy-600 font-medium text-right hover:text-white transition-colors">
          Active<SortIndicator active={sortBy === 'active'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('totalValue')} className="text-[10px] uppercase tracking-wider text-navy-600 font-medium text-right hover:text-white transition-colors">
          Value<SortIndicator active={sortBy === 'totalValue'} asc={sortAsc} />
        </button>
        <button onClick={() => handleSort('avgDays')} className="text-[10px] uppercase tracking-wider text-navy-600 font-medium text-right hover:text-white transition-colors">
          Avg Days<SortIndicator active={sortBy === 'avgDays'} asc={sortAsc} />
        </button>
      </div>

      {/* Rows */}
      <div className="space-y-1 flex-1">
        {sorted.map((row) => (
          <div key={row.code} className="grid grid-cols-[1fr_60px_1fr_60px] gap-2 items-center px-1 py-2 rounded-lg hover:bg-navy-900/50 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
              <span className="text-sm font-medium text-white truncate">{row.code}</span>
            </div>
            <span className="text-sm text-slate-300 text-right tabular-nums">{row.active}</span>
            <div className="relative">
              {/* Inline bar fill */}
              <div
                className="absolute inset-y-0 left-0 rounded-sm opacity-20"
                style={{
                  width: `${(row.totalValue / maxValue) * 100}%`,
                  backgroundColor: row.color,
                }}
              />
              <span className="relative text-sm text-slate-300 text-right block tabular-nums">{fmtCurrency(row.totalValue)}</span>
            </div>
            <span className={`text-sm text-right tabular-nums ${row.avgDays > 30 ? 'text-red-400' : row.avgDays > 14 ? 'text-amber-400' : 'text-slate-300'}`}>
              {row.avgDays}d
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
