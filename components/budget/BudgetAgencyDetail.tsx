'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Sparkles, FileText, TrendingUp, ChevronDown, ChevronRight, X, Send, Loader2, BarChart3 } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { BudgetAIBrief } from './BudgetAIBrief';

interface Allocation {
  line_item: string;
  line_item_code: string;
  expenditure_type: string;
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
  agency_code: string;
  programme: string;
}

interface AgencyData {
  agency: Record<string, unknown> | null;
  allocations: Allocation[];
  projects: Record<string, unknown>[];
  indicators: Record<string, unknown>[];
  loans: Record<string, unknown>[];
  documents: { document_name: string; chunk_count: number; first_snippet: string }[];
}

export function BudgetAgencyDetail({ agencyCode }: { agencyCode: string }) {
  const [data, setData] = useState<AgencyData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'allocations' | 'projects' | 'documents'>('allocations');
  const [aiTarget, setAiTarget] = useState<Allocation | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/budget/agency?code=${agencyCode}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to load agency detail:', e);
    } finally {
      setIsLoading(false);
    }
  }, [agencyCode]);

  useEffect(() => { loadData(); }, [loadData]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!data) return <p className="text-[#64748b]">Failed to load data.</p>;

  const totals = data.allocations.filter(a => a.expenditure_type === 'total');
  const currentItems = data.allocations.filter(a => a.expenditure_type === 'current');
  const capitalItems = data.allocations.filter(a => a.expenditure_type === 'capital');

  const tabs = [
    { key: 'allocations' as const, label: 'Allocations', count: data.allocations.length },
    { key: 'projects' as const, label: 'Projects', count: data.projects.length },
    { key: 'documents' as const, label: 'Documents', count: data.documents.length },
  ];

  return (
    <div className="space-y-4">
      {/* Agency Summary */}
      {totals.length > 0 && (
        <div className="glass-card p-4 space-y-2">
          {totals.map((t, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-white font-semibold text-sm">{t.line_item}</p>
                <p className="text-[#64748b] text-xs">{t.programme} &middot; {t.source}</p>
              </div>
              <p className="text-[#d4af37] font-bold text-lg font-mono">{t.budget_2026_fmt}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0a1628] rounded-xl p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-[#d4af37]/20 text-[#d4af37]'
                : 'text-[#64748b] hover:text-white'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'allocations' && (
        <div className="space-y-2">
          {currentItems.length > 0 && (
            <AllocationGroup
              title="Current Expenditure"
              items={currentItems}
              onAnalyze={setAiTarget}
            />
          )}
          {capitalItems.length > 0 && (
            <AllocationGroup
              title="Capital Expenditure"
              items={capitalItems}
              onAnalyze={setAiTarget}
            />
          )}
        </div>
      )}

      {activeTab === 'projects' && (
        <div className="space-y-2">
          {data.projects.length === 0 ? (
            <p className="text-[#64748b] text-sm p-4">No capital project profiles for this agency.</p>
          ) : (
            data.projects.map((p, i) => (
              <div key={i} className="glass-card p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-white font-semibold text-sm">{p.project_title as string}</p>
                  <Badge variant={p.status === 'Ongoing' ? 'success' : 'gold'}>{p.status as string}</Badge>
                </div>
                <p className="text-[#94a3b8] text-xs">{p.description as string}</p>
                <div className="flex gap-3 text-xs">
                  <span className="text-[#64748b]">Total: <span className="text-white font-mono">G${((p.total_project_cost as number) / 1000).toFixed(2)}M</span></span>
                  <span className="text-[#64748b]">2026: <span className="text-[#d4af37] font-mono">G${((p.budget_2026 as number) / 1000).toFixed(2)}M</span></span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'documents' && (
        <div className="space-y-2">
          {data.documents.length === 0 ? (
            <p className="text-[#64748b] text-sm p-4">No supporting documents for this agency.</p>
          ) : (
            data.documents.map((doc, i) => (
              <div key={i} className="glass-card p-3">
                <div className="flex items-center gap-2 mb-1">
                  <FileText className="h-4 w-4 text-[#d4af37] shrink-0" />
                  <p className="text-white text-sm font-medium truncate">{doc.document_name}</p>
                </div>
                <p className="text-[#94a3b8] text-xs line-clamp-2">{doc.first_snippet}</p>
                <p className="text-[#64748b] text-[10px] mt-1">{doc.chunk_count} section{doc.chunk_count !== 1 ? 's' : ''}</p>
              </div>
            ))
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

function AllocationGroup({
  title,
  items,
  onAnalyze,
}: {
  title: string;
  items: Allocation[];
  onAnalyze: (a: Allocation) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between py-2 px-1 text-left"
      >
        <span className="text-[#64748b] text-xs font-semibold uppercase tracking-wider">{title}</span>
        {expanded ? <ChevronDown className="h-3 w-3 text-[#64748b]" /> : <ChevronRight className="h-3 w-3 text-[#64748b]" />}
      </button>
      {expanded && (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="glass-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium">{item.line_item}</p>
                  <p className="text-[#64748b] text-[10px] mt-0.5">{item.source}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[#d4af37] font-bold text-sm font-mono">{item.budget_2026_fmt}</p>
                </div>
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

              {item.notes && (
                <p className="text-[#64748b] text-[10px] mt-1 italic">{item.notes}</p>
              )}

              {/* AI button */}
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
      )}
    </div>
  );
}
