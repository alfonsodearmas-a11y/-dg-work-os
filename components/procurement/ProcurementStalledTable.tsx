'use client';

import { useMemo } from 'react';
import { CheckCircle } from 'lucide-react';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/Table';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { AgencyBadge } from '@/components/procurement/AgencyBadge';
import { ProcurementStageBadge } from '@/components/procurement/ProcurementStageBadge';
import { ProcurementValueDisplay } from '@/components/procurement/ProcurementValueDisplay';
import { DaysAtStageIndicator } from '@/components/procurement/DaysAtStageIndicator';
import type { ProcurementPackage } from '@/lib/procurement-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcurementStalledTableProps {
  packages: ProcurementPackage[];
  onPackageClick?: (packageId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALLED_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementStalledTable({ packages, onPackageClick }: ProcurementStalledTableProps) {
  const stalledPackages = useMemo(() => {
    return packages
      .filter((pkg) => pkg.days_at_current_stage > STALLED_THRESHOLD)
      .sort((a, b) => b.estimated_value - a.estimated_value);
  }, [packages]);

  return (
    <div className="card-premium p-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold text-white">What is stuck?</h3>
        {stalledPackages.length > 0 && (
          <Badge variant="danger">{stalledPackages.length}</Badge>
        )}
      </div>

      {stalledPackages.length === 0 ? (
        <EmptyState
          icon={<CheckCircle className="h-12 w-12" />}
          title="Nothing stuck"
          description="All packages are progressing normally."
        />
      ) : (
        <Table ariaLabel="Stalled procurement packages">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Days</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stalledPackages.map((pkg) => (
              <TableRow
                key={pkg.id}
                className="cursor-pointer"
              >
                <TableCell>
                  <button
                    type="button"
                    className="text-left w-full max-w-[240px] truncate text-white text-sm hover:text-gold-400 transition-colors"
                    onClick={() => onPackageClick?.(pkg.id)}
                    title={pkg.title}
                  >
                    {pkg.title}
                  </button>
                </TableCell>
                <TableCell>
                  <AgencyBadge agency={pkg.agency} />
                </TableCell>
                <TableCell>
                  <ProcurementStageBadge stage={pkg.current_stage} size="sm" />
                </TableCell>
                <TableCell>
                  <DaysAtStageIndicator days={pkg.days_at_current_stage} />
                </TableCell>
                <TableCell className="text-right">
                  <ProcurementValueDisplay value={pkg.estimated_value} size="sm" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
