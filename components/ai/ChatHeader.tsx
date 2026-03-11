'use client';

import { X, Minus, Trash2, Sparkles, AlertTriangle } from 'lucide-react';

// ── Budget Bar ───────────────────────────────────────────────────────────────

function BudgetBar({ pct }: { pct: number }) {
  if (pct < 50) return null;

  const color = pct >= 95 ? '#dc2626' : pct >= 80 ? '#d4af37' : '#3b82f6';

  return (
    <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.min(100, pct)}%`, background: color }}
      />
    </div>
  );
}

// ── Chat Header ──────────────────────────────────────────────────────────────

export interface ChatHeaderProps {
  pageName: string;
  hasMessages: boolean;
  isMobile: boolean;
  budgetPct: number;
  contextWarning: boolean;
  onClear: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onTouchEnd?: (e: React.TouchEvent) => void;
}

export function ChatHeader({
  pageName,
  hasMessages,
  isMobile,
  budgetPct,
  contextWarning,
  onClear,
  onMinimize,
  onClose,
  onTouchStart,
  onTouchEnd,
}: ChatHeaderProps) {
  return (
    <>
      <div
        className="flex-shrink-0 border-b border-white/5"
        onTouchStart={isMobile ? onTouchStart : undefined}
        onTouchEnd={isMobile ? onTouchEnd : undefined}
      >
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="h-5 w-5 text-gold-500 flex-shrink-0" />
            <span className="text-base font-bold text-gold-500 truncate">DG Intelligence</span>
          </div>

          <div className="flex items-center gap-1">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs bg-white/5 text-white/50 border border-white/10 mr-2 truncate max-w-[140px]">
              {pageName}
            </span>

            {hasMessages && (
              <button onClick={onClear} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Clear conversation">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            {!isMobile && (
              <button onClick={onMinimize} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Minimize">
                <Minus className="h-4 w-4" />
              </button>
            )}
            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-white/5 text-white/40 hover:text-white/70 transition-colors" aria-label="Close AI assistant">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Budget bar */}
        <BudgetBar pct={budgetPct} />
      </div>

      {/* Context warning banner */}
      {contextWarning && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-400/80">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          Some data sources unavailable — response may be incomplete
        </div>
      )}
    </>
  );
}
