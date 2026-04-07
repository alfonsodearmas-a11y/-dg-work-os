'use client';

import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { fmtCurrency, fmtDate, fmtRegion, type OversightProject } from './types';
import { ProgressBar, OversightStatusBadge } from './shared';

function ContractorCell({ contractors }: { contractors: string[] }) {
  if (!contractors || contractors.length === 0) return <span className="text-navy-600">-</span>;
  return (
    <span className="text-sm text-white">
      <span className="truncate">{contractors[0]}</span>
      {contractors.length > 1 && (
        <span className="ml-1 text-xs text-gold-500 font-medium" title={contractors.join(', ')}>
          +{contractors.length - 1}
        </span>
      )}
    </span>
  );
}

interface SortConfig {
  field: string;
  dir: 'asc' | 'desc';
}

function SortHeader({
  label,
  field,
  sort,
  onSort,
  className,
}: {
  label: string;
  field: string;
  sort: SortConfig;
  onSort: (field: string) => void;
  className?: string;
}) {
  const active = sort.field === field;
  return (
    <th
      className={`px-3 py-2.5 text-left text-xs font-medium text-navy-600 uppercase tracking-wider cursor-pointer hover:text-gold-500 select-none ${className || ''}`}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sort.dir === 'asc' ? <ChevronUp className="h-3 w-3 text-gold-500" /> : <ChevronDown className="h-3 w-3 text-gold-500" />)}
      </span>
    </th>
  );
}

export function MinistryProjectTable({
  projects,
  loading,
  sort,
  onSort,
  onSelectProject,
  page,
  totalPages,
  total,
  onPageChange,
  isMobile,
}: {
  projects: OversightProject[];
  loading: boolean;
  sort: SortConfig;
  onSort: (field: string) => void;
  onSelectProject: (p: OversightProject) => void;
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
  isMobile: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-navy-900 border border-navy-800 rounded-xl p-4 animate-pulse">
            <div className="h-4 w-3/4 bg-navy-800 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="bg-navy-900 border border-navy-800 rounded-xl p-8 text-center">
        <p className="text-navy-600 text-sm">No projects found</p>
      </div>
    );
  }

  function handleSort(field: string) {
    onSort(field);
  }

  // Mobile card layout
  if (isMobile) {
    return (
      <div className="space-y-2">
        {projects.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelectProject(p)}
            className="w-full text-left bg-navy-900 border border-navy-800 rounded-xl p-3 hover:border-gold-500/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0">
                <span className="text-xs text-gold-500 font-medium">{p.sub_agency}</span>
                <p className="text-sm text-white font-medium truncate">{p.project_name}</p>
              </div>
              <OversightStatusBadge status={p.project_status} />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>{fmtCurrency(p.contract_value_total)}</span>
              <ProgressBar pct={p.completion_percent} />
            </div>
          </button>
        ))}
        <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
      </div>
    );
  }

  // Desktop table
  return (
    <div className="space-y-2">
      <div className="bg-navy-900 border border-navy-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-navy-800">
              <tr>
                <SortHeader label="Agency" field="agency" sort={sort} onSort={handleSort} className="w-20" />
                <SortHeader label="Project Name" field="name" sort={sort} onSort={handleSort} />
                <SortHeader label="Region" field="region" sort={sort} onSort={handleSort} className="w-20" />
                <SortHeader label="Contract Value" field="value" sort={sort} onSort={handleSort} className="w-32" />
                <th className="px-3 py-2.5 text-left text-xs font-medium text-navy-600 uppercase tracking-wider">Contractor(s)</th>
                <SortHeader label="End Date" field="end_date" sort={sort} onSort={handleSort} className="w-28" />
                <SortHeader label="Status" field="status" sort={sort} onSort={handleSort} className="w-28" />
                <SortHeader label="Completion" field="completion" sort={sort} onSort={handleSort} className="w-32" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800/50">
              {projects.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onSelectProject(p)}
                  className="hover:bg-navy-950/60 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5 text-xs font-medium text-gold-500">{p.sub_agency}</td>
                  <td className="px-3 py-2.5 text-sm text-white max-w-[300px] truncate">{p.project_name}</td>
                  <td className="px-3 py-2.5 text-sm text-slate-400">{fmtRegion(p.region != null ? String(p.region) : null)}</td>
                  <td className="px-3 py-2.5 text-sm text-white font-medium">{fmtCurrency(p.contract_value_total)}</td>
                  <td className="px-3 py-2.5 max-w-[200px] truncate"><ContractorCell contractors={p.contractors || []} /></td>
                  <td className="px-3 py-2.5 text-sm text-slate-400">{fmtDate(p.project_end_date)}</td>
                  <td className="px-3 py-2.5"><OversightStatusBadge status={p.project_status} /></td>
                  <td className="px-3 py-2.5"><ProgressBar pct={p.completion_percent} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={onPageChange} />
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-navy-600 text-xs">{total} projects</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-lg hover:bg-navy-900 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-slate-400 text-xs px-2">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-lg hover:bg-navy-900 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
