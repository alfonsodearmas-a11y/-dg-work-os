'use client';

interface ProgressBarProps {
  value: number;
  max?: number;
  target?: number | null;
  label?: string | null;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  colorMode?: 'auto' | 'success' | 'warning' | 'danger' | string;
}

export function ProgressBar({
  value,
  max = 100,
  target = null,
  label = null,
  showValue = true,
  size = 'md',
  colorMode = 'auto',
}: ProgressBarProps) {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  const getColor = () => {
    if (colorMode !== 'auto') {
      const colors: Record<string, string> = {
        success: 'bg-emerald-500',
        warning: 'bg-amber-500',
        danger: 'bg-red-500',
      };
      return colors[colorMode] || colorMode;
    }

    if (target) {
      return value >= target ? 'bg-emerald-500' : 'bg-amber-500';
    }

    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const heights: Record<string, string> = {
    sm: 'h-1.5',
    md: 'h-2.5',
    lg: 'h-4',
  };

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-[#94a3b8] text-sm">{label}</span>}
          {showValue && (
            <span className="text-white text-sm font-medium">
              {value.toLocaleString()}{max !== 100 && ` / ${max.toLocaleString()}`}
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-[#2d3a52] rounded-full ${heights[size]} overflow-hidden`}>
        <div
          className={`${heights[size]} rounded-full transition-all duration-500 ${getColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {target && (
        <div className="flex justify-end mt-1">
          <span className="text-[#64748b] text-xs">Target: {target}</span>
        </div>
      )}
    </div>
  );
}
