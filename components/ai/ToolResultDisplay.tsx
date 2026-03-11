'use client';

import { Loader2, Check, Ban, Play } from 'lucide-react';
import type { AIActionProposal } from '@/lib/ai/types';

// ── Action Confirmation Card ─────────────────────────────────────────────────

export interface ToolResultDisplayProps {
  action: AIActionProposal;
  onExecute: () => void;
  onCancel: () => void;
  result?: { success: boolean; message: string };
  executing?: boolean;
}

export function ToolResultDisplay({
  action,
  onExecute,
  onCancel,
  result,
  executing,
}: ToolResultDisplayProps) {
  return (
    <div
      className="my-3 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(212, 175, 55, 0.4)', background: 'rgba(212, 175, 55, 0.05)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gold-500/20">
        <Play className="h-4 w-4 text-gold-500" />
        <span className="text-sm font-semibold text-gold-500">{action.display.title}</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-sm text-white/80">{action.display.description}</p>
        {action.display.details.length > 0 && (
          <div className="space-y-1">
            {action.display.details.map((d, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span className="text-white/40 min-w-[80px]">{d.label}:</span>
                <span className="text-white/70">{d.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {result ? (
        <div className={`flex items-center gap-2 px-4 py-2.5 border-t ${result.success ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10'}`}>
          {result.success ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Ban className="h-4 w-4 text-red-400" />
          )}
          <span className={`text-xs ${result.success ? 'text-emerald-300' : 'text-red-300'}`}>{result.message}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-gold-500/20">
          <button
            onClick={onExecute}
            disabled={executing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all bg-gold-500/20 text-gold-500 border border-gold-500/40 hover:bg-gold-500/30 disabled:opacity-50"
          >
            {executing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            {executing ? 'Executing...' : 'Execute'}
          </button>
          <button
            onClick={onCancel}
            disabled={executing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 disabled:opacity-50"
          >
            <Ban className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
