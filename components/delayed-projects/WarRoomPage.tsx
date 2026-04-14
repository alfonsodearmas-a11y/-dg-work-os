'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { useIsMobile } from '@/hooks/useIsMobile';
import {
  Eye, RefreshCw, Upload, AlertTriangle,
  DollarSign, TrendingUp, Clock, Users, Gauge,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { fmtCurrency } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import type { WarRoomSummary, InterventionSummary, DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { HoverPreview } from '@/components/ui/HoverPreview';
import { WarRoomKpiCard, AgencyBadge } from './shared';
import { UploadModal } from './UploadModal';
import { InterventionModal } from './InterventionModal';
import { ProjectRegistryTab } from './ProjectRegistryTab';
import { InterventionsTab } from './InterventionsTab';
import { WeeklyMovementSummary } from './WeeklyMovementSummary';
import { ContractorConcentration } from './ContractorConcentration';
import { DataQualityFlags } from './DataQualityFlags';

export function WarRoomPage() {
  const searchParams = useSearchParams();
  const { effectiveUser } = useEffectiveUser();
  const isMobile = useIsMobile();

  const canUpload = effectiveUser.role === 'dg' || effectiveUser.role === 'ps';

  // ── State ──
  const [summary, setSummary] = useState<WarRoomSummary | null>(null);
  const [interventionSummary, setInterventionSummary] = useState<InterventionSummary | null>(null);
  const [allProjects, setAllProjects] = useState<DelayedProjectWithComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  // Shared intervention modal state
  const [interventionModal, setInterventionModal] = useState<{
    projectId: string;
    projectName: string;
  } | null>(null);

  // ── Data Fetching ──
  const fetchAll = useCallback(async () => {
    try {
      const [summaryRes, intSummaryRes, projectsRes] = await Promise.all([
        fetch('/api/delayed-projects/summary'),
        fetch('/api/delayed-projects/interventions?summary=true'),
        fetch('/api/delayed-projects?limit=500'),
      ]);
      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (intSummaryRes.ok) setInterventionSummary(await intSummaryRes.json());
      if (projectsRes.ok) {
        const data = await projectsRes.json();
        setAllProjects(data.projects || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  }, [fetchAll]);

  const handleUploaded = useCallback(() => {
    fetchAll();
  }, [fetchAll]);

  function handleLogIntervention(projectId: string, projectName: string) {
    setInterventionModal({ projectId, projectName });
  }

  function handleInterventionCreated() {
    setInterventionModal(null);
    fetchAll();
    // Notify intervention section to refetch
    window.dispatchEvent(new Event('intervention-created'));
  }

  // ── Loading State ──
  if (loading) {
    return (
      <div className="space-y-6">
        <HeaderSkeleton />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-xl border border-navy-800 p-4 bg-gradient-to-b from-[#1a2744] to-[#0f1d32] animate-pulse">
              <div className="w-9 h-9 rounded-lg bg-navy-800 mb-3" />
              <div className="h-7 w-16 bg-navy-800 rounded mb-1" />
              <div className="h-3 w-20 bg-navy-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Empty State ──
  const isEmpty = !summary || summary.total_projects === 0;

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Upload Modal */}
      <UploadModal isOpen={showUpload} onClose={() => setShowUpload(false)} onUploaded={handleUploaded} />

      {/* Shared Intervention Modal */}
      <InterventionModal
        isOpen={!!interventionModal}
        onClose={() => setInterventionModal(null)}
        onCreated={handleInterventionCreated}
        projectId={interventionModal?.projectId || ''}
        projectName={interventionModal?.projectName || ''}
      />

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center shrink-0">
            <Eye className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-serif text-white">Delayed Projects Oversight</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">
              Intervention Tracking & Risk Intelligence
              {summary?.last_upload_date && (
                <> &middot; Updated {new Date(summary.last_upload_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {canUpload && (
            <button
              onClick={() => setShowUpload(true)}
              className={`btn-gold px-3 py-2 text-sm flex items-center gap-2 ${isEmpty ? 'animate-[pulse-gold_2s_infinite]' : ''}`}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload Data</span>
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-400 hover:text-white transition-colors"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline text-sm">Refresh</span>
          </button>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <div className="py-16">
          <EmptyState
            icon={<Upload className="h-12 w-12" />}
            title="No delayed projects tracked yet"
            description={canUpload
              ? 'Upload your first spreadsheet to begin tracking delayed projects.'
              : 'Project data has not been uploaded yet. Contact the DG or PS to upload data.'
            }
            action={canUpload ? (
              <button onClick={() => setShowUpload(true)} className="btn-gold px-4 py-2 text-sm mt-4">
                <Upload className="h-4 w-4 inline mr-2" />Upload Project Data
              </button>
            ) : undefined}
          />
        </div>
      ) : (
        <>
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <WarRoomKpiCard
              label="Total Delayed"
              value={summary!.total_projects.toLocaleString()}
              icon={AlertTriangle}
              accent="text-red-400"
              bgAccent="bg-red-500/15"
            />
            <WarRoomKpiCard
              label="Total Contract Value"
              value={fmtCurrency(summary!.total_contract_value / 100)}
              icon={DollarSign}
              accent="text-gold-400"
              bgAccent="bg-gold-500/15"
            />
            <WarRoomKpiCard
              label="Unattended Projects"
              value={(interventionSummary?.projects_with_zero ?? '-').toLocaleString()}
              sub={interventionSummary && interventionSummary.projects_with_zero > 0 ? 'Zero interventions logged' : 'All projects covered'}
              icon={Users}
              accent={interventionSummary && interventionSummary.projects_with_zero > 0 ? 'text-red-400' : 'text-emerald-400'}
              bgAccent={interventionSummary && interventionSummary.projects_with_zero > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
              alert={(interventionSummary?.projects_with_zero ?? 0) > 0}
            />
            <WarRoomKpiCard
              label="Avg. Completion"
              value={`${summary!.avg_completion}%`}
              icon={TrendingUp}
              accent="text-blue-400"
              bgAccent="bg-blue-500/15"
            />
            <HoverPreview
              delay={200}
              preview={
                <div className="space-y-2">
                  <p className="text-xs text-red-400 font-semibold mb-2">HIGH Risk Projects</p>
                  {summary!.critical_projects.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <AgencyBadge agency={p.agency} />
                      <span className="text-white truncate flex-1">{getShortName(p.name)}</span>
                      <span className="text-red-400 tabular-nums">{p.days_overdue > 0 ? `${p.days_overdue}d` : '-'}</span>
                    </div>
                  ))}
                  {summary!.critical_projects.length === 0 && <p className="text-xs text-slate-500">None</p>}
                </div>
              }
            >
              <WarRoomKpiCard
                label="Critical Projects"
                value={summary!.critical_count.toLocaleString()}
                icon={Gauge}
                accent={summary!.critical_count > 0 ? 'text-red-400' : 'text-emerald-400'}
                bgAccent={summary!.critical_count > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
                alert={summary!.critical_count > 0}
              />
            </HoverPreview>
            <HoverPreview
              delay={200}
              preview={
                summary!.longest_overdue_project ? (
                  <div className="space-y-1">
                    <p className="text-xs text-amber-400 font-semibold mb-2">Most Overdue Project</p>
                    <p className="text-sm text-white font-medium">{getShortName(summary!.longest_overdue_project.name)}</p>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <AgencyBadge agency={summary!.longest_overdue_project.agency} />
                      <span>{summary!.longest_overdue_project.completion}% complete</span>
                    </div>
                  </div>
                ) : <p className="text-xs text-slate-500">No data</p>
              }
            >
              <WarRoomKpiCard
                label="Longest Overdue"
                value={summary!.longest_overdue > 0 ? `${summary!.longest_overdue}d` : '-'}
                icon={Clock}
                accent={summary!.longest_overdue > 365 ? 'text-red-400' : 'text-amber-400'}
                bgAccent={summary!.longest_overdue > 365 ? 'bg-red-500/15' : 'bg-amber-500/15'}
              />
            </HoverPreview>
          </div>

          {/* Weekly Movement — only shown with 2+ snapshots */}
          {summary!.weekly_movement && (
            <WeeklyMovementSummary movement={summary!.weekly_movement} />
          )}

          {/* Section 1: Project Registry */}
          <ProjectRegistryTab
            isMobile={isMobile}
            onRefresh={handleRefresh}
            onLogIntervention={handleLogIntervention}
          />

          {/* Section 2: Intervention Accountability */}
          <InterventionsTab
            interventionSummary={interventionSummary}
          />

          {/* Section 3: Reference Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-3">
              <ContractorConcentration projects={allProjects} isMobile={isMobile} />
            </div>
            <div className="lg:col-span-2">
              <DataQualityFlags projects={allProjects} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 animate-pulse">
      <div className="w-10 h-10 rounded-xl bg-navy-800" />
      <div>
        <div className="h-6 w-56 bg-navy-800 rounded mb-1" />
        <div className="h-3 w-40 bg-navy-800 rounded" />
      </div>
    </div>
  );
}
