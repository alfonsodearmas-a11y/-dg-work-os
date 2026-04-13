'use client';

import { useMemo } from 'react';
import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_TOOLTIP_STYLE } from '@/lib/chart-styles';
import type { RegionBreakdown } from '@/lib/delayed-projects/types';
import { fmtCurrency, fmtRegion } from '@/components/oversight/types';

interface FinancialExposureTreemapProps {
  regions: RegionBreakdown[];
  isMobile: boolean;
}

function riskColor(avgRisk: number): string {
  if (avgRisk >= 0.5) return '#dc2626'; // red
  if (avgRisk >= 0.2) return '#d4af37'; // gold/amber
  return '#059669'; // green
}

export function FinancialExposureTreemap({ regions, isMobile }: FinancialExposureTreemapProps) {
  const data = useMemo(() => {
    const filtered = regions.filter((r) => r.total_exposure > 0);
    if (filtered.length === 0) return [];
    return filtered.map((r) => ({
      name: fmtRegion(r.region),
      size: r.total_exposure / 100, // display in dollars
      count: r.count,
      exposure: r.total_exposure,
      fill: riskColor(r.avg_risk),
      avgRisk: r.avg_risk,
    }));
  }, [regions]);

  if (data.length === 0) return null;

  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Financial Exposure by Region</h3>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#dc2626]" />High Risk</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#d4af37]" />Medium</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-[#059669]" />Low</span>
        </div>
      </div>

      <div className={isMobile ? 'h-64' : 'h-80'}>
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            aspectRatio={isMobile ? 3 / 2 : 4 / 3}
            stroke="#0a1628"
            content={<CustomCell />}
          >
            <Tooltip content={<CustomTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CustomCell(props: Record<string, unknown>) {
  const { x, y, width, height, name, fill, count, size } = props as {
    x: number; y: number; width: number; height: number;
    name: string; fill: string; count: number; size: number;
  };

  if (width < 30 || height < 20) return null;

  const showValue = width > 60 && height > 40;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        fillOpacity={0.3}
        stroke={fill}
        strokeWidth={1}
        strokeOpacity={0.6}
        rx={4}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - (showValue ? 6 : 0)}
        textAnchor="middle"
        fill="#f8fafc"
        fontSize={width > 80 ? 12 : 10}
        fontWeight={600}
      >
        {name}
      </text>
      {showValue && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize={10}
          >
            {fmtCurrency(size)}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 22}
            textAnchor="middle"
            fill="#64748b"
            fontSize={9}
          >
            {count} project{count !== 1 ? 's' : ''}
          </text>
        </>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: { name: string; size: number; count: number; avgRisk: number } }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={CHART_TOOLTIP_STYLE.contentStyle} className="p-3">
      <p className="text-white font-medium">{d.name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs mt-1">
        <span className="text-slate-400">Exposure</span>
        <span className="text-white">{fmtCurrency(d.size)}</span>
        <span className="text-slate-400">Projects</span>
        <span className="text-white">{d.count}</span>
        <span className="text-slate-400">Risk Level</span>
        <span className="text-white">{d.avgRisk >= 0.5 ? 'High' : d.avgRisk >= 0.2 ? 'Medium' : 'Low'}</span>
      </div>
    </div>
  );
}
