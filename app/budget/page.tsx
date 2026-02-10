'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { DollarSign, RefreshCw, ChevronRight, Sparkles, Search, X, Loader2, FileText, BarChart3, Landmark, BookOpen, MapPin } from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { BudgetSectorDetail } from '@/components/budget/BudgetSectorDetail';
import { BudgetAskPanel } from '@/components/budget/BudgetAskPanel';
import { BudgetAIBrief } from '@/components/budget/BudgetAIBrief';

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

interface SearchAllocation {
  line_item: string;
  line_item_code: string;
  expenditure_type: string;
  agency_code: string;
  agency_name: string;
  actual_2024: number;
  budget_2025: number;
  revised_2025: number;
  budget_2026: number;
  actual_2024_fmt: string;
  budget_2025_fmt: string;
  revised_2025_fmt: string;
  budget_2026_fmt: string;
  source: string;
  notes: string | null;
  sector: string;
  programme: string;
  linked_docs: { doc: string; label: string; tag: string }[];
}

interface SearchLineItem {
  id: number;
  volume: number;
  page_number: number;
  agency: string;
  programme: string;
  programme_number: string;
  line_item: string;
  description: string;
  expenditure_type: string;
  actual_previous_year: number;
  revised_current_year: number;
  budget_estimate: number;
  actual_previous_year_fmt: string;
  revised_current_year_fmt: string;
  budget_estimate_fmt: string;
  source: string;
}

interface SearchResults {
  allocations: SearchAllocation[];
  line_items: SearchLineItem[];
  projects: Record<string, unknown>[];
  indicators: Record<string, unknown>[];
  documents: { agency: string; document_name: string; snippet: string }[];
  loans: Record<string, unknown>[];
  raw_pages: { volume: number; page: number; snippet: string }[];
  total_results: number;
}

