'use client';

import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { ProcurementStageDistribution } from './ProcurementStageDistribution';
import { ProcurementDurationChart } from './ProcurementDurationChart';
import { ProcurementStalledTable } from './ProcurementStalledTable';
import { ProcurementPipelineValue } from './ProcurementPipelineValue';
import type { ProcurementPackage, PipelineStats } from '@/lib/procurement-types';

interface ProcurementAnalyticsProps {
  onPackageClick?: (packageId: string) => void;
}

export function ProcurementAnalytics({ onPackageClick }: ProcurementAnalyticsProps) {
  const [packages, setPackages] = useState<ProcurementPackage[]>([]);
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/procurement');
      if (!res.ok) return;
      const data = await res.json();
      setPackages(data.packages || []);
      setStats(data.stats || null);
    } catch {
      // Silently fail — analytics are non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
        <span className="ml-3 text-navy-600">Loading analytics...</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <ProcurementStageDistribution packages={packages} />
      <ProcurementDurationChart packages={packages} />
      <ProcurementStalledTable packages={packages} onPackageClick={onPackageClick} />
      {stats && <ProcurementPipelineValue stats={stats} />}
    </div>
  );
}
