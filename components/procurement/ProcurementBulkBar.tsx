'use client';

import { useState } from 'react';
import { X, ArrowUpCircle, Building2, Trash2, Loader2 } from 'lucide-react';
import {
  ProcurementStage,
  PROCUREMENT_STAGES,
  STAGE_CONFIG,
} from '@/lib/procurement-types';
import { SELECTABLE_AGENCIES } from '@/lib/constants/agencies';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProcurementBulkBarProps {
  count: number;
  isMobile: boolean;
  onClear: () => void;
  onBulkUpdate: (updates: Record<string, unknown>) => Promise<void>;
  onBulkDelete: () => void;
}

type ActivePopover = 'stage' | 'agency' | 'delete' | null;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementBulkBar({
  count,
  isMobile,
  onClear,
  onBulkUpdate,
  onBulkDelete,
}: ProcurementBulkBarProps) {
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [loading, setLoading] = useState(false);

  if (count === 0) return null;

  const handleAction = async (updates: Record<string, unknown>) => {
    setLoading(true);
    try {
      await onBulkUpdate(updates);
      setActivePopover(null);
    } finally {
      setLoading(false);
    }
  };

  const popoverBase =
    'absolute bottom-full mb-2 rounded-xl bg-[#142238] border border-navy-800 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3 z-10';
  const popoverLeft = isMobile
    ? 'left-0 right-0 mx-4'
    : 'left-0 min-w-[240px]';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{
        paddingBottom: isMobile
          ? 'max(0px, env(safe-area-inset-bottom))'
          : 0,
      }}
    >
      <div className="mx-auto max-w-4xl px-4 pb-3">
        <div className="relative rounded-xl bg-gradient-to-r from-[#1a2744] to-[#0f1d32] border border-gold-500/30 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] px-4 py-3">
          {/* Top row: count + clear */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">
              <span className="text-gold-500">{count}</span> tender
              {count !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
              style={{
                minHeight: isMobile ? 44 : undefined,
                touchAction: 'manipulation',
              }}
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
              {!isMobile && 'Clear'}
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Change Stage */}
            <div className="relative">
              <button
                onClick={() =>
                  setActivePopover(
                    activePopover === 'stage' ? null : 'stage',
                  )
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'stage'
                    ? 'bg-gold-500/20 text-gold-500 border border-gold-500/50'
                    : 'bg-navy-950 text-slate-400 border border-navy-800 hover:border-[#3d4a62]'
                }`}
                style={{
                  minHeight: isMobile ? 44 : undefined,
                  minWidth: isMobile ? 44 : undefined,
                  touchAction: 'manipulation',
                }}
                aria-label="Change Stage"
              >
                <ArrowUpCircle className="h-4 w-4" />
                {!isMobile && 'Stage'}
              </button>
              {activePopover === 'stage' && (
                <div className={`${popoverBase} ${popoverLeft}`}>
                  <div className="space-y-0.5">
                    {PROCUREMENT_STAGES.map((stage: ProcurementStage) => {
                      const cfg = STAGE_CONFIG[stage];
                      return (
                        <button
                          key={stage}
                          onClick={() =>
                            handleAction({ current_stage: stage })
                          }
                          disabled={loading}
                          className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-navy-800 transition-colors"
                          style={{
                            minHeight: isMobile ? 44 : undefined,
                            touchAction: 'manipulation',
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: cfg.color }}
                          />
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Change Agency */}
            <div className="relative">
              <button
                onClick={() =>
                  setActivePopover(
                    activePopover === 'agency' ? null : 'agency',
                  )
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'agency'
                    ? 'bg-gold-500/20 text-gold-500 border border-gold-500/50'
                    : 'bg-navy-950 text-slate-400 border border-navy-800 hover:border-[#3d4a62]'
                }`}
                style={{
                  minHeight: isMobile ? 44 : undefined,
                  minWidth: isMobile ? 44 : undefined,
                  touchAction: 'manipulation',
                }}
                aria-label="Change Agency"
              >
                <Building2 className="h-4 w-4" />
                {!isMobile && 'Agency'}
              </button>
              {activePopover === 'agency' && (
                <div className={`${popoverBase} ${popoverLeft}`}>
                  <div className="space-y-0.5">
                    {SELECTABLE_AGENCIES.map((a) => (
                      <button
                        key={a}
                        onClick={() => handleAction({ agency: a })}
                        disabled={loading}
                        className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-navy-800 transition-colors"
                        style={{
                          minHeight: isMobile ? 44 : undefined,
                          touchAction: 'manipulation',
                        }}
                      >
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Delete */}
            <div className="relative ml-auto">
              <button
                onClick={() =>
                  setActivePopover(
                    activePopover === 'delete' ? null : 'delete',
                  )
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activePopover === 'delete'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                    : 'bg-navy-950 text-red-400 border border-red-500/30 hover:bg-red-500/10'
                }`}
                style={{
                  minHeight: isMobile ? 44 : undefined,
                  minWidth: isMobile ? 44 : undefined,
                  touchAction: 'manipulation',
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-4 w-4" />
                {!isMobile && 'Delete'}
              </button>
              {activePopover === 'delete' && (
                <div
                  className={`${popoverBase} right-0 min-w-[220px]`}
                  style={
                    isMobile
                      ? {
                          left: 'auto',
                          right: 0,
                          marginLeft: 16,
                          marginRight: 16,
                        }
                      : undefined
                  }
                >
                  <p className="text-sm font-semibold text-white mb-1">
                    Delete {count} tender{count !== 1 ? 's' : ''}?
                  </p>
                  <p className="text-xs text-navy-600 mb-3">
                    This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setActivePopover(null)}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-slate-400 hover:text-white bg-navy-950 border border-navy-800 transition-colors"
                      style={{
                        minHeight: isMobile ? 44 : undefined,
                        touchAction: 'manipulation',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        onBulkDelete();
                        setActivePopover(null);
                      }}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-colors font-medium"
                      style={{
                        minHeight: isMobile ? 44 : undefined,
                        touchAction: 'manipulation',
                      }}
                    >
                      {loading ? (
                        <Loader2 className="h-3 w-3 animate-spin mx-auto" />
                      ) : (
                        `Yes, delete ${count}`
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
