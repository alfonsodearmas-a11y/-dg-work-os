'use client';

import { useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_TOOLTIP_STYLE, CHART_AXIS_LINE, chartResponsive } from '@/lib/chart-styles';
import { AGENCY_HEX_COLORS } from '@/lib/constants/agencies';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { fmtCurrency } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import { AgencyBadge } from './shared';

interface RiskExposureScatterProps {
  projects: DelayedProjectWithComputed[];
  isMobile: boolean;
}

interface ScatterPoint {
  x: number;          // days overdue
  y: number;          // remaining value (dollars)
  z: number;          // bubble size (contract value dollars)
  agency: string;
  name: string;
  shortName: string;
  contractor: string;
  id: string;
}

export function RiskExposureScatter({ projects, isMobile }: RiskExposureScatterProps) {
  const resp = useMemo(() => chartResponsive(isMobile), [isMobile]);

  const { plotData, unplottable, presentAgencies } = useMemo(() => {
    const plot: ScatterPoint[] = [];
    const noPlot: DelayedProjectWithComputed[] = [];
    const agencySet = new Set<string>();

    for (const p of projects) {
      if (p.days_overdue === null || p.contract_value === 0) {
        noPlot.push(p);
      } else {
        agencySet.add(p.sub_agency);
        plot.push({
          x: p.days_overdue,
          y: p.remaining_value / 100,
          z: Math.max(p.contract_value / 100, 100000),
          agency: p.sub_agency,
          name: p.project_name,
          shortName: getShortName(p.project_name),
          contractor: p.contractors || 'Unknown',
          id: p.id,
        });
      }
    }

    const legend = Array.from(agencySet)
      .filter(a => a in AGENCY_HEX_COLORS)
      .map(a => ({ agency: a, color: AGENCY_HEX_COLORS[a] }));

    return { plotData: plot, unplottable: noPlot, presentAgencies: legend };
  }, [projects]);

  if (plotData.length === 0 && unplottable.length === 0) return null;

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Risk Exposure</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {presentAgencies.map(({ agency, color }) => (
            <span key={agency} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {agency}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-navy-600">
        X: Days Overdue &middot; Y: Remaining Value &middot; Bubble size: Contract Value
      </p>

      {plotData.length > 0 && (
        <div className={resp.heightClass}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS_LINE.stroke} />
              <XAxis
                type="number"
                dataKey="x"
                name="Days Overdue"
                tick={resp.axisTick}
                stroke={CHART_AXIS_LINE.stroke}
                label={{ value: 'Days Overdue', position: 'insideBottom', offset: -4, fill: '#64748b', fontSize: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Remaining Value"
                tick={resp.axisTick}
                stroke={CHART_AXIS_LINE.stroke}
                width={isMobile ? 60 : 80}
                tickFormatter={(v: number) => fmtCurrency(v)}
                label={{ value: 'Remaining Value', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10, dx: -4 }}
              />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <Tooltip
                content={<ScatterTooltip />}
                cursor={{ strokeDasharray: '3 3', stroke: '#d4af37', strokeOpacity: 0.3 }}
              />
              <Scatter data={plotData} fillOpacity={0.7}>
                {plotData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={AGENCY_HEX_COLORS[entry.agency] || '#64748b'}
                    stroke={AGENCY_HEX_COLORS[entry.agency] || '#64748b'}
                    strokeWidth={1}
                    strokeOpacity={0.8}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Unplottable projects callout */}
      {unplottable.length > 0 && (
        <div className="p-3 bg-navy-950/60 rounded-lg border border-amber-500/20">
          <p className="text-xs text-amber-400/80 mb-2">
            {unplottable.length} project{unplottable.length !== 1 ? 's' : ''} not plotted (missing end date or contract value)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unplottable.slice(0, 8).map((p) => (
              <span key={p.id} className="inline-flex items-center gap-1 text-[10px] bg-navy-800/60 px-2 py-0.5 rounded">
                <AgencyBadge agency={p.sub_agency} />
                <span className="text-slate-400">{getShortName(p.project_name)}</span>
              </span>
            ))}
            {unplottable.length > 8 && (
              <span className="text-[10px] text-navy-600">+{unplottable.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ScatterTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE.contentStyle} className="p-3 space-y-1">
      <p className="text-sm font-medium text-white">{d.shortName}</p>
      <p className="text-xs text-slate-400">{d.contractor}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
        <span className="text-slate-400">Remaining Value</span>
        <span className="text-white font-medium">{fmtCurrency(d.y)}</span>
        <span className="text-slate-400">Days Overdue</span>
        <span className="text-white font-medium">{d.x.toLocaleString()}</span>
        <span className="text-slate-400">Agency</span>
        <span className="text-white font-medium">{d.agency}</span>
      </div>
    </div>
  );
}
