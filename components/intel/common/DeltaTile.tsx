import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

interface DeltaTileProps {
  label: string;
  value: string;
  delta: number | null;
  // When `invert` is true, an upward delta is bad (e.g. SAIDI rising = worse).
  invert?: boolean;
  sub?: string;
}

export function DeltaTile({ label, value, delta, invert, sub }: DeltaTileProps) {
  let deltaTone: 'good' | 'bad' | 'flat' = 'flat';
  if (delta != null && Math.abs(delta) >= 0.5) {
    const isUp = delta > 0;
    if (invert) deltaTone = isUp ? 'bad' : 'good';
    else deltaTone = isUp ? 'good' : 'bad';
  }
  const deltaClass =
    deltaTone === 'good'
      ? 'text-emerald-400'
      : deltaTone === 'bad'
        ? 'text-red-400'
        : 'text-navy-600';
  const Arrow = delta != null && delta < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <div className="rounded-lg border border-navy-800 bg-navy-950/60 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-navy-600">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-white tabular-nums">{value}</span>
        {delta != null ? (
          <span className={`inline-flex items-center text-[11px] tabular-nums ${deltaClass}`}>
            <Arrow className="h-3 w-3" aria-hidden="true" />
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
      </div>
      {sub ? <div className="mt-0.5 text-[11px] text-navy-600">{sub}</div> : null}
    </div>
  );
}
