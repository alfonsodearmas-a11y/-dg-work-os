'use client';

import { useState } from 'react';
import { Filter, X, ChevronDown } from 'lucide-react';
import { MultiSelect } from './shared';
import { SUB_AGENCY_OPTIONS, OVERSIGHT_STATUS_OPTIONS, REGION_OPTIONS } from './types';

export interface MinistryFilterState {
  sub_agencies: string[];
  statuses: string[];
  regions: string[];
  completion_min: string;
  completion_max: string;
  search: string;
  sort: string;
  sort_dir: 'asc' | 'desc';
}

const SORT_OPTIONS = [
  { value: 'value', label: 'Contract Value' },
  { value: 'completion', label: 'Completion %' },
  { value: 'end_date', label: 'End Date' },
  { value: 'agency', label: 'Agency' },
  { value: 'name', label: 'Project Name' },
  { value: 'status', label: 'Status' },
];

export function MinistryFilters({
  filters,
  onChange,
  onClear,
  lockedAgency,
}: {
  filters: MinistryFilterState;
  onChange: (f: Partial<MinistryFilterState>) => void;
  onClear: () => void;
  lockedAgency?: string;
}) {
  const [open, setOpen] = useState(false);

  const activeCount = [
    filters.sub_agencies.length > 0,
    filters.statuses.length > 0,
    filters.regions.length > 0,
    filters.completion_min || filters.completion_max,
    filters.search,
  ].filter(Boolean).length;

  const agencyOptions = SUB_AGENCY_OPTIONS.map((a) => ({ value: a, label: a }));
  const statusOptions = OVERSIGHT_STATUS_OPTIONS.map((s) => ({
    value: s,
    label: s.replace(/_/g, ' '),
  }));
  const regionOptions = Array.from({ length: 10 }, (_, i) => ({
    value: String(i + 1),
    label: `Region ${i + 1}`,
  }));

  return (
    <div className="space-y-2">
      {/* Toggle + Search */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setOpen(!open)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm border transition-colors ${
            activeCount > 0
              ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
              : 'bg-navy-900 border-navy-800 text-slate-400 hover:text-white hover:border-gold-500'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="ml-1 w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-xs font-bold flex items-center justify-center">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search projects..."
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="w-full bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white placeholder-navy-600 focus:border-gold-500 focus:outline-none"
          />
        </div>

        {/* Sort */}
        <select
          value={`${filters.sort}:${filters.sort_dir}`}
          onChange={(e) => {
            const [sort, sort_dir] = e.target.value.split(':') as [string, 'asc' | 'desc'];
            onChange({ sort, sort_dir });
          }}
          className="bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <optgroup key={o.value} label={o.label}>
              <option value={`${o.value}:desc`}>{o.label} (High to Low)</option>
              <option value={`${o.value}:asc`}>{o.label} (Low to High)</option>
            </optgroup>
          ))}
        </select>

        {activeCount > 0 && (
          <button onClick={onClear} className="text-navy-600 hover:text-white text-sm flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Expanded filter panel */}
      {open && (
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 flex flex-wrap gap-3 items-end animate-[fadeIn_0.2s_ease-in-out]">
          {/* Agency */}
          {!lockedAgency && (
            <MultiSelect
              label="Agency"
              options={agencyOptions}
              selected={filters.sub_agencies}
              onChange={(val) => onChange({ sub_agencies: val })}
            />
          )}

          {/* Status */}
          <MultiSelect
            label="Status"
            options={statusOptions}
            selected={filters.statuses}
            onChange={(val) => onChange({ statuses: val })}
          />

          {/* Region */}
          <MultiSelect
            label="Region"
            options={regionOptions}
            selected={filters.regions}
            onChange={(val) => onChange({ regions: val })}
          />

          {/* Completion range */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-navy-600">Completion</span>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="Min"
              value={filters.completion_min}
              onChange={(e) => onChange({ completion_min: e.target.value })}
              className="w-16 bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
            <span className="text-navy-600 text-xs">-</span>
            <input
              type="number"
              min="0"
              max="100"
              placeholder="Max"
              value={filters.completion_max}
              onChange={(e) => onChange({ completion_max: e.target.value })}
              className="w-16 bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
