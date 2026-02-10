'use client';

import { useState, useEffect, useCallback } from 'react';
import { Sparkles, FileText, ChevronDown, ChevronRight, Loader2, BarChart3, Landmark, BookOpen } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BudgetAIBrief } from './BudgetAIBrief';

interface Allocation {
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
  linked_docs: { doc: string; label: string; tag: string }[];
  programme: string;
}

interface SectorData {
  sector: string;
  agency_codes: string[];
  allocations: Allocation[];
  projects: Record<string, unknown>[];
  indicators: Record<string, unknown>[];
  documents: { agency: string; document_name: string; chunk_count: number; first_snippet: string }[];
  loans: Record<string, unknown>[];
}

const SECTOR_META: Record<string, { label: string; icon: string; color: string }> = {
  energy: { label: 'Electricity Services', icon: '⚡', color: '#ef4444' },
  water: { label: 'Water Services', icon: '💧', color: '#3b82f6' },
  aviation: { label: 'Aviation', icon: '✈️', color: '#06b6d4' },
  maritime: { label: 'Maritime Administration', icon: '🚢', color: '#22c55e' },
};

export function BudgetSectorDetail({ sector }: { sector: string }) {
  const [data, setData] = useState<SectorData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'allocations' | 'projects' | 'documents' | 'kpis'>('allocations');
  const [aiTarget, setAiTarget] = useState<Allocation | null>(null);
  const [expandedAgencies, setExpandedAgencies] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/budget/sector?sector=${sector}`);
      const json = await res.json();
      setData(json);
      // Auto-expand all agencies
      if (json.agency_codes) {
        setExpandedAgencies(new Set(json.agency_codes));
      }
    } catch (e) {
      console.error('Failed to load sector detail:', e);
    } finally {
      setIsLoading(false);
    }
  }, [sector]);

  useEffect(() => { loadData(); }, [loadData]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-8 justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#d4af37]" />
        <span className="text-[#64748b] text-sm">Loading sector data...</span>
      </div>
    );
  }

  if (!data) return <p className="text-[#64748b] p-4">Failed to load sector data.</p>;

  const meta = SECTOR_META[sector] || { label: sector, icon: '📋', color: '#64748b' };

  // Group allocations by agency
  const byAgency: Record<string, Allocation[]> = {};
  for (const a of data.allocations) {
    if (!byAgency[a.agency_code]) byAgency[a.agency_code] = [];
    byAgency[a.agency_code].push(a);
  }

  // Sort agencies: Agency 34 first, then by total budget desc
  const agencyOrder = Object.keys(byAgency).sort((a, b) => {
    if (a === '34') return -1;
    if (b === '34') return 1;
    const totalA = byAgency[a].filter(x => x.expenditure_type === 'total').reduce((s, x) => s + x.budget_2026, 0);
    const totalB = byAgency[b].filter(x => x.expenditure_type === 'total').reduce((s, x) => s + x.budget_2026, 0);
    return totalB - totalA;
  });

  const toggleAgency = (code: string) => {
    setExpandedAgencies(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const tabs = [
    { key: 'allocations' as const, label: 'Budget Lines', count: data.allocations.length, icon: BarChart3 },
    { key: 'projects' as const, label: 'Projects', count: data.projects.length, icon: Landmark },
    { key: 'documents' as const, label: 'Documents', count: data.documents.length, icon: FileText },
    { key: 'kpis' as const, label: 'KPIs', count: data.indicators.length, icon: BookOpen },
  ];

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-[#0a1628] rounded-xl p-1">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-[#d4af37]/20 text-[#d4af37]'
                  : 'text-[#64748b] hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="text-[10px] opacity-70">({tab.count})</span>
            </button>
          );
        })}
      </div>

      {/* Allocations Tab */}
      {activeTab === 'allocations' && (
        <div className="space-y-3">
          {agencyOrder.map(agencyCode => {
            const items = byAgency[agencyCode];
            const totals = items.filter(a => a.expenditure_type === 'total');
            const currentItems = items.filter(a => a.expenditure_type === 'current');
            const capitalItems = items.filter(a => a.expenditure_type === 'capital');
            const statBody = items.filter(a => a.expenditure_type === 'statutory_body');
            const agencyTotal = totals.reduce((s, t) => s + t.budget_2026, 0);
            const agencyName = items[0]?.agency_name || agencyCode;
            const isExpanded = expandedAgencies.has(agencyCode);

            return (
              <div key={agencyCode} className="glass-card overflow-hidden">
                {/* Agency header — always visible */}
                <button
                  onClick={() => toggleAgency(agencyCode)}
                  className="w-full flex items-center justify-between p-3 md:p-4 hover:bg-[#d4af37]/5 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[#d4af37] font-mono text-xs font-bold bg-[#d4af37]/10 px-2 py-0.5 rounded">{agencyCode}</span>
                    <span className="text-white font-semibold text-sm truncate">{agencyName}</span>
                    <span className="text-[#64748b] text-[10px] shrink-0">
                      {items.filter(a => a.expenditure_type !== 'total').length} items
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {agencyTotal > 0 && (
                      <span className="text-[#d4af37] font-bold text-sm font-mono">{fmtAmountClient(agencyTotal)}</span>
                    )}
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4 text-[#64748b]" />
                      : <ChevronRight className="h-4 w-4 text-[#64748b]" />
                    }
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-[#2d3a52]/50 px-3 md:px-4 pb-3 space-y-3">
                    {/* Summary totals */}
                    {totals.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-3">
                        {totals.map((t, i) => (
                          <div key={i} className="bg-[#0a1628]/60 rounded-lg px-3 py-2 flex-1 min-w-[120px]">
                            <p className="text-[10px] text-[#64748b] uppercase">{t.line_item.replace('Total ', '')}</p>
                            <p className="text-white font-semibold text-sm font-mono">{t.budget_2026_fmt}</p>
                            <div className="flex gap-2 text-[9px] text-[#64748b] mt-0.5">
                              <span>2024: {t.actual_2024_fmt}</span>
                              <span>2025: {t.budget_2025_fmt}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Current Expenditure */}
                    {currentItems.length > 0 && (
                      <AllocationSection title="Current Expenditure" items={currentItems} onAnalyze={setAiTarget} />
                    )}

                    {/* Capital Expenditure */}
                    {capitalItems.length > 0 && (
                      <AllocationSection title="Capital Expenditure" items={capitalItems} onAnalyze={setAiTarget} />
                    )}

                    {/* Statutory Body lines */}
                    {statBody.length > 0 && (
                      <AllocationSection title="Statutory Body" items={statBody} onAnalyze={setAiTarget} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="space-y-2">
          {data.projects.length === 0 ? (
            <p className="text-[#64748b] text-sm p-4">No capital project profiles for this sector.</p>
          ) : (
            data.projects.map((p, i) => (
              <div key={i} className="glass-card p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm">{p.project_title as string}</p>
                    <p className="text-[#64748b] text-[10px]">{p.agency_code as string} · Ref: {p.ref_number as string}</p>
                  </div>
                  <Badge variant={p.status === 'Ongoing' ? 'success' : 'gold'}>{p.status as string}</Badge>
                </div>
                <p className="text-[#94a3b8] text-xs">{p.description as string}</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-[#64748b]">Total Cost: <span className="text-white font-mono">G${((p.total_project_cost as number) / 1000).toFixed(2)}M</span></span>
                  <span className="text-[#64748b]">2026: <span className="text-[#d4af37] font-mono font-bold">G${((p.budget_2026 as number) / 1000).toFixed(2)}M</span></span>
                  {!!p.region && <span className="text-[#64748b]">Region: <span className="text-white">{p.region as string}</span></span>}
                </div>
                {!!p.benefits && (
                  <p className="text-[#64748b] text-[10px] italic">Benefits: {p.benefits as string}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Documents Tab */}
      {activeTab === 'documents' && (
        <div className="space-y-2">
          {data.documents.length === 0 ? (
            <p className="text-[#64748b] text-sm p-4">No supporting documents for this sector.</p>
          ) : (
            data.documents.map((doc, i) => (
              <div key={i} className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-[#d4af37] shrink-0" />
                  <p className="text-white text-sm font-medium truncate">{doc.document_name}</p>
                  <span className="text-[#d4af37] font-mono text-[10px] bg-[#d4af37]/10 px-1.5 py-0.5 rounded shrink-0">{doc.agency}</span>
                </div>
                <p className="text-[#94a3b8] text-xs line-clamp-2">{doc.first_snippet}</p>
                <p className="text-[#64748b] text-[10px] mt-1">{doc.chunk_count} section{doc.chunk_count !== 1 ? 's' : ''}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* KPIs Tab */}
      {activeTab === 'kpis' && (
        <div className="space-y-2">
          {data.indicators.length === 0 ? (
            <p className="text-[#64748b] text-sm p-4">No performance indicators for this sector.</p>
          ) : (
            data.indicators.map((ind, i) => (
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
            ))
          )}

          {/* Loans section for energy */}
          {data.loans.length > 0 && (
            <>
              <div className="pt-2">
                <p className="text-[#64748b] text-xs font-semibold uppercase tracking-wider mb-2">Outstanding GPL Loans</p>
              </div>
              {data.loans.map((loan, i) => (
                <div key={i} className="glass-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-white text-sm font-medium">{loan.lender as string}</p>
                      <p className="text-[#64748b] text-[10px]">{loan.purpose as string}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[#d4af37] font-bold text-sm font-mono">US${((loan.outstanding_usd as number) || 0).toLocaleString()}</p>
                      <p className="text-[#64748b] text-[10px]">outstanding</p>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* AI Analysis Panel */}
      {aiTarget && (
        <BudgetAIBrief
          allocation={aiTarget}
          onClose={() => setAiTarget(null)}
        />
      )}
    </div>
  );
}

function AllocationSection({
  title,
  items,
  onAnalyze,
}: {
  title: string;
  items: Allocation[];
  onAnalyze: (a: Allocation) => void;
}) {
  return (
    <div>
      <p className="text-[#64748b] text-[10px] font-semibold uppercase tracking-wider pt-2 pb-1">{title}</p>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="bg-[#0a1628]/40 rounded-lg p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-white text-sm">{item.line_item}</p>
                <p className="text-[#64748b] text-[9px] mt-0.5">{item.source} · {item.notes || item.programme}</p>
              </div>
              <p className="text-[#d4af37] font-bold text-sm font-mono shrink-0">{item.budget_2026_fmt}</p>
            </div>

            {/* 4-year trend */}
            <div className="grid grid-cols-4 gap-2 mt-2 text-[10px]">
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

            {/* Actions */}
            <div className="flex items-center gap-2 mt-2">
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
    </div>
  );
}

// Client-side amount formatter
function fmtAmountClient(val: number): string {
  if (!val || val === 0) return '—';
  const sign = val < 0 ? '-' : '';
  const v = Math.abs(val);
  if (v >= 1_000_000) return `${sign}G$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `${sign}G$${(v / 1_000).toFixed(2)}M`;
  return `${sign}G$${v.toLocaleString()}K`;
}
