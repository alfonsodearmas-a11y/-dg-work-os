'use client';

import { fmtCurrency } from '@/lib/format';

interface ProcurementValueDisplayProps {
  value: number;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'text-xs text-navy-600',
  md: 'text-sm text-slate-300',
  lg: 'text-lg font-semibold text-white',
};

export function ProcurementValueDisplay({ value, size = 'md' }: ProcurementValueDisplayProps) {
  return (
    <span className={SIZE_CLASSES[size]}>
      {fmtCurrency(value)}
    </span>
  );
}
