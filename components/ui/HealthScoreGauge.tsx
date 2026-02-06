'use client';

interface HealthScoreGaugeProps {
  score: number; // 1-10
  size?: number; // px, default 120 (64 when compact)
  label?: string;
  compact?: boolean;
}

export function HealthScoreGauge({ score, size, label = 'Health Score', compact = false }: HealthScoreGaugeProps) {
  const effectiveSize = size ?? (compact ? 64 : 120);
  const clamped = Math.max(1, Math.min(10, score));
  const strokeWidth = compact ? 5 : 8;
  const radius = (effectiveSize - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 10) * circumference;
  const strokeColor = clamped < 4 ? '#ef4444' : clamped < 7 ? '#f59e0b' : '#10b981';
  const bgColor = clamped < 4 ? 'rgba(239,68,68,0.15)' : clamped < 7 ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)';
  const textColor = clamped < 4 ? 'text-red-400' : clamped < 7 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: effectiveSize, height: effectiveSize }}>
        <svg width={effectiveSize} height={effectiveSize} className="-rotate-90">
          <circle
            cx={effectiveSize / 2}
            cy={effectiveSize / 2}
            r={radius}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={effectiveSize / 2}
            cy={effectiveSize / 2}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${compact ? 'text-lg' : 'text-3xl'} font-bold ${textColor}`}>{clamped.toFixed(1)}</span>
          <span className={`text-[#64748b] ${compact ? 'text-[9px]' : 'text-xs'}`}>/10</span>
        </div>
      </div>
      {!compact && <span className="text-[#94a3b8] text-xs font-medium">{label}</span>}
    </div>
  );
}
