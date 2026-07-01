'use client';

// Small shared presentational bits for the Hinterland Communities pages.
// Status badge + coverage bar mirror the airstrips ConfigBadge pattern
// (backgroundColor color+'20', border color+'40').

interface ConfigMap { [key: string]: { label: string; color: string } }

export function StatusBadge({ value, config }: { value: string | null; config: ConfigMap }) {
  if (!value) return <span className="text-navy-600 text-sm">—</span>;
  const cfg = config[value];
  if (!cfg) return <span className="text-sm text-white">{value}</span>;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
      style={{ backgroundColor: `${cfg.color}20`, color: cfg.color, border: `1px solid ${cfg.color}40` }}
    >
      {cfg.label}
    </span>
  );
}

/** A compact coverage bar with the numeric percent in mono. Null → "n/a". */
export function CoverageBar({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-xs text-navy-600 font-mono tabular-nums">n/a</span>;
  }
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 80 ? '#10b981' : pct >= 40 ? '#d4af37' : '#f59e0b';
  return (
    <div className="flex items-center gap-2 min-w-[92px]">
      <div className="h-1.5 flex-1 rounded-full bg-navy-800 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs text-slate-300 font-mono tabular-nums w-9 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

/** Proportional stacked bar of status segments — the region rollup / map stand-in. */
export function StackedStatusBar({
  counts, config, order,
}: {
  counts: Record<string, number>;
  config: ConfigMap;
  order: readonly string[];
}) {
  const total = order.reduce((sum, k) => sum + (counts[k] ?? 0), 0);
  if (total === 0) return <div className="h-1.5 rounded-full bg-navy-800" />;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-navy-800">
      {order.map(k => {
        const n = counts[k] ?? 0;
        if (n === 0) return null;
        return (
          <div
            key={k}
            style={{ width: `${(n / total) * 100}%`, backgroundColor: config[k]?.color ?? '#64748b' }}
            title={`${config[k]?.label ?? k}: ${n}`}
          />
        );
      })}
    </div>
  );
}
