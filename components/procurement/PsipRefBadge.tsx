'use client';

interface PsipRefBadgeProps {
  psipRef: string;
  size?: 'xs' | 'sm' | 'md';
}

const SIZE_CLASSES: Record<NonNullable<PsipRefBadgeProps['size']>, string> = {
  xs: 'px-1.5 py-0.5 text-[10px]',
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2 py-0.5 text-xs',
};

export function PsipRefBadge({ psipRef, size = 'md' }: PsipRefBadgeProps) {
  return (
    <span
      className={`rounded font-semibold bg-gold-500/15 text-gold-500 border border-gold-500/30 ${SIZE_CLASSES[size]}`}
    >
      {psipRef}
    </span>
  );
}
