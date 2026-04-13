'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { WarRoomSummary, DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { WeeklyMovementSummary } from './WeeklyMovementSummary';
import { RiskSummaryCards } from './RiskSummaryCards';
import { RiskExposureScatter } from './RiskExposureScatter';
import { TriageQueue } from './TriageQueue';
import { ContractorConcentration } from './ContractorConcentration';
import { DataQualityFlags } from './DataQualityFlags';
import { Spinner } from '@/components/ui/Spinner';

interface RiskOverviewTabProps {
  summary: WarRoomSummary;
  isMobile: boolean;
}

export function RiskOverviewTab({ summary, isMobile }: RiskOverviewTabProps) {
  const [projects, setProjects] = useState<DelayedProjectWithComputed[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/delayed-projects?limit=500');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
        <p className="text-sm text-slate-400">Failed to load project data.</p>
        <button onClick={fetchProjects} className="text-xs text-gold-500 hover:text-gold-400 transition-colors">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Weekly Movement — only shown with 2+ snapshots */}
      {summary.weekly_movement && (
        <WeeklyMovementSummary movement={summary.weekly_movement} />
      )}

      {/* Summary Stat Cards */}
      <RiskSummaryCards projects={projects} />

      {/* Risk Exposure Scatter */}
      <RiskExposureScatter projects={projects} isMobile={isMobile} />

      {/* Triage Queue + Data Quality Flags */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TriageQueue projects={projects} isMobile={isMobile} />
        </div>
        <div className="lg:col-span-1">
          <DataQualityFlags projects={projects} />
        </div>
      </div>

      {/* Contractor Concentration */}
      <ContractorConcentration projects={projects} isMobile={isMobile} />
    </div>
  );
}
