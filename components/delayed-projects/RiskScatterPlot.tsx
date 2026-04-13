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

interface RiskScatterPlotProps {
  projects: DelayedProjectWithComputed[];
  isMobile: boolean;
}

interface ScatterPoint {
  x: number;
  y: number;
  z: number;
  agency: string;
  name: string;
  id: string;
  value: number;
}

export function RiskScatterPlot({ projects, isMobile }: RiskScatterPlotProps) {
  const resp = useMemo(() => chartResponsive(isMobile), [isMobile]);

  const { plotData, noDateProjects } = useMemo(() => {
    const plot: ScatterPoint[] = [];
    const noDate: DelayedProjectWithComputed[] = [];

    for (const p of projects) {
      if (p.days_overdue === null) {
        noDate.push(p);
      } else {
        plot.push({
          x: p.days_overdue,
          y: p.completion_percent,
          z: Math.max(p.contract_value / 100, 100000), // min size
          agency: p.sub_agency,
          name: p.project_name,
          id: p.id,
          value: p.contract_value / 100,
        });
      }
    }

    return { plotData: plot, noDateProjects: noDate };
  }, [projects]);

  if (plotData.length === 0 && noDateProjects.length === 0) return null;

  return (
    <div className="card-premium p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Risk Map</h3>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(AGENCY_HEX_COLORS).slice(0, 7).map(([agency, color]) => (
            <span key={agency} className="flex items-center gap-1 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              {agency}
            </span>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-navy-600">
        X: Days Overdue &middot; Y: Completion % &middot; Bubble size: Contract Value
      </p>

      {plotData.length > 0 && (
        <div className={resp.heightClass}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
                name="Completion %"
                domain={[0, 100]}
                tick={resp.axisTick}
                stroke={CHART_AXIS_LINE.stroke}
                width={40}
                label={{ value: 'Completion %', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 10 }}
              />
              <ZAxis type="number" dataKey="z" range={[40, 400]} />
              <Tooltip
                content={<CustomTooltip />}
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

      {/* No-date projects callout */}
      {noDateProjects.length > 0 && (
        <div className="p-3 bg-navy-950/60 rounded-lg border border-navy-800">
          <p className="text-xs text-slate-500 mb-2">
            {noDateProjects.length} projects with no end date (not plotted)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {noDateProjects.slice(0, 8).map((p) => (
              <span key={p.id} className="text-[10px] text-slate-400 bg-navy-800/60 px-2 py-0.5 rounded">
                {p.project_name.slice(0, 30)}...
              </span>
            ))}
            {noDateProjects.length > 8 && (
              <span className="text-[10px] text-navy-600">+{noDateProjects.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ScatterPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE.contentStyle} className="p-3 space-y-1">
      <p className="text-sm font-medium text-white">{d.name}</p>
      <p className="text-xs text-slate-400">{d.agency}</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mt-1">
        <span className="text-slate-400">Days Overdue</span>
        <span className="text-white font-medium">{d.x.toLocaleString()}</span>
        <span className="text-slate-400">Completion</span>
        <span className="text-white font-medium">{d.y}%</span>
        <span className="text-slate-400">Contract Value</span>
        <span className="text-white font-medium">{fmtCurrency(d.value)}</span>
      </div>
    </div>
  );
}
