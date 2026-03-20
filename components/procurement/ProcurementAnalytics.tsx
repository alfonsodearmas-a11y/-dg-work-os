'use client';

import { useState, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { useIsMobile } from '@/hooks/useIsMobile';
import { ProcurementStageDistribution } from './ProcurementStageDistribution';
import { ProcurementDurationChart } from './ProcurementDurationChart';
import { ProcurementStalledTable } from './ProcurementStalledTable';
import { ProcurementPipelineValue } from './ProcurementPipelineValue';
import type { ProcurementPackage, PipelineStats } from '@/lib/procurement-types';

interface ProcurementAnalyticsProps {
  onPackageClick?: (packageId: string) => void;
}

export function ProcurementAnalytics({ onPackageClick }: ProcurementAnalyticsProps) {
  const isMobile = useIsMobile();
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-6">
      <ProcurementStageDistribution packages={packages} isMobile={isMobile} />
      <ProcurementDurationChart packages={packages} isMobile={isMobile} />
      <ProcurementStalledTable packages={packages} onPackageClick={onPackageClick} isMobile={isMobile} />
      {stats && <ProcurementPipelineValue stats={stats} isMobile={isMobile} />}
    </div>
  );
}
