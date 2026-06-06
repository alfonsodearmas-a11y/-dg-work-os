'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { Download } from 'lucide-react';
import type { DelayedProjectWithComputed, RiskTier } from '@/lib/delayed-projects/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import { RegistryFilters, DEFAULT_FILTERS, type FilterState } from './RegistryFilters';
import { RegistryTable } from './RegistryTable';
import { ProjectDetailPanel } from './ProjectDetailPanel';

interface ProjectRegistryTabProps {
  isMobile: boolean;
  onRefresh: () => void;
  onLogIntervention?: (projectId: string, projectName: string) => void;
}

export function ProjectRegistryTab({ isMobile, onRefresh, onLogIntervention }: ProjectRegistryTabProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { effectiveUser } = useEffectiveUser();

  const isAgencyUser = effectiveUser.role === 'agency_manager';
  const lockedAgency = isAgencyUser ? effectiveUser.agency?.toUpperCase() : undefined;

  // ── State ──
  const [filters, setFilters] = useState<FilterState>(() => {
    const f = { ...DEFAULT_FILTERS };
    if (lockedAgency) f.sub_agencies = [lockedAgency];
    const sp = searchParams;
    if (sp.get('sub_agencies')) f.sub_agencies = sp.get('sub_agencies')!.split(',').filter(Boolean);
    if (sp.get('regions')) f.regions = sp.get('regions')!.split(',').filter(Boolean);
    if (sp.get('risk_tiers')) f.risk_tiers = sp.get('risk_tiers')!.split(',').filter(Boolean) as RiskTier[];
    if (sp.get('search')) f.search = sp.get('search')!;
    return f;
  });

  const [sort, setSort] = useState({ field: searchParams.get('sort') || 'risk', dir: (searchParams.get('sort_dir') || 'asc') as 'asc' | 'desc' });
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [projects, setProjects] = useState<DelayedProjectWithComputed[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // URL is the source of truth — the drawer opens iff ?project=<id> is present.
  const selectedProjectId = searchParams.get('project');

  const setProjectParam = useCallback(
    (projectId: string | null) => {
      const next = new URLSearchParams(Array.from(searchParams.entries()));
      if (projectId) next.set('project', projectId);
      else next.delete('project');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const limit = 25;
  const totalPages = Math.ceil(total / limit);

  // ── Fetch ──
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (filters.sub_agencies.length) p.set('sub_agencies', filters.sub_agencies.join(','));
      if (filters.regions.length) p.set('regions', filters.regions.join(','));
      if (filters.risk_tiers.length) p.set('risk_tiers', filters.risk_tiers.join(','));
      if (filters.search) p.set('search', filters.search);
      p.set('sort', sort.field);
      p.set('sort_dir', sort.dir);
      p.set('page', String(page));
      p.set('limit', String(limit));

      const res = await fetch(`/api/delayed-projects?${p}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [filters, sort, page]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function handleSort(field: string) {
    setSort((prev) => ({
      field,
      dir: prev.field === field && prev.dir === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }

  function updateFilters(partial: Partial<FilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(lockedAgency ? { ...DEFAULT_FILTERS, sub_agencies: [lockedAgency] } : DEFAULT_FILTERS);
  }

  async function handleExport() {
    try {
      const body: Record<string, string> = {};
      if (filters.sub_agencies.length) body.sub_agencies = filters.sub_agencies.join(',');
      if (filters.regions.length) body.regions = filters.regions.join(',');
      if (filters.search) body.search = filters.search;
      body.sort = sort.field;
      body.sort_dir = sort.dir;

      const res = await fetch('/api/delayed-projects/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `delayed-projects-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <RegistryFilters filters={filters} onChange={updateFilters} onClear={clearFilters} />

      {/* Count + Export */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-navy-600">{total} projects</span>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 text-xs text-navy-600 hover:text-gold-500 transition-colors"
        >
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Table */}
      <RegistryTable
        projects={projects}
        loading={loading}
        sort={sort}
        onSort={handleSort}
        onSelectProject={(p) => setProjectParam(p.id)}
        onLogIntervention={onLogIntervention ? (p) => onLogIntervention(p.id, getShortName(p.project_name)) : undefined}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        isMobile={isMobile}
      />

      {/* Detail Panel */}
      <ProjectDetailPanel
        projectId={selectedProjectId}
        onClose={() => setProjectParam(null)}
      />
    </div>
  );
}
