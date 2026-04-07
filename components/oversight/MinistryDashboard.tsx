'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { OversightProject, DelayedSummary } from './types';
import { MinistrySummary } from './MinistrySummary';
import { MinistryFilters, DEFAULT_FILTERS, type MinistryFilterState } from './MinistryFilters';
import { MinistryProjectTable } from './MinistryProjectTable';
import { MinistryProjectDetail } from './MinistryProjectDetail';

export function MinistryDashboard() {
  const { effectiveUser } = useEffectiveUser();
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();

  const isAgencyUser = effectiveUser.role === 'agency_admin' || effectiveUser.role === 'officer';
  const lockedAgency = isAgencyUser ? effectiveUser.agency?.toUpperCase() : undefined;

  // Initialize from URL
  const [filters, setFilters] = useState<MinistryFilterState>(() => {
    const f = { ...DEFAULT_FILTERS };
    if (lockedAgency) f.sub_agencies = [lockedAgency];
    const sp = searchParams;
    if (sp.get('sub_agencies')) f.sub_agencies = sp.get('sub_agencies')!.split(',').filter(Boolean);
    if (sp.get('regions')) f.regions = sp.get('regions')!.split(',').filter(Boolean);
    if (sp.get('completion_min')) f.completion_min = sp.get('completion_min')!;
    if (sp.get('completion_max')) f.completion_max = sp.get('completion_max')!;
    if (sp.get('end_date_from')) f.end_date_from = sp.get('end_date_from')!;
    if (sp.get('end_date_to')) f.end_date_to = sp.get('end_date_to')!;
    if (sp.get('contractor_search')) f.contractor_search = sp.get('contractor_search')!;
    if (sp.get('search')) f.search = sp.get('search')!;
    if (sp.get('sort')) f.sort = sp.get('sort')!;
    if (sp.get('sort_dir')) f.sort_dir = sp.get('sort_dir') as 'asc' | 'desc';
    return f;
  });

  const [summary, setSummary] = useState<DelayedSummary | null>(null);
  const [projects, setProjects] = useState<OversightProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<OversightProject | null>(null);
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const limit = 25;

  function updateFilters(partial: Partial<MinistryFilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(lockedAgency ? { ...DEFAULT_FILTERS, sub_agencies: [lockedAgency] } : DEFAULT_FILTERS);
    setPage(1);
  }

  // Shared filter → URLSearchParams builder
  const appendFilterParams = useCallback((p: URLSearchParams) => {
    if (filters.sub_agencies.length) p.set('sub_agencies', filters.sub_agencies.join(','));
    if (filters.regions.length) p.set('regions', filters.regions.join(','));
    if (filters.completion_min) p.set('completion_min', filters.completion_min);
    if (filters.completion_max) p.set('completion_max', filters.completion_max);
    if (filters.end_date_from) p.set('end_date_from', filters.end_date_from);
    if (filters.end_date_to) p.set('end_date_to', filters.end_date_to);
    if (filters.contractor_search) p.set('contractor_search', filters.contractor_search);
    if (filters.search) p.set('search', filters.search);
  }, [filters]);

  const buildUrlParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set('tab', 'ministry');
    appendFilterParams(p);
    if (filters.sort !== 'value') p.set('sort', filters.sort);
    if (filters.sort_dir !== 'desc') p.set('sort_dir', filters.sort_dir);
    if (page > 1) p.set('page', String(page));
    return p;
  }, [appendFilterParams, filters.sort, filters.sort_dir, page]);

  // Sync filters to URL
  useEffect(() => {
    const str = buildUrlParams().toString();
    if (str !== searchParams.toString()) {
      router.replace(`/oversight?${str}`, { scroll: false });
    }
  }, [buildUrlParams, router, searchParams]);

  const buildApiParams = useCallback(() => {
    const p = new URLSearchParams();
    appendFilterParams(p);
    if (filters.sort) p.set('sort', filters.sort);
    if (filters.sort_dir) p.set('sort_dir', filters.sort_dir);
    p.set('page', String(page));
    p.set('limit', String(limit));
    return p;
  }, [appendFilterParams, filters.sort, filters.sort_dir, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/oversight/projects/summary');
      if (res.ok) setSummary(await res.json());
    } catch {}
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`/api/oversight/projects?${buildApiParams()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoadingProjects(false);
  }, [buildApiParams]);

  // Initial load
  useEffect(() => {
    fetchSummary().finally(() => setLoading(false));
  }, [fetchSummary]);

  // Fetch projects on filter/page change
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleSort = useCallback((field: string) => {
    setFilters((prev) => ({
      ...prev,
      sort: field,
      sort_dir: prev.sort === field && prev.sort_dir === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const params = buildApiParams();
      params.delete('page');
      params.delete('limit');
      const res = await fetch('/api/oversight/projects/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(params)),
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
  }, [buildApiParams]);

  const totalPages = useMemo(() => Math.ceil(total / limit), [total]);

  return (
    <div className="space-y-4 md:space-y-5">
      <MinistrySummary summary={summary} loading={loading} isMobile={isMobile} />

      <MinistryFilters
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        onExport={handleExport}
        lockedAgency={lockedAgency}
      />

      <div className="flex items-center justify-between">
        <span className="text-navy-600 text-xs">{total} delayed projects</span>
      </div>

      <MinistryProjectTable
        projects={projects}
        loading={loadingProjects}
        sort={{ field: filters.sort, dir: filters.sort_dir }}
        onSort={handleSort}
        onSelectProject={setSelectedProject}
        page={page}
        totalPages={totalPages}
        total={total}
        onPageChange={setPage}
        isMobile={isMobile}
      />

      <MinistryProjectDetail
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
      />
    </div>
  );
}
