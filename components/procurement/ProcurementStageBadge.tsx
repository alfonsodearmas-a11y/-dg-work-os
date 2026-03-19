'use client';

import { ProcurementStage, STAGE_CONFIG } from '@/lib/procurement-types';

interface ProcurementStageBadgeProps {
  stage: ProcurementStage;
  size?: 'sm' | 'md';
}

export function ProcurementStageBadge({ stage, size = 'md' }: ProcurementStageBadgeProps) {
  const config = STAGE_CONFIG[stage];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-lg font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${config.color}33`, // 20% opacity
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
