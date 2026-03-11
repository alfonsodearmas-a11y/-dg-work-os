'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DollarSign, RefreshCw, Sparkles, Search, X, Loader2 } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { BudgetSectorDetail } from '@/components/budget/BudgetSectorDetail';
import { BudgetAskPanel } from '@/components/budget/BudgetAskPanel';
import { BudgetAIBrief } from '@/components/budget/BudgetAIBrief';
import { SearchResultsView } from '@/components/budget/SearchResultsView';
import { SectorCard, SECTOR_ICONS } from '@/components/budget/SectorCard';
import type { SearchResults, SearchAllocation } from '@/components/budget/SearchResultsView';
import type { Sector } from '@/components/budget/SectorCard';

interface SummaryData {
  sectors: Sector[];
  grand_total: number;
  grand_total_fmt: string;
}

export default function BudgetPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [aiTarget, setAiTarget] = useState<SearchAllocation | null>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/budget/search?q=${encodeURIComponent(q.trim())}`);
      const json = await res.json();
      setSearchResults(json);
    } catch (e) {
      console.error('Search failed:', e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!val.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimeout.current = setTimeout(() => doSearch(val), 300);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setIsSearching(false);
    inputRef.current?.focus();
  };

  const selectedSectorData = data?.sectors.find(s => s.sector === selectedSector);
  const isShowingSearch = searchQuery.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Budget Estimates 2026</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">
              Ministry of Public Utilities & Aviation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setAskOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-[#d4af37]/20 to-[#b8860b]/20 border border-gold-500/30 text-gold-500 hover:border-gold-500 transition-colors touch-active"
            aria-label="Ask AI"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm hidden md:inline">Ask AI</span>
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors disabled:opacity-50 touch-active"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="text-sm hidden md:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-navy-600 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by line item code (e.g. 6321), name, agency, or keyword..."
            aria-label="Search budget line items"
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-navy-900 border border-navy-800 focus:border-gold-500 text-white text-sm placeholder:text-navy-600 outline-none transition-colors"
          />
          {isSearching && (
            <Loader2 className="absolute right-10 h-4 w-4 animate-spin text-gold-500" />
          )}
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 p-0.5 rounded-md hover:bg-navy-800 text-navy-600 hover:text-white transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Quick search chips */}
        {!isShowingSearch && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['6223', '6321', '6116', 'GPL', 'GWI', 'CJIA', 'HECI', 'LINMINE', 'MARAD', '2611300', 'Lethem', 'Dredging'].map(chip => (
              <button
                key={chip}
                onClick={() => handleSearchChange(chip)}
                className="px-2.5 py-1 rounded-lg bg-navy-950/60 border border-navy-800/50 text-slate-400 text-[11px] font-mono hover:border-gold-500/40 hover:text-gold-500 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Search Results OR Normal Budget View */}
      {isShowingSearch ? (
        <SearchResultsView
          results={searchResults}
          isSearching={isSearching}
          query={searchQuery}
          onAnalyze={setAiTarget}
          onSectorClick={setSelectedSector}
        />
      ) : (
        <>
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
                    <p className="text-navy-600 text-xs font-semibold uppercase tracking-wider mb-1">Total Ministry Budget 2026</p>
                    <p className="stat-number text-3xl md:text-4xl">{data.grand_total_fmt}</p>
                    <p className="text-navy-600 text-xs mt-1">Agency 34 — Programmes 342–345</p>
                  </div>
                  <div className="hidden md:flex items-center gap-3">
                    {data.sectors.map(s => (
                      <button
                        key={s.sector}
                        onClick={() => setSelectedSector(s.sector)}
                        className="text-center hover:scale-110 transition-transform cursor-pointer"
                      >
                        <p className="text-lg">{SECTOR_ICONS[s.sector]}</p>
                        <p className="text-[10px] text-navy-600 uppercase">{s.sector}</p>
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
        </>
      )}

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

      {/* AI Analysis Panel from search results */}
      {aiTarget && (
        <BudgetAIBrief
          allocation={aiTarget}
          onClose={() => setAiTarget(null)}
        />
      )}
    </div>
  );
}
