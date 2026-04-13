'use client';

import { useState, useEffect, useCallback } from 'react';
import type { WarRoomSummary, DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { WeeklyMovementSummary } from './WeeklyMovementSummary';
import { RiskScatterPlot } from './RiskScatterPlot';
import { AgencyBreakdownChart } from './AgencyBreakdownChart';
import { FinancialExposureTreemap } from './FinancialExposureTreemap';
import { Spinner } from '@/components/ui/Spinner';

interface RiskOverviewTabProps {
  summary: WarRoomSummary;
  isMobile: boolean;
}

export function RiskOverviewTab({ summary, isMobile }: RiskOverviewTabProps) {
  const [projects, setProjects] = useState<DelayedProjectWithComputed[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch all projects (no pagination) for scatter plot
  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/delayed-projects?limit=500');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {}
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

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Weekly Movement — only shown with 2+ snapshots */}
      {summary.weekly_movement && (
        <WeeklyMovementSummary movement={summary.weekly_movement} />
      )}

      {/* Risk Scatter Plot */}
      <RiskScatterPlot projects={projects} isMobile={isMobile} />

      {/* Agency Breakdown */}
      <AgencyBreakdownChart agencies={summary.by_agency} isMobile={isMobile} />

      {/* Financial Exposure Treemap */}
      <FinancialExposureTreemap regions={summary.by_region} isMobile={isMobile} />
    </div>
  );
}
