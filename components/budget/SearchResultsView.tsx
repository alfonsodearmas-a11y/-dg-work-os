'use client';

import { DollarSign, Loader2, Search, Sparkles, FileText, BarChart3, Landmark, BookOpen, MapPin } from 'lucide-react';
import { fmtBudgetAmount } from '@/lib/format';

export interface SearchAllocation {
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

export interface SearchLineItem {
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

export interface SearchResults {
  allocations: SearchAllocation[];
  line_items: SearchLineItem[];
  projects: Record<string, unknown>[];
  indicators: Record<string, unknown>[];
  documents: { agency: string; document_name: string; snippet: string }[];
  loans: Record<string, unknown>[];
  raw_pages: { volume: number; page: number; snippet: string }[];
  total_results: number;
}

interface SearchResultsViewProps {
  results: SearchResults | null;
  isSearching: boolean;
  query: string;
  onAnalyze: (a: SearchAllocation) => void;
  onSectorClick: (sector: string) => void;
}

export function SearchResultsView({
  results,
  isSearching,
  query,
  onAnalyze,
  onSectorClick,
}: SearchResultsViewProps) {
  if (isSearching && !results) {
    return (
      <div className="flex items-center gap-3 p-8 justify-center" role="status" aria-label="Searching">
        <Loader2 className="h-5 w-5 animate-spin text-gold-500" aria-hidden="true" />
        <span className="text-navy-600 text-sm">Searching budget data...</span>
      </div>
    );
  }

  if (!results) return null;

  const { allocations, line_items, projects, indicators, documents, loans, raw_pages, total_results } = results;

  if (total_results === 0) {
    return (
      <div className="card-premium p-8 text-center">
        <Search className="h-8 w-8 text-navy-600 mx-auto mb-3" />
        <p className="text-slate-400 text-sm">No results for &quot;{query}&quot;</p>
        <p className="text-navy-600 text-xs mt-1">Try a line item code (6321, 2611300), agency (GPL, GWI), or keyword</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Results summary */}
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-navy-600 text-xs">
          {isSearching && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
          <span className="text-white font-semibold">{total_results}</span> result{total_results !== 1 ? 's' : ''} for &quot;{query}&quot;
        </p>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          {allocations.length > 0 && <span className="bg-gold-500/10 text-gold-500 px-2 py-0.5 rounded-full">{allocations.length} allocations</span>}
          {line_items.length > 0 && <span className="bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full">{line_items.length} line items</span>}
          {projects.length > 0 && <span className="bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full">{projects.length} projects</span>}
          {indicators.length > 0 && <span className="bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full">{indicators.length} KPIs</span>}
          {documents.length > 0 && <span className="bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full">{documents.length} docs</span>}
          {loans.length > 0 && <span className="bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full">{loans.length} loans</span>}
          {raw_pages.length > 0 && <span className="bg-navy-800 text-navy-600 px-2 py-0.5 rounded-full">{raw_pages.length} pages</span>}
        </div>
      </div>

      {/* Budget Allocations */}
      {allocations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <BarChart3 className="h-4 w-4 text-gold-500" />
            <p className="text-gold-500 text-xs font-semibold uppercase tracking-wider">Budget Allocations</p>
          </div>
          {allocations.map((item, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white text-sm font-medium">{item.line_item}</p>
                    {item.line_item_code && (
                      <span className="text-gold-500 font-mono text-[10px] bg-gold-500/10 px-1.5 py-0.5 rounded shrink-0">
                        {item.line_item_code}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-navy-600 text-[10px] font-mono">{item.agency_code}</span>
                    <span className="text-navy-600 text-[10px]">{item.agency_name}</span>
                    <span className="text-navy-600 text-[10px]">·</span>
                    <span className="text-navy-600 text-[10px]">{item.expenditure_type}</span>
                    <span className="text-navy-600 text-[10px]">·</span>
                    <button
                      onClick={() => onSectorClick(item.sector)}
                      className="text-navy-600 text-[10px] hover:text-gold-500 transition-colors underline decoration-dotted"
                    >
                      {item.sector}
                    </button>
                    <span className="text-navy-600 text-[10px]">·</span>
                    <span className="text-navy-600 text-[10px]">{item.source}</span>
                  </div>
                </div>
                <p className="text-gold-500 font-bold text-sm font-mono shrink-0">{item.budget_2026_fmt}</p>
              </div>

              {/* 4-year trend */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px]">
                <div>
                  <p className="text-navy-600">2024 Act</p>
                  <p className="text-white font-mono">{item.actual_2024_fmt}</p>
                </div>
                <div>
                  <p className="text-navy-600">2025 Bud</p>
                  <p className="text-white font-mono">{item.budget_2025_fmt}</p>
                </div>
                <div>
                  <p className="text-navy-600">2025 Rev</p>
                  <p className="text-white font-mono">{item.revised_2025_fmt}</p>
                </div>
                <div>
                  <p className="text-navy-600">2026 Bud</p>
                  <p className="text-gold-500 font-mono font-bold">{item.budget_2026_fmt}</p>
                </div>
              </div>

              {/* Notes */}
              {item.notes && (
                <p className="text-slate-400 text-[11px] italic">{item.notes}</p>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onAnalyze(item)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[11px] font-medium hover:bg-gold-500/20 hover:border-gold-500/40 transition-colors"
                >
                  <Sparkles className="h-3 w-3" />
                  Defence Brief
                </button>
                {item.linked_docs.length > 0 && (
                  <span className="text-navy-600 text-[10px]">
                    {item.linked_docs.length} doc{item.linked_docs.length !== 1 ? 's' : ''} linked
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Budget Line Items (from budget_items -- individual parsed rows) */}
      {line_items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <DollarSign className="h-4 w-4 text-cyan-500" />
            <p className="text-cyan-500 text-xs font-semibold uppercase tracking-wider">Agency 34 Line Items</p>
          </div>
          {line_items.map((item, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{item.line_item}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.programme && (
                      <span className="text-cyan-500 font-mono text-[10px] bg-[#06b6d4]/10 px-1.5 py-0.5 rounded shrink-0">
                        {item.programme}
                      </span>
                    )}
                    {item.expenditure_type && (
                      <span className="text-navy-600 text-[10px]">{item.expenditure_type}</span>
                    )}
                    <span className="text-navy-600 text-[10px]">{item.source}</span>
                    {item.agency && (
                      <span className="text-navy-600 text-[10px] truncate max-w-[200px]">{item.agency}</span>
                    )}
                  </div>
                </div>
                <p className="text-gold-500 font-bold text-sm font-mono shrink-0">{item.budget_estimate_fmt}</p>
              </div>

              {/* 3-year trend */}
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div>
                  <p className="text-navy-600">2024 Act</p>
                  <p className="text-white font-mono">{item.actual_previous_year_fmt}</p>
                </div>
                <div>
                  <p className="text-navy-600">2025 Rev</p>
                  <p className="text-white font-mono">{item.revised_current_year_fmt}</p>
                </div>
                <div>
                  <p className="text-navy-600">2026 Est</p>
                  <p className="text-gold-500 font-mono font-bold">{item.budget_estimate_fmt}</p>
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
            <Landmark className="h-4 w-4 text-blue-500" />
            <p className="text-blue-500 text-xs font-semibold uppercase tracking-wider">Capital Projects</p>
          </div>
          {projects.map((p, i) => (
            <div key={i} className="glass-card p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white font-semibold text-sm">{p.project_title as string}</p>
                  <p className="text-navy-600 text-[10px]">{p.agency_code as string} · Ref: {p.ref_number as string} · {p.status as string}</p>
                </div>
                <p className="text-gold-500 font-bold text-sm font-mono shrink-0">
                  {fmtBudgetAmount(p.budget_2026 as number)}
                </p>
              </div>
              <p className="text-slate-400 text-xs">{p.description as string}</p>
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-navy-600">Total: <span className="text-white font-mono">{fmtBudgetAmount(p.total_project_cost as number)}</span></span>
                {!!p.region && <span className="text-navy-600"><MapPin className="h-3 w-3 inline" /> {p.region as string}</span>}
                {!!p.foreign_source && <span className="text-navy-600">Foreign: {p.foreign_source as string}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Performance Indicators */}
      {indicators.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 pb-1">
            <BookOpen className="h-4 w-4 text-green-500" />
            <p className="text-green-500 text-xs font-semibold uppercase tracking-wider">Performance Indicators</p>
          </div>
          {indicators.map((ind, i) => (
            <div key={i} className="glass-card p-3">
              <p className="text-white text-sm font-medium">{ind.indicator as string}</p>
              <p className="text-navy-600 text-[10px]">{ind.agency_code as string} · {ind.programme as string}</p>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px]">
                <div>
                  <p className="text-navy-600">Actual 2024</p>
                  <p className="text-white font-mono">{(ind.actual_2024 as string) || '—'}</p>
                </div>
                <div>
                  <p className="text-navy-600">Target 2025</p>
                  <p className="text-white font-mono">{(ind.target_2025 as string) || '—'}</p>
                </div>
                <div>
                  <p className="text-navy-600">Target 2026</p>
                  <p className="text-gold-500 font-mono font-bold">{(ind.target_2026 as string) || '—'}</p>
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
            <FileText className="h-4 w-4 text-violet-400" />
            <p className="text-violet-400 text-xs font-semibold uppercase tracking-wider">Agency Documents</p>
          </div>
          {documents.map((doc, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                <p className="text-white text-sm font-medium truncate">{doc.document_name}</p>
                <span className="text-violet-400 font-mono text-[10px] bg-[#a78bfa]/10 px-1.5 py-0.5 rounded shrink-0">{doc.agency}</span>
              </div>
              <p className="text-slate-400 text-xs line-clamp-2">{doc.snippet}</p>
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
                  <p className="text-navy-600 text-[10px]">{loan.purpose as string}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-gold-500 font-bold text-sm font-mono">US${((loan.outstanding_usd as number) || 0).toLocaleString()}</p>
                  <p className="text-navy-600 text-[10px]">outstanding</p>
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
            <BookOpen className="h-4 w-4 text-navy-600" />
            <p className="text-navy-600 text-xs font-semibold uppercase tracking-wider">Raw Budget Pages</p>
          </div>
          {raw_pages.map((page, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gold-500 font-mono text-[10px] bg-gold-500/10 px-1.5 py-0.5 rounded">
                  V{page.volume}p{page.page}
                </span>
                <span className="text-navy-600 text-[10px]">Volume {page.volume}, Page {page.page}</span>
              </div>
              <p className="text-slate-400 text-xs line-clamp-3 whitespace-pre-wrap font-mono">{page.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
