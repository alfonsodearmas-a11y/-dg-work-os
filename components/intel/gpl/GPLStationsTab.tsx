'use client';

import { useState, useMemo } from 'react';
import { Factory, Ship } from 'lucide-react';
import type { GPLSummary } from './gpl-types';
import { getStatusColor, getStatusBg } from './gpl-types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GPLStationsTabProps {
  summary: GPLSummary;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GPLStationsTab({ summary }: GPLStationsTabProps) {
  const [stationFilter, setStationFilter] = useState<string>('all');

  const filteredStations = useMemo(() => {
    if (stationFilter === 'all') return summary.stations;
    return summary.stations.filter(s => s.status === stationFilter);
  }, [summary.stations, stationFilter]);

  return (
    <div className="space-y-4">
      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All', count: summary.stations.length },
          { id: 'operational', label: 'Operational', count: summary.operational.length },
          { id: 'degraded', label: 'Degraded', count: summary.degraded.length },
          { id: 'critical', label: 'Critical', count: summary.critical.length },
          { id: 'offline', label: 'Offline', count: summary.offline.length }
        ].map(filter => (
          <button
            key={filter.id}
            onClick={() => setStationFilter(filter.id)}
            className={`px-4 py-2 rounded-lg text-base font-medium transition-colors flex items-center gap-2 ${
              stationFilter === filter.id
                ? 'bg-gold-500 text-navy-950'
                : 'bg-navy-900 text-slate-400 hover:text-slate-100 border border-navy-800'
            }`}
          >
            {filter.label}
            <span className={`text-sm px-2 py-0.5 rounded-full ${
              stationFilter === filter.id ? 'bg-navy-950/20' : 'bg-navy-800'
            }`}>{filter.count}</span>
          </button>
        ))}
      </div>

      {/* Station Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStations.map(station => {
          const StatusIcon = station.name.includes('PS') ? Ship : Factory;

          return (
            <div
              key={station.name}
              className={`bg-navy-900 rounded-xl border ${
                station.status === 'critical' || station.status === 'offline'
                  ? 'border-red-500/40'
                  : station.status === 'degraded'
                    ? 'border-amber-500/30'
                    : 'border-navy-800'
              } p-3 md:p-5`}
            >
              {/* Header: station name + status badge */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-navy-800 flex items-center justify-center">
                    <StatusIcon className="w-4.5 h-4.5 text-slate-400" />
                  </div>
                  <span className="text-slate-100 font-semibold text-[15px]">{station.name}</span>
                </div>
                <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${getStatusBg(station.status)}`}>
                  {station.status.charAt(0).toUpperCase() + station.status.slice(1)}
                </span>
              </div>

              {/* MW values -- always visible */}
              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-2xl md:text-3xl font-bold text-slate-100">{station.available}</span>
                <span className="text-navy-600 text-base">/ {station.derated} MW</span>
              </div>

              {/* Progress bar -- always visible */}
              <div className="h-2.5 bg-navy-800 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${station.availability}%`,
                    backgroundColor: getStatusColor(station.status)
                  }}
                />
              </div>

              {/* Units + % -- always visible */}
              <div className="flex items-center justify-between text-[15px] text-navy-600">
                <span>{station.units} units</span>
                <span>{(station.availability ?? 0).toFixed(0)}% available</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
