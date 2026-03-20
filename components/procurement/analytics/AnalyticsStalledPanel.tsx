'use client';

import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { AgencyBadge } from '../AgencyBadge';
import { ProcurementStageBadge } from '../ProcurementStageBadge';
import { ProcurementValueDisplay } from '../ProcurementValueDisplay';
import type { ProcurementPackage } from '@/lib/procurement-types';

const STALLED_THRESHOLD = 30;

interface Props {
  packages: ProcurementPackage[];
  onPackageClick?: (packageId: string) => void;
  isMobile?: boolean;
}

function severityDot(days: number): string {
  if (days > 60) return 'bg-red-500';
  if (days > 45) return 'bg-amber-500';
  return 'bg-yellow-500';
}

export function AnalyticsStalledPanel({ packages, onPackageClick, isMobile = false }: Props) {
  const stalledPackages = useMemo(() => {
    return packages
      .filter((pkg) => pkg.current_stage !== 'awarded' && pkg.days_at_current_stage > STALLED_THRESHOLD)
      .sort((a, b) => b.days_at_current_stage - a.days_at_current_stage);
  }, [packages]);

  return (
    <div className={`card-premium p-5 h-full flex flex-col relative overflow-hidden ${
      stalledPackages.length > 0 ? 'border-l-2 border-l-amber-500/50' : ''
    }`}>
      {/* Subtle amber glow for alert state */}
      {stalledPackages.length > 0 && (
        <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/5 rounded-full -translate-x-16 -translate-y-16 pointer-events-none" />
      )}

      <div className="flex items-center gap-2.5 mb-4 relative">
        {stalledPackages.length > 0 ? (
          <AlertTriangle className="w-4 h-4 text-amber-400" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        )}
        <h3 className="text-sm font-semibold text-white">Requires Attention</h3>
        {stalledPackages.length > 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400">
            {stalledPackages.length}
          </span>
        )}
      </div>

      {stalledPackages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mx-auto mb-2" />
            <p className="text-sm text-emerald-400 font-medium">All tenders moving</p>
            <p className="text-xs text-navy-600 mt-1">Nothing stuck beyond 30 days</p>
          </div>
        </div>
      ) : (
        <div className={`space-y-1 flex-1 overflow-y-auto ${isMobile ? '' : 'max-h-[280px]'}`} style={{ WebkitOverflowScrolling: 'touch' }}>
          {stalledPackages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              onClick={() => onPackageClick?.(pkg.id)}
              className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-navy-900/70 transition-colors group"
              style={{ minHeight: 44, touchAction: 'manipulation' }}
            >
              {/* Severity dot */}
              <div className={`w-2 h-2 rounded-full shrink-0 ${severityDot(pkg.days_at_current_stage)}`} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate group-hover:text-gold-400 transition-colors">{pkg.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <AgencyBadge agency={pkg.agency} />
                  <ProcurementStageBadge stage={pkg.current_stage} size="sm" />
                </div>
              </div>

              {/* Days + Value */}
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-red-400 tabular-nums">{pkg.days_at_current_stage}d</p>
                <ProcurementValueDisplay value={pkg.estimated_value} size="sm" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
