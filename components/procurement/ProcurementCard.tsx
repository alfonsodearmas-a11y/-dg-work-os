'use client';

import { ExternalLink, Paperclip, MessageSquare, Calendar } from 'lucide-react';
import { ProcurementPackage, METHOD_CONFIG } from '@/lib/procurement-types';
import { AgencyBadge } from './AgencyBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';

const TRELLO_LABEL_COLORS: Record<string, string> = {
  green: 'bg-emerald-500/25 text-emerald-300',
  yellow: 'bg-amber-500/25 text-amber-300',
  orange: 'bg-orange-500/25 text-orange-300',
  red: 'bg-red-500/25 text-red-300',
  purple: 'bg-purple-500/25 text-purple-300',
  blue: 'bg-blue-500/25 text-blue-300',
  sky: 'bg-sky-500/25 text-sky-300',
  lime: 'bg-lime-500/25 text-lime-300',
  pink: 'bg-pink-500/25 text-pink-300',
  black: 'bg-slate-500/25 text-slate-300',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

interface ProcurementCardProps {
  pkg: ProcurementPackage;
  onClick: () => void;
  isDragging?: boolean;
  canDrag?: boolean;
  onDragStarted?: () => void;
  isMobile?: boolean;
}

export function ProcurementCard({ pkg, onClick, isDragging, canDrag = true, onDragStarted, isMobile = false }: ProcurementCardProps) {
  const isTrello = pkg.is_trello;
  const effectiveCanDrag = canDrag && !isTrello;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (!effectiveCanDrag) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', pkg.id);
    e.dataTransfer.effectAllowed = 'move';
    onDragStarted?.();
  };

  const handleClick = () => {
    if (isTrello && pkg.trello_url) {
      window.open(pkg.trello_url, '_blank', 'noopener,noreferrer');
    } else {
      onClick();
    }
  };

  const methodLabel = METHOD_CONFIG[pkg.procurement_method]?.label ?? pkg.procurement_method;

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

      {/* Trello labels */}
      {isTrello && pkg.trello_labels && pkg.trello_labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {pkg.trello_labels.map((label) => (
            <span
              key={label.id}
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                TRELLO_LABEL_COLORS[label.color ?? ''] ?? 'bg-navy-700/40 text-slate-400'
              }`}
            >
              {label.name || label.color}
            </span>
          ))}
        </div>
      )}

      {isMobile ? (
        /* Mobile: stacked metadata */
        <div className="space-y-1.5">
          <AgencyBadge agency={pkg.agency} />
          <div className="flex items-center justify-between text-xs">
            <DaysAtStageIndicator days={pkg.days_at_current_stage} />
            {isTrello ? (
              <TrelloMeta pkg={pkg} />
            ) : (
              <span className="text-navy-600">{methodLabel}</span>
            )}
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
            {isTrello ? (
              <TrelloMeta pkg={pkg} />
            ) : (
              <span className="text-navy-600">{methodLabel}</span>
            )}
          </div>
        </>
      )}

      {/* External link hint */}
      {isTrello && (
        <div className="flex items-center gap-1 mt-1.5 text-[10px] text-navy-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-3 w-3" />
          Open details
        </div>
      )}
    </div>
  );
}

function TrelloMeta({ pkg }: { pkg: ProcurementPackage }) {
  return (
    <div className="flex items-center gap-2 text-navy-600">
      {pkg.expected_delivery_date && (
        <span className="flex items-center gap-0.5">
          <Calendar className="h-3 w-3" />
          {formatDate(pkg.expected_delivery_date)}
        </span>
      )}
      {(pkg.trello_attachments_count ?? 0) > 0 && (
        <span className="flex items-center gap-0.5">
          <Paperclip className="h-3 w-3" />
          {pkg.trello_attachments_count}
        </span>
      )}
      {(pkg.trello_comments_count ?? 0) > 0 && (
        <span className="flex items-center gap-0.5">
          <MessageSquare className="h-3 w-3" />
          {pkg.trello_comments_count}
        </span>
      )}
    </div>
  );
}