const SECTOR_ICONS: Record<string, string> = {
  energy: '⚡',
  water: '💧',
  aviation: '✈️',
  maritime: '🚢',
};

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

      {/* Search Bar */}
      <div className="relative">
        <div className="relative flex items-center">
          <Search className="absolute left-3 h-4 w-4 text-[#64748b] pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by line item code (e.g. 6321), name, agency, or keyword..."
            className="w-full pl-10 pr-10 py-3 rounded-xl bg-[#1a2744] border border-[#2d3a52] focus:border-[#d4af37] text-white text-sm placeholder:text-[#64748b] outline-none transition-colors"
          />
          {isSearching && (
            <Loader2 className="absolute right-10 h-4 w-4 animate-spin text-[#d4af37]" />
          )}
          {searchQuery && (
            <button
              onClick={clearSearch}
              className="absolute right-3 p-0.5 rounded-md hover:bg-[#2d3a52] text-[#64748b] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {/* Quick search chips */}
        {!isShowingSearch && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {['6321', 'GPL', 'GWI', 'CJIA', 'HECI', 'LINMINE', 'MARAD', '2611300', 'Lethem', 'Dredging'].map(chip => (
              <button
                key={chip}
                onClick={() => handleSearchChange(chip)}
                className="px-2.5 py-1 rounded-lg bg-[#0a1628]/60 border border-[#2d3a52]/50 text-[#94a3b8] text-[11px] font-mono hover:border-[#d4af37]/40 hover:text-[#d4af37] transition-colors"
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

// ── Search Results View ──

function SearchResultsView({
  results,
  isSearching,
  query,
  onAnalyze,
  onSectorClick,
}: {
  results: SearchResults | null;
  isSearching: boolean;
  query: string;
  onAnalyze: (a: SearchAllocation) => void;
  onSectorClick: (sector: string) => void;
}) {
  if (isSearching && !results) {
    return (
      <div className="flex items-center gap-3 p-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
        <span className="text-[#64748b] text-sm">Searching budget data...</span>
      </div>
    );
  }

  if (!results) return null;

  const { allocations, line_items, projects, indicators, documents, loans, raw_pages, total_results } = results;

  if (total_results === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <Search className="h-8 w-8 text-[#64748b] mx-auto mb-3" />
        <p className="text-[#94a3b8] text-sm">No results for &quot;{query}&quot;</p>
        <p className="text-[#64748b] text-xs mt-1">Try a line item code (6321, 2611300), agency (GPL, GWI), or keyword</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results summary */}
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-[#64748b] text-xs">
          {isSearching && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
          <span className="text-white font-semibold">{total_results}</span> result{total_results !== 1 ? 's' : ''} for &quot;{query}&quot;
        </p>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {allocations.length > 0 && <span className="bg-[#d4af37]/10 text-[#d4af37] px-2 py-0.5 rounded-full">{allocations.length} allocations</span>}
          {line_items.length > 0 && <span className="bg-[#06b6d4]/10 text-[#06b6d4] px-2 py-0.5 rounded-full">{line_items.length} line items</span>}
          {projects.length > 0 && <span className="bg-[#3b82f6]/10 text-[#3b82f6] px-2 py-0.5 rounded-full">{projects.length} projects</span>}
          {indicators.length > 0 && <span className="bg-[#22c55e]/10 text-[#22c55e] px-2 py-0.5 rounded-full">{indicators.length} KPIs</span>}
          {documents.length > 0 && <span className="bg-[#a78bfa]/10 text-[#a78bfa] px-2 py-0.5 rounded-full">{documents.length} docs</span>}
          {loans.length > 0 && <span className="bg-[#f97316]/10 text-[#f97316] px-2 py-0.5 rounded-full">{loans.length} loans</span>}
          {raw_pages.length > 0 && <span className="bg-[#64748b]/10 text-[#64748b] px-2 py-0.5 rounded-full">{raw_pages.length} pages</span>}
        </div>
      </div>

      {/* Budget Allocations */}
      {allocations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <BarChart3 className="h-4 w-4 text-[#d4af37]" />
            <p className="text-[#d4af37] text-xs font-semibold uppercase tracking-wider">Budget Allocations</p>
          </div>
          {allocations.map((item, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium">{item.line_item}</p>
                    {item.line_item_code && (
                      <span className="text-[#d4af37] font-mono text-[10px] bg-[#d4af37]/10 px-1.5 py-0.5 rounded shrink-0">
                        {item.line_item_code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[#64748b] text-[10px] font-mono">{item.agency_code}</span>
                    <span className="text-[#64748b] text-[10px]">{item.agency_name}</span>
                    <span className="text-[#64748b] text-[10px]">·</span>
                    <span className="text-[#64748b] text-[10px]">{item.expenditure_type}</span>
                    <span className="text-[#64748b] text-[10px]">·</span>
                    <button
                      onClick={() => onSectorClick(item.sector)}
                      className="text-[#64748b] text-[10px] hover:text-[#d4af37] transition-colors underline decoration-dotted"
                    >
                      {item.sector}
                    </button>
                    <span className="text-[#64748b] text-[10px]">·</span>
                    <span className="text-[#64748b] text-[10px]">{item.source}</span>
                  </div>
                </div>
                <p className="text-[#d4af37] font-bold text-sm font-mono shrink-0">{item.budget_2026_fmt}</p>
              </div>

              {/* 4-year trend */}
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div>
                  <p className="text-[#64748b]">2024 Act</p>
                  <p className="text-white font-mono">{item.actual_2024_fmt}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">2025 Bud</p>
                  <p className="text-white font-mono">{item.budget_2025_fmt}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">2025 Rev</p>
                  <p className="text-white font-mono">{item.revised_2025_fmt}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">2026 Bud</p>
                  <p className="text-[#d4af37] font-mono font-bold">{item.budget_2026_fmt}</p>
                </div>
              </div>

              {/* Notes */}
              {item.notes && (
                <p className="text-[#94a3b8] text-[11px] italic">{item.notes}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAnalyze(item)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37] text-[11px] font-medium hover:bg-[#d4af37]/20 hover:border-[#d4af37]/40 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Defence Brief
                </button>
                {item.linked_docs.length > 0 && (
                  <span className="text-[#64748b] text-[10px]">
                    {item.linked_docs.length} doc{item.linked_docs.length !== 1 ? 's' : ''} linked
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Budget Line Items (from budget_items — individual parsed rows) */}
      {line_items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <DollarSign className="h-4 w-4 text-[#06b6d4]" />
            <p className="text-[#06b6d4] text-xs font-semibold uppercase tracking-wider">Budget Line Items (Agency 34)</p>
          </div>
          {line_items.map((item, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{item.line_item}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.programme && (
                      <span className="text-[#06b6d4] font-mono text-[10px] bg-[#06b6d4]/10 px-1.5 py-0.5 rounded shrink-0">
                        {item.programme}
                      </span>
                    )}
                    {item.expenditure_type && (
                      <span className="text-[#64748b] text-[10px]">{item.expenditure_type}</span>
                    )}
                    <span className="text-[#64748b] text-[10px]">{item.source}</span>
                    {item.agency && (
                      <span className="text-[#64748b] text-[10px] truncate max-w-[200px]">{item.agency}</span>
                    )}
                  </div>
                </div>
                <p className="text-[#d4af37] font-bold text-sm font-mono shrink-0">{item.budget_estimate_fmt}</p>
              </div>

              {/* 3-year trend */}
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <p className="text-[#64748b]">2024 Act</p>
                  <p className="text-white font-mono">{item.actual_previous_year_fmt}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">2025 Rev</p>
                  <p className="text-white font-mono">{item.revised_current_year_fmt}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">2026 Est</p>
                  <p className="text-[#d4af37] font-mono font-bold">{item.budget_estimate_fmt}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Capital Projects */}
      {projects.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <Landmark className="h-4 w-4 text-[#3b82f6]" />
            <p className="text-[#3b82f6] text-xs font-semibold uppercase tracking-wider">Capital Projects</p>
          </div>
          {projects.map((p, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm">{p.project_title as string}</p>
                  <p className="text-[#64748b] text-[10px]">{p.agency_code as string} · Ref: {p.ref_number as string} · {p.status as string}</p>
                </div>
                <p className="text-[#d4af37] font-bold text-sm font-mono shrink-0">
                  {fmtAmountClient(p.budget_2026 as number)}
                </p>
              </div>
              <p className="text-[#94a3b8] text-xs">{p.description as string}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-[#64748b]">Total: <span className="text-white font-mono">{fmtAmountClient(p.total_project_cost as number)}</span></span>
                {!!p.region && <span className="text-[#64748b]"><MapPin className="h-3 w-3 inline" /> {p.region as string}</span>}
                {!!p.foreign_source && <span className="text-[#64748b]">Foreign: {p.foreign_source as string}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Performance Indicators */}
      {indicators.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <BookOpen className="h-4 w-4 text-[#22c55e]" />
            <p className="text-[#22c55e] text-xs font-semibold uppercase tracking-wider">Performance Indicators</p>
          </div>
          {indicators.map((ind, i) => (
            <div key={i} className="glass-card p-3">
              <p className="text-white text-sm font-medium">{ind.indicator as string}</p>
              <p className="text-[#64748b] text-[10px]">{ind.agency_code as string} · {ind.programme as string}</p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div>
                  <p className="text-[#64748b]">Actual 2024</p>
                  <p className="text-white font-mono">{(ind.actual_2024 as string) || '—'}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">Target 2025</p>
                  <p className="text-white font-mono">{(ind.target_2025 as string) || '—'}</p>
                </div>
                <div>
                  <p className="text-[#64748b]">Target 2026</p>
                  <p className="text-[#d4af37] font-mono font-bold">{(ind.target_2026 as string) || '—'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agency Documents */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <FileText className="h-4 w-4 text-[#a78bfa]" />
            <p className="text-[#a78bfa] text-xs font-semibold uppercase tracking-wider">Agency Documents</p>
          </div>
          {documents.map((doc, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-3.5 w-3.5 text-[#a78bfa] shrink-0" />
                <p className="text-white text-sm font-medium truncate">{doc.document_name}</p>
                <span className="text-[#a78bfa] font-mono text-[10px] bg-[#a78bfa]/10 px-1.5 py-0.5 rounded shrink-0">{doc.agency}</span>
              </div>
              <p className="text-[#94a3b8] text-xs line-clamp-2">{doc.snippet}</p>
            </div>
          ))}
        </div>
      )}

      {/* GPL Loans */}
      {loans.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <Landmark className="h-4 w-4 text-[#f97316]" />
            <p className="text-[#f97316] text-xs font-semibold uppercase tracking-wider">GPL Loans</p>
          </div>
          {loans.map((loan, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white text-sm font-medium">{loan.lender as string || loan.loan_ref as string}</p>
                  <p className="text-[#64748b] text-[10px]">{loan.purpose as string}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[#d4af37] font-bold text-sm font-mono">US${((loan.outstanding_usd as number) || 0).toLocaleString()}</p>
                  <p className="text-[#64748b] text-[10px]">outstanding</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw Pages */}
      {raw_pages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <BookOpen className="h-4 w-4 text-[#64748b]" />
            <p className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">Raw Budget Pages</p>
          </div>
          {raw_pages.map((page, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#d4af37] font-mono text-[10px] bg-[#d4af37]/10 px-1.5 py-0.5 rounded">
                  V{page.volume}p{page.page}
                </span>
                <span className="text-[#64748b] text-[10px]">Volume {page.volume}, Page {page.page}</span>
              </div>
              <p className="text-[#94a3b8] text-xs line-clamp-3 whitespace-pre-wrap font-mono">{page.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sector Card ──

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

// Client-side amount formatter
function fmtAmountClient(val: number): string {
  if (!val || val === 0) return '—';
  const sign = val < 0 ? '-' : '';
  const v = Math.abs(val);
  if (v >= 1_000_000) return `G$${sign}${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `G$${sign}${(v / 1_000).toFixed(2)}M`;
  return `G$${sign}${v.toLocaleString()}K`;
}
