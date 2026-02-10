'use client';

import { useState, useEffect, useCallback } from 'react';
import { DollarSign, RefreshCw, ChevronRight, Sparkles } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { BudgetSectorDetail } from '@/components/budget/BudgetSectorDetail';
import { BudgetAskPanel } from '@/components/budget/BudgetAskPanel';

interface TopItem {
  line_item: string;
  budget_2026: number;
  budget_2026_fmt: string;
  type: string;
  agency: string;
}

interface Sector {
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

interface SummaryData {
  sectors: Sector[];
  grand_total: number;
  grand_total_fmt: string;
}

const SECTOR_ICONS: Record<string, string> = {
  energy: '⚡',
  water: '💧',
  aviation: '✈️',
  maritime: '🚢',
};

const SECTOR_LABELS: Record<string, string> = {
  energy: 'Electricity Services',
  water: 'Water Services',
  aviation: 'Aviation',
  maritime: 'Maritime Administration',
};

export default function BudgetPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/budget');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to load budget summary:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const selectedSectorData = data?.sectors.find(s => s.sector === selectedSector);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Budget Estimates 2026</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">
              Ministry of Public Utilities & Aviation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4af37]/20 to-[#b8860b]/20 border border-[#d4af37]/30 text-[#d4af37] hover:border-[#d4af37] transition-colors touch-active"
          >
            <Sparkles className="h-4 w-4" />
            <span className="text-sm hidden md:inline">Ask AI</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors disabled:opacity-50 touch-active"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="text-sm hidden md:inline">Refresh</span>
          </button>
        </div>
      </div>

      {isLoading && !data ? (
        <div className="space-y-4">
          <div className="card-premium p-6"><div className="skeleton h-16 w-64" /></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card-premium p-6 space-y-3">
                <div className="skeleton h-6 w-40" />
                <div className="skeleton h-10 w-32" />
                <div className="skeleton h-4 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : data ? (
        <>
          {/* Grand Total Card */}
          <div className="card-premium p-4 md:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[#64748b] text-xs font-semibold uppercase tracking-wider mb-1">Total Ministry Budget 2026</p>
                <p className="stat-number text-3xl md:text-4xl">{data.grand_total_fmt}</p>
                <p className="text-[#64748b] text-xs mt-1">Agency 34 — Programmes 342–345</p>
              </div>
              <div className="hidden md:flex items-center gap-3">
                {data.sectors.map(s => (
                  <button
                    key={s.sector}
                    onClick={() => setSelectedSector(s.sector)}
                    className="text-center hover:scale-110 transition-transform cursor-pointer"
                  >
                    <p className="text-lg">{SECTOR_ICONS[s.sector]}</p>
                    <p className="text-[10px] text-[#64748b] uppercase">{s.sector}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sector Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.sectors.map(sector => (
              <SectorCard
                key={sector.sector}
                sector={sector}
                onClick={() => setSelectedSector(sector.sector)}
              />
            ))}
          </div>
        </>
      ) : null}

      {/* Sector Detail Slide Panel */}
      <SlidePanel
        isOpen={!!selectedSector}
        onClose={() => setSelectedSector(null)}
        title={`${selectedSectorData ? SECTOR_ICONS[selectedSectorData.sector] : ''} ${selectedSectorData?.label || selectedSector || ''}`}
        subtitle={selectedSectorData ? `Programme ${selectedSectorData.programme_number} · ${selectedSectorData.total_fmt}` : 'Budget Detail'}
        accentColor="from-[#d4af37]/40 to-[#b8860b]/40"
      >
        {selectedSector && <BudgetSectorDetail sector={selectedSector} />}
      </SlidePanel>

      {/* Ask AI Panel */}
      <BudgetAskPanel isOpen={askOpen} onClose={() => setAskOpen(false)} />
    </div>
  );
}

function SectorCard({ sector, onClick }: { sector: Sector; onClick: () => void }) {
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
            <p className="text-[#64748b] text-[10px] uppercase tracking-wider">Programme {sector.programme_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-[#d4af37] font-bold text-lg md:text-xl font-mono">{sector.total_fmt}</p>
          <ChevronRight className="h-4 w-4 text-[#64748b]" />
        </div>
      </div>

      {/* Current / Capital Split */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 bg-[#0a1628]/60 rounded-lg p-2">
          <p className="text-[10px] text-[#64748b] uppercase">Current</p>
          <p className="text-white font-semibold text-sm font-mono">{sector.current_fmt}</p>
          <p className="text-[#64748b] text-[10px]">{currentPct}%</p>
        </div>
        <div className="flex-1 bg-[#0a1628]/60 rounded-lg p-2">
          <p className="text-[10px] text-[#64748b] uppercase">Capital</p>
          <p className="text-white font-semibold text-sm font-mono">{sector.capital_fmt}</p>
          <p className="text-[#64748b] text-[10px]">{capitalPct}%</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-1.5 bg-[#0a1628] rounded-full mb-3 overflow-hidden">
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
              <span className="text-[10px] text-[#64748b] font-mono shrink-0">{item.agency}</span>
              <span className="text-[#94a3b8] text-xs truncate">{item.line_item}</span>
            </div>
            <span className="text-[#d4af37] text-xs font-mono shrink-0">{item.budget_2026_fmt}</span>
          </div>
        ))}
      </div>

      {/* Tap hint */}
      <p className="text-[#64748b] text-[10px] text-center mt-3">Tap to explore full breakdown →</p>
    </div>
  );
}
