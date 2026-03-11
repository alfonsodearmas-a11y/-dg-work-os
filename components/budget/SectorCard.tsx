'use client';

import { ChevronRight } from 'lucide-react';

export interface TopItem {
  line_item: string;
  budget_2026: number;
  budget_2026_fmt: string;
  type: string;
  agency: string;
}

export interface Sector {
  sector: string;
  programme_number: string;
  label: string;
  color: string;
  total: number;
  total_fmt: string;
  current: number;
  current_fmt: string;
  capital: number;
  capital_fmt: string;
  top_items: TopItem[];
}

export const SECTOR_ICONS: Record<string, string> = {
  energy: '⚡',
  water: '💧',
  aviation: '✈️',
  maritime: '🚢',
};

interface SectorCardProps {
  sector: Sector;
  onClick: () => void;
}

export function SectorCard({ sector, onClick }: SectorCardProps) {
  const capitalPct = sector.total > 0 ? Math.round((sector.capital / sector.total) * 100) : 0;
  const currentPct = sector.total > 0 ? Math.round((sector.current / sector.total) * 100) : 0;

  return (
    <div
      onClick={onClick}
      className="card-premium agency-card p-4 md:p-5 cursor-pointer relative z-[1]"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{SECTOR_ICONS[sector.sector]}</span>
          <div>
            <h3 className="text-white font-semibold text-sm md:text-base">{sector.label}</h3>
            <p className="text-navy-600 text-[10px] uppercase tracking-wider">Programme {sector.programme_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-gold-500 font-bold text-lg md:text-xl font-mono">{sector.total_fmt}</p>
          <ChevronRight className="h-4 w-4 text-navy-600" />
        </div>
      </div>

      {/* Current / Capital Split */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-navy-950/60 rounded-lg p-2">
          <p className="text-[10px] text-navy-600 uppercase">Current</p>
          <p className="text-white font-semibold text-sm font-mono">{sector.current_fmt}</p>
          <p className="text-navy-600 text-[10px]">{currentPct}%</p>
        </div>
        <div className="flex-1 bg-navy-950/60 rounded-lg p-2">
          <p className="text-[10px] text-navy-600 uppercase">Capital</p>
          <p className="text-white font-semibold text-sm font-mono">{sector.capital_fmt}</p>
          <p className="text-navy-600 text-[10px]">{capitalPct}%</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-navy-950 rounded-full mb-3 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${currentPct}%`, backgroundColor: sector.color, opacity: 0.7 }} />
      </div>

      {/* Top Line Items Preview */}
      <div className="space-y-1.5">
        {sector.top_items.slice(0, 3).map((item, i) => (
          <div
            key={i}
            className="w-full flex items-center justify-between py-1 px-2 rounded-lg"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-navy-600 font-mono shrink-0">{item.agency}</span>
              <span className="text-slate-400 text-xs truncate">{item.line_item}</span>
            </div>
            <span className="text-gold-500 text-xs font-mono shrink-0">{item.budget_2026_fmt}</span>
          </div>
        ))}
      </div>

      {/* Tap hint */}
      <p className="text-navy-600 text-[10px] text-center mt-3">Tap to explore full breakdown →</p>
    </div>
  );
}
