'use client';

import { Search, X } from 'lucide-react';
import { MultiSelect } from '@/components/oversight/shared';
import { SUB_AGENCY_OPTIONS, REGION_OPTIONS } from '@/components/oversight/types';
import type { RiskTier } from '@/lib/delayed-projects/types';

export interface FilterState {
  sub_agencies: string[];
  regions: string[];
  risk_tiers: RiskTier[];
  search: string;
}

export const DEFAULT_FILTERS: FilterState = {
  sub_agencies: [],
  regions: [],
  risk_tiers: [],
  search: '',
};

interface RegistryFiltersProps {
  filters: FilterState;
  onChange: (partial: Partial<FilterState>) => void;
  onClear: () => void;
}

const RISK_TIERS: { value: RiskTier; label: string; activeClass: string }[] = [
  { value: 'HIGH', label: 'High', activeClass: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { value: 'MEDIUM', label: 'Medium', activeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  { value: 'LOW', label: 'Low', activeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { value: 'NO_DATA', label: 'No Data', activeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/30' },
];

export function RegistryFilters({ filters, onChange, onClear }: RegistryFiltersProps) {
  const hasActive = filters.sub_agencies.length > 0 || filters.regions.length > 0 || filters.risk_tiers.length > 0 || filters.search !== '';

  function toggleRisk(tier: RiskTier) {
    const current = filters.risk_tiers;
    onChange({
      risk_tiers: current.includes(tier) ? current.filter((t) => t !== tier) : [...current, tier],
    });
  }

  const regionOptions = REGION_OPTIONS.map((r) => ({ value: r.value, label: r.label.replace(/Region \d+ – /, 'R' + r.value + ' ') }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Agency filter */}
      <MultiSelect
        label="Agency"
        options={SUB_AGENCY_OPTIONS.map((a) => ({ value: a, label: a }))}
        selected={filters.sub_agencies}
        onChange={(val) => onChange({ sub_agencies: val })}
      />

      {/* Region filter */}
      <MultiSelect
        label="Region"
        options={regionOptions}
        selected={filters.regions}
        onChange={(val) => onChange({ regions: val })}
      />

      {/* Risk tier toggles */}
      <div className="flex items-center gap-1">
        {RISK_TIERS.map((tier) => {
          const active = filters.risk_tiers.includes(tier.value);
          return (
            <button
              key={tier.value}
              onClick={() => toggleRisk(tier.value)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? tier.activeClass
                  : 'border-navy-800 text-navy-600 hover:text-white hover:border-navy-700'
              }`}
            >
              {tier.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative flex-1 min-w-[160px] max-w-[280px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-600 pointer-events-none" />
        <input
          type="text"
          placeholder="Search projects..."
          value={filters.search}
          onChange={(e) => onChange({ search: e.target.value })}
          className="input-premium w-full !pl-8 py-2 text-sm"
        />
      </div>

      {/* Clear */}
      {hasActive && (
        <button
          onClick={onClear}
          className="flex items-center gap-1 text-xs text-navy-600 hover:text-gold-500"
        >
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
