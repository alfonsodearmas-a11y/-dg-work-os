'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STATUS_CONFIG, WATER_STATUSES } from '@/lib/hinterland-types';
import type { CommunityListRow, WaterStatusValue } from '@/lib/hinterland-types';
import outline from '@/lib/hinterland/guyana-outline.json';

// Dependency-free SVG point map. Equirectangular projection over Guyana's bbox
// (near-equator, so lon/lat distortion is negligible). Only communities WITH
// coordinates are plotted — un-geocoded ones stay in the region rollup + table,
// so the map never hides a place. Points are coloured by water status.

const VB_H = 1000;
const [MIN_LON, MIN_LAT, MAX_LON, MAX_LAT] = outline.bbox as [number, number, number, number];
const LON_RANGE = MAX_LON - MIN_LON;
const LAT_RANGE = MAX_LAT - MIN_LAT;
// Longitude compression at the mid-latitude keeps the country's shape honest.
const MID_LAT_COS = Math.cos(((MIN_LAT + MAX_LAT) / 2) * Math.PI / 180);
const VB_W = Math.round(VB_H * (LON_RANGE * MID_LAT_COS) / LAT_RANGE);
const PAD = 24;

function projectX(lon: number): number {
  return PAD + ((lon - MIN_LON) / LON_RANGE) * (VB_W - 2 * PAD);
}
function projectY(lat: number): number {
  return PAD + ((MAX_LAT - lat) / LAT_RANGE) * (VB_H - 2 * PAD);
}

const OUTLINE_PATH = (() => {
  const ring = outline.ring as [number, number][];
  if (ring.length === 0) return '';
  return ring.map(([lon, lat], i) => `${i === 0 ? 'M' : 'L'}${projectX(lon).toFixed(1)} ${projectY(lat).toFixed(1)}`).join(' ') + ' Z';
})();

interface Plotted {
  id: string;
  name: string;
  region: number;
  status: WaterStatusValue;
  x: number;
  y: number;
}

export function CommunityMap({ communities, total }: { communities: CommunityListRow[]; total: number }) {
  const router = useRouter();
  const [hover, setHover] = useState<Plotted | null>(null);

  const points = useMemo<Plotted[]>(() => {
    return communities.flatMap(c => {
      const lat = c.latitude != null ? Number(c.latitude) : NaN;
      const lon = c.longitude != null ? Number(c.longitude) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      return [{ id: c.id, name: c.name, region: c.region, status: c.water_status, x: projectX(lon), y: projectY(lat) }];
    });
  }, [communities]);

  const byStatus = useMemo(() => {
    const m = Object.fromEntries(WATER_STATUSES.map(s => [s, 0])) as Record<WaterStatusValue, number>;
    points.forEach(p => { m[p.status]++; });
    return m;
  }, [points]);

  const mapped = points.length;

  return (
    <div className="card-premium p-4 md:p-5">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Community map</h2>
          <span className="text-xs text-navy-600 hidden sm:inline">water status by location</span>
        </div>
        <span className="text-xs text-navy-600 font-mono tabular-nums">
          {mapped} of {total} mapped
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
        {/* Map */}
        <div className="relative mx-auto w-full" style={{ maxWidth: 520 }}>
          <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-auto" role="img" aria-label={`Map of ${mapped} geocoded communities`}>
            <path d={OUTLINE_PATH} fill="rgba(45,58,82,0.18)" stroke="#2d3a52" strokeWidth={2} />
            {points.map(p => {
              const color = STATUS_CONFIG[p.status].color;
              const active = hover?.id === p.id;
              return (
                <circle
                  key={p.id}
                  cx={p.x}
                  cy={p.y}
                  r={active ? 9 : 5}
                  fill={color}
                  fillOpacity={active ? 1 : 0.85}
                  stroke={active ? '#f8fafc' : 'rgba(10,22,40,0.7)'}
                  strokeWidth={active ? 2 : 1}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHover(p)}
                  onMouseLeave={() => setHover(h => (h?.id === p.id ? null : h))}
                  onClick={() => router.push(`/hinterland-communities/${p.id}`)}
                />
              );
            })}
          </svg>

          {/* Tooltip — positioned as a % of the container so it tracks the SVG at any scale. */}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-navy-950 border border-navy-700 px-2.5 py-1.5 shadow-xl whitespace-nowrap"
              style={{ left: `${(hover.x / VB_W) * 100}%`, top: `${(hover.y / VB_H) * 100}%`, marginTop: -8 }}
            >
              <div className="text-xs font-medium text-white">{hover.name}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STATUS_CONFIG[hover.status].color }} />
                <span className="text-[10px] text-navy-500">R{hover.region} · {STATUS_CONFIG[hover.status].label}</span>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-row flex-wrap lg:flex-col gap-x-4 gap-y-1.5 lg:min-w-[150px] content-start">
          {WATER_STATUSES.map(s => (
            <div key={s} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_CONFIG[s].color }} />
              <span className="text-xs text-slate-400">{STATUS_CONFIG[s].label}</span>
              <span className="text-xs text-navy-600 font-mono tabular-nums ml-auto">{byStatus[s]}</span>
            </div>
          ))}
        </div>
      </div>

      {mapped < total && (
        <p className="text-[11px] text-navy-600 mt-3">
          {total - mapped} communities are not yet geocoded and are not plotted. They remain in the region rollup and the table below.
        </p>
      )}
    </div>
  );
}
