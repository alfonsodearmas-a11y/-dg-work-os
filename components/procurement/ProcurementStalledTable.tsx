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
import { DaysAtStageIndicator } from '@/components/procurement/DaysAtStageIndicator';
import type { ProcurementPackage } from '@/lib/procurement-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcurementStalledTableProps {
  packages: ProcurementPackage[];
  onPackageClick?: (packageId: string) => void;
  isMobile?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALLED_THRESHOLD = 30;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementStalledTable({ packages, onPackageClick, isMobile = false }: ProcurementStalledTableProps) {
  const stalledPackages = useMemo(() => {
    return packages
      .filter((pkg) => pkg.days_at_current_stage > STALLED_THRESHOLD)
      .sort((a, b) => b.days_at_current_stage - a.days_at_current_stage);
  }, [packages]);

  return (
    <div className="card-premium p-4 md:p-6">
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
          description="All tenders are progressing normally."
        />
      ) : isMobile ? (
        /* Mobile: card list */
        <div className="space-y-2">
          {stalledPackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onPackageClick?.(pkg.id)}
              className="w-full text-left p-3 rounded-xl border border-navy-800 bg-navy-900/50 space-y-2 touch-active"
              style={{ minHeight: 44 }}
            >
              <p className="text-sm font-medium text-white line-clamp-1">{pkg.title}</p>
              <div className="flex items-center gap-2">
                <AgencyBadge agency={pkg.agency} />
                <ProcurementStageBadge stage={pkg.current_stage} size="sm" />
              </div>
              <div className="flex items-center gap-1">
                <DaysAtStageIndicator days={pkg.days_at_current_stage} />
                <span className="text-xs text-navy-600">at stage</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        /* Desktop: table */
        <Table ariaLabel="Stalled procurement tenders">
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[200px]">Title</TableHead>
              <TableHead>Agency</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Days</TableHead>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
