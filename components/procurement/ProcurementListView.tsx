'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronUp, ChevronDown, Repeat, AlertTriangle, HelpCircle, Award } from 'lucide-react';
import {
  METHOD_CONFIG,
  TENDER_STAGES,
  type Tender,
  type TenderStage,
} from '@/lib/tender/types';
import { AgencyBadge } from './AgencyBadge';
import { ProcurementStageBadge } from './ProcurementStageBadge';
import { DaysAtStageIndicator } from './DaysAtStageIndicator';
import { fmtRelativeTime } from '@/lib/format';

type SortField = 'description' | 'agency' | 'stage' | 'days_at_current_stage' | 'updated_at';
type SortDir = 'asc' | 'desc';

const STAGE_ORDER = Object.fromEntries(TENDER_STAGES.map((s, i) => [s, i])) as Record<TenderStage, number>;
const PAGE_SIZE = 20;
const GRID_COLS = 'grid-cols-[1fr_130px_110px_110px_80px_100px_90px]';

function sortList(tenders: Tender[], field: SortField, dir: SortDir): Tender[] {
  return [...tenders].sort((a, b) => {
    let cmp = 0;
    switch (field) {
      case 'description': cmp = a.description.localeCompare(b.description); break;
      case 'agency': cmp = a.agency.localeCompare(b.agency); break;
      case 'stage': cmp = STAGE_ORDER[a.stage] - STAGE_ORDER[b.stage]; break;
      case 'days_at_current_stage': {
        // Null (no SLA-relevant date) sorts last in desc, first in asc — treat as -Infinity.
        const av = a.days_at_current_stage ?? -Infinity;
        const bv = b.days_at_current_stage ?? -Infinity;
        cmp = av - bv;
        break;
      }
      case 'updated_at': cmp = a.updated_at.localeCompare(b.updated_at); break;
    }
    return dir === 'asc' ? cmp : -cmp;
  });
}

function SortIcon({ field, current, dir }: { field: SortField; current: SortField; dir: SortDir }) {
  if (field !== current) return null;
  return dir === 'asc'
    ? <ChevronUp className="h-3 w-3 text-gold-500" />
    : <ChevronDown className="h-3 w-3 text-gold-500" />;
}

interface ProcurementListViewProps {
  tenders: Tender[];
  onSelect: (id: string) => void;
}

