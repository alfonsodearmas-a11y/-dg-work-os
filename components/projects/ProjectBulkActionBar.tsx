'use client';

import React, { useState } from 'react';
import { ChevronDown, Download, X } from 'lucide-react';

const HEALTH_OPTIONS = [
  { value: 'green', label: 'On Track', color: 'bg-emerald-500' },
  { value: 'amber', label: 'Minor Issues', color: 'bg-amber-500' },
  { value: 'red', label: 'Critical', color: 'bg-red-500' },
];

export function ProjectBulkActionBar({
  count,
  onUpdateHealth,
  onExport,
  onClear,
}: {
  count: number;
  onUpdateHealth: (health: string) => void;
  onExport: () => void;
  onClear: () => void;
}) {
  const [showHealthMenu, setShowHealthMenu] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-navy-900 border border-gold-500/40 rounded-2xl shadow-2xl px-4 py-3 flex items-center gap-3">
      <span className="text-gold-500 font-semibold text-sm">{count} selected</span>

      {/* Health */}
      <div className="relative">
        <button onClick={() => setShowHealthMenu(!showHealthMenu)} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">
          Health <ChevronDown className="h-3 w-3" />
        </button>
        {showHealthMenu && (
          <div className="absolute bottom-full left-0 mb-2 bg-navy-900 border border-navy-800 rounded-lg shadow-xl min-w-[140px]">
            {HEALTH_OPTIONS.map(h => (
              <button key={h.value} onClick={() => { onUpdateHealth(h.value); setShowHealthMenu(false); }} className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-white hover:bg-navy-950/60">
                <span className={`w-2 h-2 rounded-full ${h.color}`} />{h.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export */}
      <button onClick={onExport} className="btn-navy px-3 py-1.5 text-xs flex items-center gap-1">
        <Download className="h-3 w-3" /> CSV
      </button>

      {/* Clear */}
      <button onClick={onClear} className="text-navy-600 hover:text-white" aria-label="Clear selection">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
