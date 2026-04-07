'use client';

import { fmtCurrency, type OversightSummary, OVERSIGHT_STATUS_COLORS } from './types';
import { ProgressBar } from './shared';

export function MinistrySummary({ summary, loading }: { summary: OversightSummary | null; loading: boolean }) {
  if (loading || !summary) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-navy-900 border border-navy-800 rounded-xl p-4 animate-pulse">
            <div className="h-3 w-20 bg-navy-800 rounded mb-3" />
            <div className="h-7 w-24 bg-navy-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
          <p className="text-navy-600 text-xs uppercase tracking-wider">Total Projects</p>
          <p className="text-white text-2xl font-bold mt-1">{summary.total_projects}</p>
        </div>
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
          <p className="text-navy-600 text-xs uppercase tracking-wider">Total Contract Value</p>
          <p className="text-white text-2xl font-bold mt-1">{fmtCurrency(summary.total_contract_value)}</p>
        </div>
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
          <p className="text-navy-600 text-xs uppercase tracking-wider">Avg. Completion</p>
          <p className="text-white text-2xl font-bold mt-1">{summary.avg_completion}%</p>
        </div>
      </div>

      {/* Status pills */}
      {Object.keys(summary.by_status).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.by_status)
            .sort(([, a], [, b]) => b - a)
            .map(([status, count]) => {
              const color = OVERSIGHT_STATUS_COLORS[status] || '#64748b';
              return (
                <span
                  key={status}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border"
                  style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  {status.replace(/_/g, ' ')} ({count})
                </span>
              );
            })}
        </div>
      )}

      {/* Per-agency breakdown */}
      {summary.by_agency.length > 0 && (
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
          <h3 className="text-white text-sm font-semibold mb-3">By Agency</h3>
          <div className="space-y-2.5">
            {summary.by_agency.map((a) => (
              <div key={a.agency} className="flex items-center gap-3">
                <span className="text-xs font-medium text-gold-500 w-12 shrink-0">{a.agency}</span>
                <span className="text-xs text-slate-400 w-6 text-right shrink-0">{a.count}</span>
                <div className="flex-1">
                  <ProgressBar pct={a.avg_completion} />
                </div>
                <span className="text-xs text-slate-400 w-16 text-right shrink-0">{fmtCurrency(a.total_value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
