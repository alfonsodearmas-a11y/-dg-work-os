'use client';

import { X, Zap, Loader2, Inbox, Clock, AlertTriangle, CheckSquare } from 'lucide-react';
import type { TaskStatus } from '@/lib/task-types';
import type { BoardState } from '@/hooks/useBoardReducer';

// ---------------------------------------------------------------------------
// Standup Modal
// ---------------------------------------------------------------------------

interface StandupModalProps {
  showStandup: boolean;
  standupLoading: boolean;
  standupText: string;
  onClose: () => void;
}

export function StandupModal({ showStandup, standupLoading, standupText, onClose }: StandupModalProps) {
  if (!showStandup) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-2xl md:rounded-2xl bg-gradient-to-b from-[#1a2744] to-[#0f1d32] border border-navy-800 shadow-2xl max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-navy-800">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-gold-500" />
            <h2 className="text-lg font-semibold text-white">Standup Digest</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4">
          {standupLoading ? (
            <div className="flex items-center justify-center py-8" role="status" aria-label="Loading">
              <Loader2 className="h-6 w-6 animate-spin text-gold-500" aria-hidden="true" />
              <span className="ml-2 text-slate-400">Generating digest...</span>
            </div>
          ) : (
            <div className="text-slate-200 text-sm leading-relaxed whitespace-pre-line font-mono">
              {standupText}
            </div>
          )}
        </div>
        {!standupLoading && standupText && (
          <div className="p-4 border-t border-navy-800">
            <button
              onClick={() => { navigator.clipboard.writeText(standupText); }}
              className="px-4 py-2 rounded-lg bg-navy-800 text-white text-sm hover:bg-[#3d4a62] transition-colors"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blocked Reason Prompt
// ---------------------------------------------------------------------------

interface BlockedPromptProps {
  blockedPrompt: { taskId: string; targetStatus: TaskStatus } | null;
  blockedReason: string;
  isMobile: boolean;
  onReasonChange: (reason: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BlockedPrompt({
  blockedPrompt,
  blockedReason,
  isMobile,
  onReasonChange,
  onConfirm,
  onCancel,
}: BlockedPromptProps) {
  if (!blockedPrompt) return null;

  return (
    <div className="p-4 rounded-xl bg-navy-900 border border-amber-500/50 space-y-3">
      <p className="text-amber-400 text-sm font-medium">What&apos;s blocking this task?</p>
      <input
        type="text"
        value={blockedReason}
        onChange={(e) => onReasonChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
        placeholder="Describe the blocker..."
        autoFocus
        aria-label="Blocked reason"
        className="w-full px-3 py-2.5 rounded-lg bg-navy-950 border border-navy-800 text-white placeholder-navy-600 focus:outline-none focus:border-amber-500"
        style={{ minHeight: isMobile ? 44 : undefined, fontSize: isMobile ? 16 : undefined }}
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 rounded-lg text-sm bg-amber-500 text-navy-950 font-medium hover:bg-amber-400 transition-colors"
          style={{ minHeight: isMobile ? 44 : undefined, touchAction: 'manipulation' }}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Undo Delete Toast
// ---------------------------------------------------------------------------

interface UndoDeleteToastProps {
  visible: boolean;
  onUndo: () => void;
}

export function UndoDeleteToast({ visible, onUndo }: UndoDeleteToastProps) {
  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 md:bottom-6 flex items-center gap-3 rounded-lg border border-navy-800 bg-navy-950 px-4 py-3 shadow-lg">
      <span className="text-sm text-white">Task deleted</span>
      <button onClick={onUndo} className="text-sm font-medium text-gold-500 hover:text-gold-400 transition-colors">
        Undo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile FAB
// ---------------------------------------------------------------------------

interface MobileFabProps {
  visible: boolean;
  onClick: () => void;
}

export function MobileFab({ visible, onClick }: MobileFabProps) {
  if (!visible) return null;

  return (
    <button
      onClick={onClick}
      className="fixed z-40 flex items-center justify-center rounded-full shadow-lg"
      style={{
        bottom: 80,
        right: 20,
        width: 56,
        height: 56,
        background: 'linear-gradient(135deg, #e2c37a, #c9a84c)',
        color: '#0d1b2e',
        fontSize: 28,
        fontWeight: 700,
        boxShadow: '0 4px 16px rgba(201,168,76,0.4)',
        touchAction: 'manipulation',
      }}
    >
      +
    </button>
  );
}

// ---------------------------------------------------------------------------
// Summary Stats Bar
// ---------------------------------------------------------------------------

interface SummaryStatsBarProps {
  tasks: BoardState['tasks'];
  totalTasks: number;
  lastSync: string | null;
}

export function SummaryStatsBar({ tasks, totalTasks, lastSync }: SummaryStatsBarProps) {
  if (totalTasks <= 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-navy-600">{totalTasks} tasks</span>
      {tasks.new.length > 0 && (
        <span className="flex items-center gap-1 text-indigo-400">
          <Inbox className="h-3.5 w-3.5" /> {tasks.new.length} new
        </span>
      )}
      {tasks.active.length > 0 && (
        <span className="flex items-center gap-1 text-blue-400">
          <Clock className="h-3.5 w-3.5" /> {tasks.active.length} active
        </span>
      )}
      {tasks.blocked.length > 0 && (
        <span className="flex items-center gap-1 text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5" /> {tasks.blocked.length} blocked
        </span>
      )}
      {tasks.done.length > 0 && (
        <span className="flex items-center gap-1 text-emerald-400">
          <CheckSquare className="h-3.5 w-3.5" /> {tasks.done.length} done
        </span>
      )}
      {lastSync && (
        <span className="ml-auto text-xs text-navy-600">
          Synced {new Date(lastSync).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
