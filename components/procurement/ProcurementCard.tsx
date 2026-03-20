'use client';

import { ProcurementPackage, METHOD_CONFIG } from '@/lib/procurement-types';
import { AgencyBadge } from './AgencyBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';
interface ProcurementCardProps {
  pkg: ProcurementPackage;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  onDragStarted?: () => void;
  isMobile?: boolean;
}

export function ProcurementCard({ pkg, onClick, isDragging, canDrag = true, onDragStarted, isMobile = false }: ProcurementCardProps) {

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canDrag) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', pkg.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStarted?.();
  };

  const methodLabel = METHOD_CONFIG[pkg.procurement_method]?.label ?? pkg.procurement_method;

  return (
    <div
      draggable={canDrag && !isMobile}
      onDragStart={handleDragStart}
      onClick={onClick}
      className={`group relative rounded-xl border bg-gradient-to-b from-[#1a2744] to-[#0f1d32] cursor-pointer touch-active
        hover:border-gold-500/50 hover:shadow-lg hover:shadow-gold-500/5 transition-all duration-200
        ${isMobile ? 'p-3.5' : 'p-3'}
        ${isDragging ? 'opacity-50 scale-105 shadow-2xl !border-gold-500' : 'border-navy-800'}`}
      style={{ minHeight: 44, touchAction: 'manipulation' }}
    >
      {/* Title + NPTAB */}
      <h4 className={`text-sm font-medium text-white leading-snug ${isMobile ? 'mb-0.5 line-clamp-1' : 'mb-0.5 line-clamp-2'}`}>
        {pkg.title}
      </h4>
      {pkg.nptab_number && (
        <p className={`text-[11px] font-semibold tracking-wide text-navy-600 ${isMobile ? 'mb-2' : 'mb-1.5'}`}>
          {pkg.nptab_number}
        </p>
      )}
      {!pkg.nptab_number && <div className={isMobile ? 'mb-2' : 'mb-1.5'} />}

      {isMobile ? (
        /* Mobile: stacked metadata */
        <div className="space-y-1.5">
          <AgencyBadge agency={pkg.agency} />
          <div className="flex items-center justify-between text-xs">
            <DaysAtStageIndicator days={pkg.days_at_current_stage} />
            <span className="text-navy-600">{methodLabel}</span>
          </div>
        </div>
      ) : (
        /* Desktop: compact inline */
        <>
          <div className="mb-2">
            <AgencyBadge agency={pkg.agency} />
          </div>
          <div className="flex items-center justify-between text-xs">
            <DaysAtStageIndicator days={pkg.days_at_current_stage} />
            <span className="text-navy-600">{methodLabel}</span>
          </div>
        </>
      )}
    </div>
  );
}