export function ProcurementListView({ tenders, onSelect }: ProcurementListViewProps) {
  const [sortField, setSortField] = useState<SortField>('days_at_current_stage');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [tenders]);

  const sorted = useMemo(() => sortList(tenders, sortField, sortDir), [tenders, sortField, sortDir]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const effectivePage = Math.min(page, totalPages);
  const paginated = sorted.slice((effectivePage - 1) * PAGE_SIZE, effectivePage * PAGE_SIZE);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
    setPage(1);
  };

  const thClass = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none transition-colors text-navy-600 hover:text-slate-300';

  return (
    <div
      className="rounded-xl border border-navy-800 overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(26, 39, 68, 0.7) 0%, rgba(10, 22, 40, 0.85) 100%)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div className="h-[2px]" style={{ background: 'linear-gradient(90deg, transparent 0%, #d4af37 30%, #c9a84c 70%, transparent 100%)' }} />

      <div className={`hidden md:grid ${GRID_COLS} border-b border-navy-800/70`} style={{ background: 'linear-gradient(135deg, rgba(26, 39, 68, 0.95) 0%, rgba(20, 32, 56, 0.95) 100%)' }}>
        <div className={thClass} onClick={() => handleSort('description')}>
          <span className="flex items-center gap-1">Tender <SortIcon field="description" current={sortField} dir={sortDir} /></span>
        </div>
        <div className={`${thClass} !cursor-default`}>Activity</div>
        <div className={thClass} onClick={() => handleSort('agency')}>
          <span className="flex items-center gap-1">Agency <SortIcon field="agency" current={sortField} dir={sortDir} /></span>
        </div>
        <div className={thClass} onClick={() => handleSort('stage')}>
          <span className="flex items-center gap-1">Stage <SortIcon field="stage" current={sortField} dir={sortDir} /></span>
        </div>
        <div className={thClass} onClick={() => handleSort('days_at_current_stage')}>
          <span className="flex items-center gap-1">Days <SortIcon field="days_at_current_stage" current={sortField} dir={sortDir} /></span>
        </div>
        <div className={`${thClass} !cursor-default`}>Flags</div>
        <div className={thClass} onClick={() => handleSort('updated_at')}>
          <span className="flex items-center gap-1">Updated <SortIcon field="updated_at" current={sortField} dir={sortDir} /></span>
        </div>
      </div>

      <div className="divide-y divide-navy-800/30">
        {paginated.map((t, index) => (
          <div
            key={t.id}
            className={`group cursor-pointer transition-all duration-200 hover:bg-white/[0.03] border-l-2 border-l-transparent hover:border-l-gold-500 ${index % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
            onClick={() => onSelect(t.id)}
            style={{ animation: 'fadeIn 0.3s ease both', animationDelay: `${Math.min(index * 20, 400)}ms` }}
          >
            <div className={`hidden md:grid ${GRID_COLS} items-center`} style={{ minHeight: 44 }}>
              <div className="px-3 py-2.5">
                <span className="text-sm text-white font-medium line-clamp-1 group-hover:text-gold-400 transition-colors">{t.description}</span>
                {t.method && <span className="text-[11px] text-navy-600 mt-0.5 block">{METHOD_CONFIG[t.method].label}</span>}
              </div>
              <div className="px-3 py-2.5">
                <span className="text-xs text-slate-400 line-clamp-1" title={t.programme_activity || ''}>
                  {t.programme_activity || <span className="text-[#3d4a62]">—</span>}
                </span>
              </div>
              <div className="px-3 py-2.5"><AgencyBadge agency={t.agency} /></div>
              <div className="px-3 py-2.5"><ProcurementStageBadge stage={t.stage} size="sm" /></div>
              <div className="px-3 py-2.5"><DaysAtStageIndicator days={t.days_at_current_stage} /></div>
              <div className="px-3 py-2.5">
                <div className="flex items-center gap-1">
                  {t.is_rollover && <span title="Rollover from prior fiscal year"><Repeat className="h-3 w-3 text-amber-400" /></span>}
                  {t.has_exception && <span title="See Remarks for non-standard state"><AlertTriangle className="h-3 w-3 text-orange-400" /></span>}
                  {t.stage_source === 'inferred_from_dates' && (
                    <span title="Stage inferred from dates (status col was blank / flag)"><HelpCircle className="h-3 w-3 text-sky-400" /></span>
                  )}
                  {t.first_appearance_already_awarded && (
                    <span title="First appeared already awarded — true transition date unknown"><Award className="h-3 w-3 text-emerald-400" /></span>
                  )}
                </div>
              </div>
              <div className="px-3 py-2.5"><span className="text-[11px] text-navy-600">{fmtRelativeTime(t.updated_at)}</span></div>
            </div>

            <div className="flex md:hidden items-center gap-3 px-3 py-2.5" style={{ minHeight: 48 }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate group-hover:text-gold-400 transition-colors">{t.description}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <AgencyBadge agency={t.agency} />
                  <ProcurementStageBadge stage={t.stage} size="sm" />
                  <DaysAtStageIndicator days={t.days_at_current_stage} />
                  {t.is_rollover && <Repeat className="h-3 w-3 text-amber-400" />}
                  {t.has_exception && <AlertTriangle className="h-3 w-3 text-orange-400" />}
                  {t.stage_source === 'inferred_from_dates' && <HelpCircle className="h-3 w-3 text-sky-400" />}
                  {t.first_appearance_already_awarded && <Award className="h-3 w-3 text-emerald-400" />}
                </div>
              </div>
            </div>
          </div>
        ))}

        {paginated.length === 0 && (
          <div className="flex items-center justify-center h-32 text-navy-600 text-sm">No tenders match your filters</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between px-3 md:px-4 py-3 border-t border-navy-800/50 gap-2">
          <span className="text-navy-600 text-xs">
            {(effectivePage - 1) * PAGE_SIZE + 1}–{Math.min(effectivePage * PAGE_SIZE, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(effectivePage - 1)} disabled={effectivePage <= 1} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors disabled:opacity-30 disabled:pointer-events-none">Prev</button>
            <span className="px-2.5 py-1.5 text-xs text-navy-600">{effectivePage} / {totalPages}</span>
            <button onClick={() => setPage(effectivePage + 1)} disabled={effectivePage >= totalPages} className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-navy-800 transition-colors disabled:opacity-30 disabled:pointer-events-none">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
