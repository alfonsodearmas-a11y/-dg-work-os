'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import type { ProcurementPackage } from '@/lib/procurement-types';
import { PROCUREMENT_STAGES, STAGE_CONFIG } from '@/lib/procurement-types';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, CHART_GRID_STROKE, chartResponsive } from '@/lib/chart-styles';

const DEFAULT_COLOR = '#94a3b8';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProcurementStageDistributionProps {
  packages: ProcurementPackage[];
  isMobile?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProcurementStageDistribution({ packages, isMobile = false }: ProcurementStageDistributionProps) {
  const cr = chartResponsive(isMobile);
  const { chartData, agencies } = useMemo(() => {
    // Discover agencies that have packages
    const agencySet = new Set<string>();
    const counts: Record<string, Record<string, number>> = {};

    for (const stage of PROCUREMENT_STAGES) {
      counts[stage] = {};
    }

    for (const pkg of packages) {
      const code = pkg.agency.toUpperCase();
      agencySet.add(code);
      counts[pkg.current_stage][code] = (counts[pkg.current_stage][code] || 0) + 1;
    }

    const sortedAgencies = Array.from(agencySet).sort();

    const data = PROCUREMENT_STAGES.map((stage) => {
      const row: Record<string, string | number> = {
        stage: STAGE_CONFIG[stage].label,
      };
      for (const agency of sortedAgencies) {
        row[agency] = counts[stage][agency] || 0;
      }
      return row;
    });

    return { chartData: data, agencies: sortedAgencies };
  }, [packages]);

  if (packages.length === 0) {
    return (
      <div className="card-premium p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Where are things?</h3>
        <p className="text-navy-600 text-sm text-center py-8">No data</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Where are things?</h3>
      <div className={cr.heightClass}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap={isMobile ? '12%' : '20%'}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_STROKE} />
            <XAxis
              dataKey="stage"
              tick={{ ...cr.axisTick, fontSize: isMobile ? 9 : cr.axisTick.fontSize }}
              axisLine={CHART_AXIS_LINE}
              tickLine={CHART_AXIS_LINE}
              interval={0}
              angle={isMobile ? -35 : 0}
              textAnchor={isMobile ? 'end' : 'middle'}
              height={isMobile ? 60 : 30}
            />
            <YAxis
              allowDecimals={false}
              tick={cr.axisTick}
              axisLine={CHART_AXIS_LINE}
              tickLine={CHART_AXIS_LINE}
            />
            <Tooltip {...CHART_TOOLTIP_STYLE} />
            <Legend
              wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }}
              iconType="square"
              iconSize={10}
            />
            {agencies.map((agency) => (
              <Bar
                key={agency}
                dataKey={agency}
                name={agency}
                fill={AGENCY_HEX_COLORS[agency] || DEFAULT_COLOR}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
