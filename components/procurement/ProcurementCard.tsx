'use client';

import { ProcurementPackage, METHOD_CONFIG } from '@/lib/procurement-types';
import { AgencyBadge } from './AgencyBadge';
import { ProcurementValueDisplay } from './ProcurementValueDisplay';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';

interface ProcurementCardProps {
  pkg: ProcurementPackage;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  onDragStarted?: () => void;
}

export function ProcurementCard({ pkg, onClick, isDragging, canDrag = true, onDragStarted }: ProcurementCardProps) {
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
      draggable={canDrag}
      onDragStart={handleDragStart}
      onClick={onClick}
      className={`group relative rounded-xl border bg-gradient-to-b from-[#1a2744] to-[#0f1d32] p-3 cursor-pointer
        hover:border-gold-500/50 hover:shadow-lg hover:shadow-gold-500/5 transition-all duration-200
        ${isDragging ? 'opacity-50 scale-105 shadow-2xl !border-gold-500' : 'border-navy-800'}`}
    >
      {/* Title */}
      <h4 className="text-sm font-medium text-white mb-2 line-clamp-2 leading-snug">
        {pkg.title}
      </h4>

      {/* Agency + Value */}
      <div className="flex items-center gap-2 mb-2">
        <AgencyBadge agency={pkg.agency} />
        <ProcurementValueDisplay value={pkg.estimated_value} size="sm" />
      </div>

      {/* Days at stage + Method */}
      <div className="flex items-center justify-between text-xs">
        <DaysAtStageIndicator days={pkg.days_at_current_stage} />
        <span className="text-navy-600">{methodLabel}</span>
      </div>
    </div>
  );
}
