'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  Eye, RefreshCw, AlertTriangle,
  Building2, ChevronDown,
  Filter, X,
  List, GanttChart,
  Download, UserPlus,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { OversightData, Project, PortfolioSummary, SavedFilter, ViewMode, TabMode } from '@/components/oversight/types';
import { HEALTH_OPTIONS } from '@/components/oversight/types';
import { SaveFilterModal, OversightFilterPanel } from '@/components/oversight/OversightFilters';
import { ProjectSlidePanel, OversightProjectTable } from '@/components/oversight/OversightTable';
import { TimelineView } from '@/components/oversight/TimelineView';
import { PortfolioSummarySection } from '@/components/oversight/PortfolioSummary';
import { AlertsTabContent } from '@/components/oversight/AlertsTab';

// ── Bulk Action Bar ────────────────────────────────────────────────────────

function BulkActionBar({ count, onUpdateHealth, onAssignOfficer, onExport, onClear, officers }: {
  count: number; onUpdateHealth: (h: string) => void; onAssignOfficer: (userId: string | null) => void; onExport: () => void; onClear: () => void; officers: { id: string; name: string }[];
}) {
  const [showHealth, setShowHealth] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  function closeAll() { setShowHealth(false); setShowAssign(false); }
  return (
    <div className="fixed bottom-0 left-0 right-0 md:bottom-4 md:left-1/2 md:right-auto md:-translate-x-1/2 z-40 bg-[#1a2744] border-t md:border border-[#d4af37]/40 md:rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-2 md:gap-3 flex-wrap justify-center">
      <span className="text-[#d4af37] font-semibold text-sm">{count} selected</span>
      <div className="relative">
        <button onClick={() => { closeAll(); setShowHealth(!showHealth); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">Health <ChevronDown className="h-3 w-3" /></button>
        {showHealth && <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[140px]">
          {HEALTH_OPTIONS.map(h => <button key={h.value} onClick={() => { onUpdateHealth(h.value); closeAll(); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60"><span className={`w-2 h-2 rounded-full ${h.color}`} aria-hidden="true" />{h.label}</button>)}
        </div>}
      </div>
      <div className="relative">
        <button onClick={() => { closeAll(); setShowAssign(!showAssign); }} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1"><UserPlus className="h-3 w-3" /> Assign <ChevronDown className="h-3 w-3" /></button>
        {showAssign && <div className="absolute bottom-full left-0 mb-2 bg-[#1a2744] border border-[#2d3a52] rounded-lg shadow-xl min-w-[180px] max-h-[200px] overflow-y-auto">
          <button onClick={() => { onAssignOfficer(null); closeAll(); }} className="block w-full text-left px-3 py-2 text-sm text-[#64748b] hover:bg-[#0a1628]/60 italic">Unassign</button>
          {officers.map(o => <button key={o.id} onClick={() => { onAssignOfficer(o.id); closeAll(); }} className="block w-full text-left px-3 py-2 text-sm text-white hover:bg-[#0a1628]/60">{o.name}</button>)}
        </div>}
      </div>
      <button onClick={onExport} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1"><Download className="h-3 w-3" aria-hidden="true" /> CSV</button>
      <button onClick={onClear} className="text-[#64748b] hover:text-white" aria-label="Clear selection"><X className="h-4 w-4" /></button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════════════════

export default function OversightPage() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const userRole = session?.user?.role || 'officer';

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<TabMode>(() => (searchParams.get('tab') as TabMode) || 'alerts');

  // ── Scraped oversight data ──
  const [oversightData, setOversightData] = useState<OversightData | null>(null);
  const [oversightLoading, setOversightLoading] = useState(true);
  const [oversightError, setOversightError] = useState<string | null>(null);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);

  const projectsByAgency = useMemo(() => {
    if (!oversightData) return {};
    const map: Record<string, { project: any; tag: string }[]> = {};
    const seen = new Set<string>();
    function addProjects(arr: any[], tag: string) {
      for (const p of arr) {
        const agency = p.agency || p.subAgency || '-';
        const key = `${agency}-${p.name || p.projectName || ''}-${p.id || p.p3Id || ''}`;
        if (seen.has(key)) continue; seen.add(key);
        if (!map[agency]) map[agency] = [];
        map[agency].push({ project: p, tag });
      }
    }
    addProjects(oversightData.overdue, 'overdue');
    addProjects(oversightData.atRisk, 'at-risk');
    addProjects(oversightData.endingSoon, 'ending-soon');
    addProjects(oversightData.delayed, 'delayed');
    addProjects(oversightData.bondWarnings, 'bond-warning');
    return map;
  }, [oversightData]);

  const fetchOversight = useCallback(async () => {
    setOversightLoading(true); setOversightError(null);
    try { const res = await fetch('/api/oversight'); const json = await res.json(); if (!json.success) throw new Error(json.error); setOversightData(json.data); }
    catch (err: any) { setOversightError(err.message); }
    finally { setOversightLoading(false); }
  }, []);

  // ── PSIP project data ──
  const [psipSummary, setPsipSummary] = useState<PortfolioSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [psipLoading, setPsipLoading] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [contractors, setContractors] = useState<string[]>([]);
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [officers, setOfficers] = useState<{ id: string; name: string }[]>([]);

  // UI
  const [showFilters, setShowFilters] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showSaveFilter, setShowSaveFilter] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [timelineGroupBy, setTimelineGroupBy] = useState<'agency' | 'region'>('agency');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Filters
  const [agencies, setAgencies] = useState<string[]>(() => searchParams.get('agencies')?.split(',').filter(Boolean) || []);
  const [statuses, setStatuses] = useState<string[]>(() => searchParams.get('statuses')?.split(',').filter(Boolean) || []);
  const [regions, setRegions] = useState<string[]>(() => searchParams.get('regions')?.split(',').filter(Boolean) || []);
  const [healths, setHealths] = useState<string[]>(() => searchParams.get('healths')?.split(',').filter(Boolean) || []);
  const [budgetMin, setBudgetMin] = useState(searchParams.get('budgetMin') || '');
  const [budgetMax, setBudgetMax] = useState(searchParams.get('budgetMax') || '');
  const [contractor, setContractor] = useState(searchParams.get('contractor') || '');
  const [dateField, setDateField] = useState(searchParams.get('dateField') || 'project_end_date');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
  const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'value');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const limit = 25;

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.set('tab', activeTab);
    if (agencies.length) p.set('agencies', agencies.join(','));
    if (statuses.length) p.set('statuses', statuses.join(','));
    if (regions.length) p.set('regions', regions.join(','));
    if (healths.length) p.set('healths', healths.join(','));
    if (budgetMin) p.set('budgetMin', budgetMin);
    if (budgetMax) p.set('budgetMax', budgetMax);
    if (contractor) p.set('contractor', contractor);
    if (dateField !== 'project_end_date') p.set('dateField', dateField);
    if (dateFrom) p.set('dateFrom', dateFrom);
    if (dateTo) p.set('dateTo', dateTo);
    if (search) p.set('search', search);
    if (sort !== 'value') p.set('sort', sort);
    if (page > 1) p.set('page', String(page));
    return p;
  }, [activeTab, agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort, page]);

  // Sync URL
  useEffect(() => {
    const str = buildParams().toString();
    if (str !== searchParams.toString()) router.replace(`/oversight?${str}`, { scroll: false });
  }, [buildParams]);

  // Fetch PSIP summary
  const fetchPsipSummary = useCallback(async () => {
    try {
      const params = buildParams(); params.delete('page'); params.delete('sort'); params.delete('tab');
      const res = await fetch(`/api/projects/summary?${params}`);
      const d = await res.json();
      if (d.total_projects !== undefined) setPsipSummary(d);
    } catch {}
  }, [buildParams]);

  // Fetch PSIP projects
  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const params = buildParams(); params.set('page', String(page)); params.set('limit', String(limit)); params.delete('tab');
      const res = await fetch(`/api/projects/list?${params}`);
      const d = await res.json();
      setProjects(d.projects || []); setTotalCount(d.total || 0);
    } catch {}
    setLoadingProjects(false);
  }, [buildParams, page]);

  // Initial load
  useEffect(() => {
    fetchOversight();
    setPsipLoading(true);
    Promise.all([fetchPsipSummary(), fetchProjects()]).finally(() => setPsipLoading(false));
    fetch('/api/projects/contractors').then(r => r.json()).then(d => { if (Array.isArray(d)) setContractors(d); }).catch(() => {});
    fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }).catch(() => {});
    fetch('/api/admin/users').then(r => r.ok ? r.json() : null).then(d => { const users = d?.users; if (Array.isArray(users)) setOfficers(users.filter((u: any) => u.is_active).map((u: any) => ({ id: u.id, name: u.name || u.email }))); }).catch(() => {});
  }, []);

  useEffect(() => { if (activeTab === 'projects') fetchProjects(); }, [fetchProjects, activeTab]);
  useEffect(() => { if (activeTab === 'projects') fetchPsipSummary(); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search, activeTab]);
  useEffect(() => { setPage(1); }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, dateField, dateFrom, dateTo, search, sort]);

  function clearFilters() {
    setAgencies([]); setStatuses([]); setRegions([]); setHealths([]);
    setBudgetMin(''); setBudgetMax(''); setContractor('');
    setDateField('project_end_date'); setDateFrom(''); setDateTo('');
    setSearch(''); setSort('value');
  }

  function handleRefresh() {
    fetchOversight();
    setPsipLoading(true);
    // Recalculate health for all projects, then refresh data
    fetch('/api/projects/recalculate-health', { method: 'POST' })
      .catch(() => {}) // non-blocking — recalc writes to DB for filter accuracy
      .finally(() => {
        Promise.all([fetchPsipSummary(), fetchProjects()]).finally(() => setPsipLoading(false));
      });
  }

  const hasActiveFilters = !!(agencies.length || statuses.length || regions.length || healths.length || budgetMin || budgetMax || contractor || dateFrom || dateTo || search);
  const activeFilterCount = [agencies.length > 0, statuses.length > 0, regions.length > 0, healths.length > 0, budgetMin || budgetMax, contractor, dateFrom || dateTo, search].filter(Boolean).length;
  const totalPages = Math.ceil(totalCount / limit);

  function toggleSelect(id: string) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleSelectAll() { setSelectedIds(selectedIds.size === projects.length ? new Set() : new Set(projects.map(p => p.id))); }

  async function handleBulkUpdate(updates: Record<string, any>) {
    try {
      const res = await fetch('/api/projects/bulk', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_ids: Array.from(selectedIds), ...updates }) });
      if (!res.ok) { const d = await res.json(); alert(d.error || 'Update failed'); return; }
      setSelectedIds(new Set()); handleRefresh();
    } catch { alert('Update failed'); }
  }

  async function handleExport() {
    try {
      const res = await fetch('/api/projects/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_ids: Array.from(selectedIds) }) });
      if (!res.ok) { alert('Export failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `projects-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  }

  function applySavedFilter(sf: SavedFilter) {
    const fp = sf.filter_params;
    if (fp.agencies) setAgencies(fp.agencies); if (fp.statuses) setStatuses(fp.statuses);
    if (fp.regions) setRegions(fp.regions); if (fp.healths) setHealths(fp.healths);
    if (fp.budgetMin) setBudgetMin(fp.budgetMin); if (fp.budgetMax) setBudgetMax(fp.budgetMax);
    if (fp.contractor) setContractor(fp.contractor); if (fp.search) setSearch(fp.search);
    if (fp.sort) setSort(fp.sort);
  }

  async function deleteSavedFilter(id: string) {
    try { await fetch('/api/projects/filters', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }); setSavedFilters(prev => prev.filter(f => f.id !== id)); } catch {}
  }

  const currentFilterParams = useMemo(() => {
    const fp: Record<string, any> = {};
    if (agencies.length) fp.agencies = agencies; if (statuses.length) fp.statuses = statuses;
    if (regions.length) fp.regions = regions; if (healths.length) fp.healths = healths;
    if (budgetMin) fp.budgetMin = budgetMin; if (budgetMax) fp.budgetMax = budgetMax;
    if (contractor) fp.contractor = contractor; if (search) fp.search = search;
    if (sort !== 'value') fp.sort = sort;
    return fp;
  }, [agencies, statuses, regions, healths, budgetMin, budgetMax, contractor, search, sort]);

  // ── Render ──

  return (
    <div className="space-y-6">
      {/* Modals */}
      {showSaveFilter && <SaveFilterModal filterParams={currentFilterParams} onClose={() => setShowSaveFilter(false)} onSaved={() => { setShowSaveFilter(false); fetch('/api/projects/filters').then(r => r.json()).then(d => { if (Array.isArray(d)) setSavedFilters(d); }); }} />}
      {selectedProject && <ProjectSlidePanel project={selectedProject} onClose={() => setSelectedProject(null)} userRole={userRole} onRefreshList={() => { setSelectedProject(null); handleRefresh(); }} />}

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-white">Oversight Dashboard</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">Project monitoring &amp; intelligence</p>
          </div>
        </div>
        <button onClick={handleRefresh} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] hover:text-white transition-colors shrink-0" aria-label="Refresh">
          <RefreshCw className={`h-4 w-4 ${oversightLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span className="hidden md:inline text-sm">Refresh</span>
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 bg-[#1a2744] border border-[#2d3a52] rounded-xl p-1">
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'alerts' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
        >
          <AlertTriangle className="h-4 w-4 inline mr-2" />Alerts &amp; Flags
          {oversightData && <span className="ml-2 bg-[#2d3a52] text-[#94a3b8] text-xs px-1.5 py-0.5 rounded-full">{oversightData.summary.overdue + oversightData.summary.atRisk + oversightData.summary.delayed}</span>}
        </button>
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'projects' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
        >
          <Building2 className="h-4 w-4 inline mr-2" />Projects &amp; Filters
          {psipSummary && <span className="ml-2 bg-[#2d3a52] text-[#94a3b8] text-xs px-1.5 py-0.5 rounded-full">{psipSummary.total_projects}</span>}
        </button>
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: ALERTS & FLAGS (existing scraped oversight data) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'alerts' && (
        <AlertsTabContent
          oversightData={oversightData}
          oversightLoading={oversightLoading}
          oversightError={oversightError}
          expandedAgency={expandedAgency}
          onExpandedAgencyChange={setExpandedAgency}
          projectsByAgency={projectsByAgency}
          onSelectProject={setSelectedProject}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: PROJECTS & FILTERS (PSIP data from Supabase) */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'projects' && (
        <>
          <PortfolioSummarySection summary={psipSummary} />

          {/* Filter Panel */}
          <OversightFilterPanel
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            agencies={agencies}
            onAgenciesChange={setAgencies}
            statuses={statuses}
            onStatusesChange={setStatuses}
            regions={regions}
            onRegionsChange={setRegions}
            healths={healths}
            onHealthsChange={setHealths}
            budgetMin={budgetMin}
            onBudgetMinChange={setBudgetMin}
            budgetMax={budgetMax}
            onBudgetMaxChange={setBudgetMax}
            contractor={contractor}
            onContractorChange={setContractor}
            contractors={contractors}
            dateField={dateField}
            onDateFieldChange={setDateField}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            search={search}
            onSearchChange={setSearch}
            sort={sort}
            onSortChange={setSort}
            savedFilters={savedFilters}
            onApplySavedFilter={applySavedFilter}
            onDeleteSavedFilter={deleteSavedFilter}
            onClearFilters={clearFilters}
            onShowSaveFilter={() => setShowSaveFilter(true)}
            activeFilterCount={activeFilterCount}
            hasActiveFilters={hasActiveFilters}
          />

          {/* Project count + View Toggle */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {hasActiveFilters ? (
                <div className="inline-flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1.5 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/30 text-xs md:text-sm min-w-0">
                  <Filter className="h-3.5 w-3.5 text-[#d4af37] shrink-0" />
                  <span className="text-[#d4af37] truncate">{psipSummary?.total_projects || totalCount} projects</span>
                  <button onClick={clearFilters} className="text-[#d4af37]/60 hover:text-[#d4af37] shrink-0" aria-label="Clear filters"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : psipSummary && <span className="text-[#64748b] text-xs md:text-sm">{psipSummary.total_projects} projects</span>}
            </div>
            <div className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg p-0.5">
              <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}><List className="h-3.5 w-3.5 inline mr-1" />List</button>
              <button onClick={() => setViewMode('timeline')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${viewMode === 'timeline' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}><GanttChart className="h-3.5 w-3.5 inline mr-1" />Timeline</button>
              {viewMode === 'timeline' && <select value={timelineGroupBy} onChange={e => setTimelineGroupBy(e.target.value as 'agency' | 'region')} aria-label="Group timeline by" className="bg-transparent text-xs text-[#94a3b8] ml-2 focus:outline-none"><option value="agency">By Agency</option><option value="region">By Region</option></select>}
            </div>
          </div>

          {/* Project View */}
          {viewMode === 'timeline' ? <TimelineView projects={projects} groupBy={timelineGroupBy} /> : (
            <OversightProjectTable
              projects={projects}
              loadingProjects={loadingProjects}
              isMobile={isMobile}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onSelectProject={setSelectedProject}
              page={page}
              totalPages={totalPages}
              totalCount={totalCount}
              limit={limit}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && <BulkActionBar count={selectedIds.size} onUpdateHealth={h => handleBulkUpdate({ health: h })} onAssignOfficer={userId => handleBulkUpdate({ assigned_to: userId })} onExport={handleExport} onClear={() => setSelectedIds(new Set())} officers={officers} />}
    </div>
  );
}
