'use client';

interface SlaDonutProps {
  pct: number;
  size?: number;
  strokeWidth?: number;
}

export function SlaDonut({ pct, size = 96, strokeWidth = 9 }: SlaDonutProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = (clamped / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`SLA met: ${clamped} percent`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--navy-800)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--gold-500)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white leading-none">
          {clamped}
          <span className="text-[11px] font-semibold text-navy-600 align-top ml-0.5">%</span>
        </span>
        <span className="text-[10px] text-navy-600 uppercase tracking-wider mt-1">SLA Met</span>
      </div>
    </div>
  );
}
