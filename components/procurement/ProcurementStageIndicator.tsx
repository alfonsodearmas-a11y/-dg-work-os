'use client';

import { STAGE_CONFIG, TENDER_STAGES, type TenderStage } from '@/lib/tender/types';

interface ProcurementStageIndicatorProps {
  currentStage: TenderStage;
}

export function ProcurementStageIndicator({ currentStage }: ProcurementStageIndicatorProps) {
  const currentIdx = TENDER_STAGES.indexOf(currentStage);

  return (
    <div className="flex items-center gap-0">
      {TENDER_STAGES.map((stage, idx) => {
        const isPast = idx < currentIdx;
        const isCurrent = idx === currentIdx;
        const config = STAGE_CONFIG[stage];

        return (
          <div key={stage} className="flex items-center">
            <div
              className="rounded-full shrink-0"
              style={{
                width: isCurrent ? 10 : 8,
                height: isCurrent ? 10 : 8,
                backgroundColor: isCurrent
                  ? config.color
                  : isPast
                    ? 'var(--color-navy-600)'
                    : 'transparent',
                border: !isCurrent && !isPast ? '1.5px solid var(--color-navy-700)' : 'none',
              }}
              title={config.label}
            />
            {idx < TENDER_STAGES.length - 1 && (
              <div
                className="shrink-0"
                style={{
                  width: 12,
                  height: 2,
                  backgroundColor: idx < currentIdx ? 'var(--color-navy-600)' : 'var(--color-navy-700)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
