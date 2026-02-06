'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { HealthScoreGauge } from './HealthScoreGauge';
import type { HealthBreakdownItem } from '@/lib/agency-health';

interface HealthScoreTooltipProps {
  score: number;
  label?: string;
  severity?: 'critical' | 'warning' | 'stable' | 'positive';
  breakdown?: HealthBreakdownItem[];
  compact?: boolean;
  size?: number;
  dataDate?: string;
}

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT_EST = 240; // estimated max height
const VIEWPORT_PAD = 16;
const ARROW_SIZE = 7;

function severityLabel(score: number): string {
  if (score < 4) return 'Critical';
  if (score < 6) return 'Concerning';
  if (score < 7) return 'Mixed';
  if (score < 9) return 'Stable';
  return 'Strong';
}

function dotColor(score: number): string {
  if (score >= 7) return 'bg-emerald-400';
  if (score >= 4) return 'bg-amber-400';
  return 'bg-red-400';
}

interface PopoverPos {
  top: number;
  left: number;
  arrowLeft: number;
  above: boolean;
}

function computePosition(anchorRect: DOMRect): PopoverPos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Ideal: centered below the gauge
  let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;
  const arrowIdealLeft = POPOVER_WIDTH / 2;
  let arrowLeft = arrowIdealLeft;

  // Clamp horizontally so it doesn't overflow left or right viewport edge
  if (left < VIEWPORT_PAD) {
    arrowLeft = arrowIdealLeft + (left - VIEWPORT_PAD); // shift arrow to stay pointing at gauge
    left = VIEWPORT_PAD;
  } else if (left + POPOVER_WIDTH > vw - VIEWPORT_PAD) {
    const overshoot = left + POPOVER_WIDTH - (vw - VIEWPORT_PAD);
    arrowLeft = arrowIdealLeft + overshoot;
    left = vw - VIEWPORT_PAD - POPOVER_WIDTH;
  }

  // Clamp arrow within the popover bounds (with some padding)
  arrowLeft = Math.max(16, Math.min(POPOVER_WIDTH - 16, arrowLeft));

  // Vertical: prefer below, flip above if not enough space
  const spaceBelow = vh - anchorRect.bottom;
  const above = spaceBelow < POPOVER_HEIGHT_EST + VIEWPORT_PAD && anchorRect.top > POPOVER_HEIGHT_EST;

  const top = above
    ? anchorRect.top - ARROW_SIZE - 4 // popover bottom edge just above anchor; actual bottom set via CSS
    : anchorRect.bottom + ARROW_SIZE + 4;

  return { top, left, arrowLeft, above };
}

export function HealthScoreTooltip({
  score,
  label,
  severity,
  breakdown,
  compact = false,
  size,
  dataDate,
}: HealthScoreTooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopoverPos | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setPos(computePosition(rect));
  }, []);

  // Desktop hover
  const handleMouseEnter = useCallback(() => {
    hoverTimeout.current = setTimeout(() => {
      updatePosition();
      setOpen(true);
    }, 200);
  }, [updatePosition]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setOpen(false);
  }, []);

  // Mobile tap
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
    } else {
      updatePosition();
      setOpen(true);
    }
  }, [open, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapperRef.current && !wrapperRef.current.contains(target) &&
        popoverRef.current && !popoverRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Re-calc on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const recalc = () => updatePosition();
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [open, updatePosition]);

  const popover = open && pos ? createPortal(
    <div
      ref={popoverRef}
      className={pos.above ? 'animate-tooltip-in-above' : 'animate-tooltip-in'}
      style={{
        position: 'fixed',
        zIndex: 9999,
        ...(pos.above
          ? { bottom: window.innerHeight - pos.top, left: pos.left }
          : { top: pos.top, left: pos.left }
        ),
        width: POPOVER_WIDTH,
        maxWidth: `calc(100vw - ${VIEWPORT_PAD * 2}px)`,
      }}
      onMouseEnter={() => {
        // Keep popover open when user moves mouse from gauge into popover
        if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
      }}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Arrow */}
      <div
        style={{ left: pos.arrowLeft }}
        className={`absolute -translate-x-1/2 w-3 h-3 rotate-45 bg-[#0a1628] border-[#d4af37]/40 ${
          pos.above
            ? 'bottom-[-7px] border-r border-b'
            : 'top-[-7px] border-l border-t'
        }`}
      />

      <div className="bg-[#0a1628] border border-[#d4af37]/40 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-[#2d3a52]">
          <p className="text-white text-sm font-semibold">
            Health Score: {score.toFixed(1)}/10 — {severityLabel(score)}
          </p>
        </div>

        {/* Breakdown rows */}
        {breakdown && breakdown.length > 0 ? (
          <div className="px-3 py-2 space-y-1.5">
            {breakdown.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(item.score)}`} />
                <span className="text-[#94a3b8] flex-1 truncate">{item.factor}</span>
                <span className="text-[#64748b] w-9 text-right flex-shrink-0">{Math.round(item.weight * 100)}%</span>
                <span className="text-[#d4af37] w-14 text-right flex-shrink-0 truncate">{item.actualValue}</span>
                <span className="text-white w-5 text-right font-medium flex-shrink-0">{item.score}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="text-[#64748b] text-xs">
              Health score unavailable — upload monthly reports to enable scoring
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#2d3a52]">
          <p className="text-[#64748b] text-[10px]">
            {dataDate ? `Based on data from ${dataDate}` : 'Based on latest available data'}
          </p>
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      tabIndex={0}
      onFocus={() => { updatePosition(); setOpen(true); }}
      onBlur={(e) => {
        // Don't close if focus moved into the popover
        if (popoverRef.current?.contains(e.relatedTarget as Node)) return;
        setOpen(false);
      }}
    >
      <div onClick={handleClick} className="cursor-pointer">
        <HealthScoreGauge score={score} size={size} label={label} compact={compact} />
      </div>
      {popover}
    </div>
  );
}
