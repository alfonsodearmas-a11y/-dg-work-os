'use client';

interface StatusBadgeProps {
  status?: 'good' | 'warning' | 'critical';
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

const colors: Record<string, string> = {
  good: 'bg-emerald-500/[0.15] text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/[0.15] text-amber-400 border-amber-500/30',
  critical: 'bg-red-500/[0.15] text-red-400 border-red-500/30',
};

const sizes: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  lg: 'px-4 py-1.5 text-base',
};

export function StatusBadge({ status = 'good', text, size = 'sm' }: StatusBadgeProps) {
  return (
    <span className={`rounded-full font-medium border ${colors[status] || colors.good} ${sizes[size]}`}>
      {text}
    </span>
  );
}
