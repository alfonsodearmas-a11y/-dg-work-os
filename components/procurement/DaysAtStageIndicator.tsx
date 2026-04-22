'use client';

interface DaysAtStageIndicatorProps {
  days: number | null;
}

export function DaysAtStageIndicator({ days }: DaysAtStageIndicatorProps) {
  if (days === null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-navy-700" />
        <span className="text-xs text-navy-600">—</span>
      </span>
    );
  }

  const dotClass = days < 14
    ? 'bg-emerald-400'
    : days < 30
      ? 'bg-amber-400'
      : 'bg-red-400';

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
      <span className="text-xs text-navy-600">{days}d</span>
    </span>
  );
}
