'use client';

import { useState } from 'react';
import { X, ArrowUpCircle, Droplets, Plane, Loader2 } from 'lucide-react';
import {
  STATUS_CONFIG, CONDITION_CONFIG, FREQUENCY_CONFIG,
  AIRSTRIP_STATUSES, SURFACE_CONDITIONS, FLIGHT_FREQUENCIES,
} from '@/lib/airstrip-types';

interface AirstripBulkActionBarProps {
  count: number;
  onClear: () => void;
  onBulkUpdate: (updates: Record<string, unknown>, reason?: string) => Promise<void>;
}

type ActivePopover = 'status' | 'condition' | 'frequency' | null;

export function AirstripBulkActionBar({ count, onClear, onBulkUpdate }: AirstripBulkActionBarProps) {
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [statusReason, setStatusReason] = useState('');
  const [loading, setLoading] = useState(false);

  if (count === 0) return null;

  const handleAction = async (updates: Record<string, unknown>, reason?: string) => {
    setLoading(true);
    try {
      await onBulkUpdate(updates, reason);
      setActivePopover(null);
      setStatusReason('');
    } finally {
      setLoading(false);
    }
  };

  const popoverBase = 'absolute bottom-full mb-2 rounded-xl bg-[#142238] border border-navy-800 shadow-[0_8px_24px_rgba(0,0,0,0.5)] p-3 z-10';
  const popoverPos = 'left-0 min-w-[240px]';

  const btnBase = (popover: ActivePopover) =>
    `flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors ${
      activePopover === popover
        ? 'bg-gold-500/20 text-gold-500 border border-gold-500/50'
        : 'bg-navy-950 text-slate-400 border border-navy-800 hover:border-[#3d4a62]'
    }`;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
      <div className="mx-auto max-w-4xl px-4 pb-3">
        <div className="relative rounded-xl bg-gradient-to-r from-[#1a2744] to-[#0f1d32] border border-gold-500/30 shadow-[0_-4px_24px_rgba(0,0,0,0.4)] px-4 py-3">
          {/* Top row: count + clear */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-white">
              <span className="text-gold-500">{count}</span> airstrip{count !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={onClear}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-navy-800 transition-colors"
              aria-label="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'status' ? null : 'status')}
                className={btnBase('status')}
                aria-label="Change Status"
              >
                <ArrowUpCircle className="h-4 w-4" />
                Status
              </button>
              {activePopover === 'status' && (
                <div className={`${popoverBase} ${popoverPos}`}>
                  <div className="space-y-0.5 mb-3">
                    {AIRSTRIP_STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => {
                          if (!statusReason.trim()) return;
                          handleAction({ status: s }, statusReason.trim());
                        }}
                        disabled={loading || !statusReason.trim()}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-navy-800 transition-colors disabled:opacity-40"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: STATUS_CONFIG[s].color }}
                        />
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                  <div className="border-t border-navy-800 pt-2">
                    <label className="block text-xs text-amber-400 mb-1.5">Reason (required):</label>
                    <textarea
                      value={statusReason}
                      onChange={e => setStatusReason(e.target.value)}
                      placeholder="Why is the status changing?"
                      className="w-full px-3 py-2 rounded-lg bg-navy-950 border border-amber-500/30 text-white text-sm placeholder-navy-600 focus:outline-none focus:border-amber-500 resize-none"
                      rows={2}
                    />
                    {!statusReason.trim() && (
                      <p className="text-[10px] text-amber-400/70 mt-1">Enter a reason, then click a status above</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Surface Condition */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'condition' ? null : 'condition')}
                className={btnBase('condition')}
                aria-label="Change Condition"
              >
                <Droplets className="h-4 w-4" />
                Condition
              </button>
              {activePopover === 'condition' && (
                <div className={`${popoverBase} ${popoverPos}`}>
                  <p className="text-xs text-slate-400 mb-2">Set surface condition for {count} airstrip{count !== 1 ? 's' : ''}</p>
                  <div className="space-y-0.5">
                    {SURFACE_CONDITIONS.map(c => (
                      <button
                        key={c}
                        onClick={() => handleAction({ surface_condition: c })}
                        disabled={loading}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-navy-800 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: CONDITION_CONFIG[c].color }}
                        />
                        {CONDITION_CONFIG[c].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Flight Frequency */}
            <div className="relative">
              <button
                onClick={() => setActivePopover(activePopover === 'frequency' ? null : 'frequency')}
                className={btnBase('frequency')}
                aria-label="Change Frequency"
              >
                <Plane className="h-4 w-4" />
                Frequency
              </button>
              {activePopover === 'frequency' && (
                <div className={`${popoverBase} ${popoverPos}`}>
                  <p className="text-xs text-slate-400 mb-2">Set flight frequency for {count} airstrip{count !== 1 ? 's' : ''}</p>
                  <div className="space-y-0.5">
                    {FLIGHT_FREQUENCIES.map(f => (
                      <button
                        key={f}
                        onClick={() => handleAction({ flight_frequency: f })}
                        disabled={loading}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-slate-200 hover:bg-navy-800 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: FREQUENCY_CONFIG[f].color }}
                        />
                        {FREQUENCY_CONFIG[f].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 rounded-xl bg-navy-950/60 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gold-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
