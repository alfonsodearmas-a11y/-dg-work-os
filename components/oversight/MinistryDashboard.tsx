'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { OversightProject, OversightSummary } from './types';
import { MinistrySummary } from './MinistrySummary';
import { MinistryFilters, type MinistryFilterState } from './MinistryFilters';
import { MinistryProjectTable } from './MinistryProjectTable';
import { MinistryProjectDetail } from './MinistryProjectDetail';

const DEFAULT_FILTERS: MinistryFilterState = {
  sub_agencies: [],
  statuses: [],
  regions: [],
  completion_min: '',
  completion_max: '',
  search: '',
  sort: 'value',
  sort_dir: 'desc',
};

export function MinistryDashboard() {
  const { effectiveUser } = useEffectiveUser();
  const isMobile = useIsMobile();

  const isAgencyUser = effectiveUser.role === 'agency_admin' || effectiveUser.role === 'officer';
  const lockedAgency = isAgencyUser ? effectiveUser.agency?.toUpperCase() : undefined;

  const [summary, setSummary] = useState<OversightSummary | null>(null);
  const [projects, setProjects] = useState<OversightProject[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [selectedProject, setSelectedProject] = useState<OversightProject | null>(null);
  const [page, setPage] = useState(1);
  const limit = 25;

  const [filters, setFilters] = useState<MinistryFilterState>(() => {
    if (lockedAgency) return { ...DEFAULT_FILTERS, sub_agencies: [lockedAgency] };
    return DEFAULT_FILTERS;
  });

  function updateFilters(partial: Partial<MinistryFilterState>) {
    setFilters((prev) => ({ ...prev, ...partial }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(lockedAgency ? { ...DEFAULT_FILTERS, sub_agencies: [lockedAgency] } : DEFAULT_FILTERS);
    setPage(1);
  }

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    if (filters.sub_agencies.length) p.set('sub_agencies', filters.sub_agencies.join(','));
    if (filters.statuses.length) p.set('statuses', filters.statuses.join(','));
    if (filters.regions.length) p.set('regions', filters.regions.join(','));
    if (filters.completion_min) p.set('completion_min', filters.completion_min);
    if (filters.completion_max) p.set('completion_max', filters.completion_max);
    if (filters.search) p.set('search', filters.search);
    if (filters.sort) p.set('sort', filters.sort);
    if (filters.sort_dir) p.set('sort_dir', filters.sort_dir);
    p.set('page', String(page));
    p.set('limit', String(limit));
    return p;
  }, [filters, page]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/oversight/projects/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {}
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const res = await fetch(`/api/oversight/projects?${buildParams()}`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoadingProjects(false);
  }, [buildParams]);

  // Fetch summary once on mount
  useEffect(() => {
    fetchSummary().finally(() => setLoading(false));
  }, [fetchSummary]);

  // Fetch projects when filters/page change (includes initial mount)
  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  function handleSort(field: string) {
    setFilters((prev) => ({
      ...prev,
      sort: field,
      sort_dir: prev.sort === field && prev.sort_dir === 'desc' ? 'asc' : 'desc',
    }));
    setPage(1);
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <MinistrySummary summary={summary} loading={loading} />

      <MinistryFilters
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        lockedAgency={lockedAgency ?? undefined}
      />

      {/* Project count */}
      <div className="flex items-center justify-between">
        <span className="text-navy-600 text-xs">{total} projects</span>
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
