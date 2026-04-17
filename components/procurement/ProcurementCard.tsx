'use client';

import { ExternalLink, Repeat, AlertTriangle } from 'lucide-react';
import { METHOD_CONFIG, type Tender } from '@/lib/tender/types';
import { AgencyBadge } from './AgencyBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';

interface ProcurementCardProps {
  tender: Tender;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  onDragStarted?: () => void;
  isMobile?: boolean;
}

export function ProcurementCard({ tender, onClick, isDragging, canDrag = true, onDragStarted, isMobile = false }: ProcurementCardProps) {
  const isTrello = tender.source === 'trello';
  const effectiveCanDrag = canDrag && !isTrello;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!effectiveCanDrag) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', tender.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStarted?.();
  };

  const handleClick = () => {
    if (isTrello && tender.trello_url) {
      window.open(tender.trello_url, '_blank', 'noopener,noreferrer');
    } else {
      onClick();
    }
  };

  const methodLabel = tender.method ? METHOD_CONFIG[tender.method]?.label : null;

  return (
    <div
      draggable={effectiveCanDrag && !isMobile}
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`group relative rounded-xl border bg-gradient-to-b from-[#1a2744] to-[#0f1d32] cursor-pointer touch-active
        hover:border-gold-500/50 hover:shadow-lg hover:shadow-gold-500/5 transition-all duration-200
        ${isMobile ? 'p-3.5' : 'p-3'}
        ${isDragging ? 'opacity-50 scale-105 shadow-2xl !border-gold-500' : 'border-navy-800'}`}
      style={{ minHeight: 44, touchAction: 'manipulation' }}
    >
      {/* Title */}
      <h4 className={`text-sm font-medium text-white leading-snug ${isMobile ? 'line-clamp-1 mb-1.5' : 'line-clamp-2 mb-1.5'}`}>
        {tender.description}
      </h4>

      {/* Programme activity (categorization context) */}
      {tender.programme_activity && tender.programme_activity !== tender.description && (
        <p className="text-[11px] text-navy-600 italic line-clamp-1 mb-1.5" title={tender.programme_activity}>
          {tender.programme_activity}
        </p>
      )}

      {/* Flag badges */}
      {(tender.is_rollover || tender.has_exception) && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {tender.is_rollover && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30" title="Rollover from prior fiscal year">
              <Repeat className="h-2.5 w-2.5" />
              Rollover
            </span>
          )}
          {tender.has_exception && (
            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30" title="See remarks for non-standard state">
              <AlertTriangle className="h-2.5 w-2.5" />
              See Remarks
            </span>
          )}
        </div>
      )}

      {/* Metadata row */}
      {isMobile ? (
        <div className="space-y-1.5">
          <AgencyBadge agency={tender.agency} />
          <div className="flex items-center justify-between text-xs">
            <DaysAtStageIndicator days={tender.days_at_current_stage} />
            {methodLabel && <span className="text-navy-600">{methodLabel}</span>}
          </div>
        </div>
      ) : (
        <>
          <div className="mb-1.5"><AgencyBadge agency={tender.agency} /></div>
          <div className="flex items-center justify-between text-xs">
            <DaysAtStageIndicator days={tender.days_at_current_stage} />
            {methodLabel && <span className="text-navy-600">{methodLabel}</span>}
          </div>
        </>
      )}

      {isTrello && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-navy-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-3 w-3" />
          Open in Trello
        </div>
      )}
    </div>
  );
}
