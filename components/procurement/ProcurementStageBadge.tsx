'use client';

import { STAGE_CONFIG, type TenderStage } from '@/lib/tender/types';

interface ProcurementStageBadgeProps {
  stage: TenderStage;
  size?: 'sm' | 'md';
}

export function ProcurementStageBadge({ stage, size = 'md' }: ProcurementStageBadgeProps) {
  const config = STAGE_CONFIG[stage];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center rounded-lg font-medium ${sizeClasses}`}
      style={{
        backgroundColor: `${config.color}33`,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
}
