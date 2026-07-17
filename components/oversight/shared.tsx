'use client';

import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { HEALTH_DOT, OVERSIGHT_STATUS_COLORS, getDeadlineBadge } from './types';
import { Badge } from '@/components/ui/Badge';

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    overdue: 'bg-red-500/20 text-red-400 border-red-500/30',
    delayed: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    'at-risk': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    'ending-soon': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    'bond-warning': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || 'bg-navy-800 text-slate-400'}`}>
      {status.replace('-', ' ')}
    </span>
  );
}

export function HealthDot({ health }: { health: string }) {
  const dot = HEALTH_DOT[health] || HEALTH_DOT.green;
  const labels: Record<string, string> = { green: 'On Track', amber: 'Minor Issues', red: 'Critical' };
  return (
    <span className="inline-flex items-center gap-1.5" title={labels[health] || health}>
      <span className={`w-2.5 h-2.5 rounded-full ${dot}`} aria-label={`Health: ${labels[health] || health}`} />
      <span className="text-xs text-slate-400 hidden lg:inline">{labels[health] || health}</span>
    </span>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  const safePct = pct ?? 0;
  const color = safePct >= 100 ? 'bg-emerald-500' : safePct >= 80 ? 'bg-emerald-500' : safePct >= 40 ? 'bg-amber-500' : safePct > 0 ? 'bg-red-500' : 'bg-navy-800';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-navy-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={safePct} aria-valuemin={0} aria-valuemax={100} aria-label={`Completion: ${safePct}%`}>
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(safePct, 100)}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{safePct}%</span>
    </div>
  );
}

export function OversightStatusBadge({ status }: { status: string }) {
  const color = OVERSIGHT_STATUS_COLORS[status] || '#64748b';
  return (
    <span
      className="px-2 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap"
      style={{ backgroundColor: `${color}20`, color, borderColor: `${color}40` }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}

export function DeadlineBadge({ endDate }: { endDate: string | null }) {
  const badge = getDeadlineBadge(endDate);
  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function OversightKpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <p className="text-navy-600 text-xs uppercase tracking-wider">{label}</p>
      <p className="text-white text-xl md:text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-navy-600 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export function MultiSelect({
  label, options, selected, onChange, renderOption, disabled = false, closeOnSelect = false,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (val: string[]) => void;
  renderOption?: (opt: { value: string; label: string }) => React.ReactNode;
  /** Disables the trigger (e.g. while the option source is loading or saving). */
  disabled?: boolean;
  /** Close the menu after a single pick — for single-select adapters (e.g. the
   *  officer picker). Filters leave this false so several values can be chosen
   *  without the menu closing. */
  closeOnSelect?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Viewport-anchored menu position. The menu is portaled to <body> to escape
  // any ancestor stacking/overflow trap (a .card-premium backdrop-filter
  // context, the SlidePanel scroll container) that would otherwise clip it or
  // pin its z-index below later-painted sibling cards. Because it is fixed,
  // its coordinates are recomputed from the trigger on open and on scroll/resize.
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const minWidth = Math.max(r.width, 200);
      // Clamp so a right-edge trigger can't push the menu off-screen.
      const left = Math.max(8, Math.min(r.left, window.innerWidth - minWidth - 8));
      setPos({ top: r.bottom + 4, left, minWidth });
    };
    place();
    window.addEventListener('scroll', place, true); // capture: catch nested scroll containers
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // The portaled menu is NOT a DOM descendant of the trigger, so it must be
    // excluded from outside-click detection explicitly — otherwise a mousedown
    // on an option reads as "outside" and closes the menu before the click can
    // toggle it.
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    // Escape closes the menu and is stopped here so it does not also reach an
    // enclosing SlidePanel's window-level Escape handler and close the panel.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(val: string) {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
    if (closeOnSelect) { setOpen(false); triggerRef.current?.focus(); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button ref={triggerRef} type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)} className="bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none flex items-center gap-2 w-full md:min-w-[130px] md:w-auto disabled:opacity-60 disabled:cursor-not-allowed">
        <span className="truncate">{selected.length ? `${label} (${selected.length})` : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-navy-600 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, minWidth: pos?.minWidth ?? 200 }}
          className="bg-navy-900 border border-navy-800 rounded-lg shadow-xl z-[60] max-h-[300px] overflow-y-auto"
        >
          {options.map(opt => (
            <label key={opt.value} className="flex items-center gap-2 px-3 py-2 hover:bg-navy-950/60 cursor-pointer text-sm">
              <input type="checkbox" checked={selected.includes(opt.value)} onChange={() => toggle(opt.value)} className="accent-gold-500" />
              {renderOption ? renderOption(opt) : <span className="text-white">{opt.label}</span>}
            </label>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
