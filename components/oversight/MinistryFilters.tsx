'use client';

import { useState, useMemo } from 'react';
import { Filter, X, Download, ChevronDown, Search } from 'lucide-react';
import { MultiSelect } from './shared';
import { SUB_AGENCY_OPTIONS } from './types';

export interface MinistryFilterState {
  sub_agencies: string[];
  regions: string[];
  completion_min: string;
  completion_max: string;
  end_date_from: string;
  end_date_to: string;
  contractor_search: string;
  search: string;
  sort: string;
  sort_dir: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: MinistryFilterState = {
  sub_agencies: [],
  regions: [],
  completion_min: '',
  completion_max: '',
  end_date_from: '',
  end_date_to: '',
  contractor_search: '',
  search: '',
  sort: 'value',
  sort_dir: 'desc',
};

const SORT_OPTIONS = [
  { value: 'value:desc', label: 'Value (High-Low)' },
  { value: 'value:asc', label: 'Value (Low-High)' },
  { value: 'completion:desc', label: 'Completion (High-Low)' },
  { value: 'completion:asc', label: 'Completion (Low-High)' },
  { value: 'end_date:asc', label: 'End Date (Soonest)' },
  { value: 'end_date:desc', label: 'End Date (Latest)' },
  { value: 'name:asc', label: 'Name (A-Z)' },
  { value: 'agency:asc', label: 'Agency (A-Z)' },
];

const REGION_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  value: String(i + 1),
  label: `Region ${i + 1}`,
}));

export function MinistryFilters({
  filters,
  onChange,
  onClear,
  onExport,
  lockedAgency,
}: {
  filters: MinistryFilterState;
  onChange: (f: Partial<MinistryFilterState>) => void;
  onClear: () => void;
  onExport: () => void;
  lockedAgency?: string;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  const activeFilterCount = [
    filters.sub_agencies.length > 0,
    filters.regions.length > 0,
    filters.completion_min || filters.completion_max,
    filters.end_date_from || filters.end_date_to,
    filters.contractor_search,
    filters.search,
  ].filter(Boolean).length;

  const pills = useMemo(() => {
    const result: { key: string; label: string; clear: () => void }[] = [];
    for (const a of filters.sub_agencies) {
      result.push({ key: `agency-${a}`, label: a, clear: () => onChange({ sub_agencies: filters.sub_agencies.filter((x) => x !== a) }) });
    }
    for (const r of filters.regions) {
      result.push({ key: `region-${r}`, label: `Region ${r}`, clear: () => onChange({ regions: filters.regions.filter((x) => x !== r) }) });
    }
    if (filters.completion_min || filters.completion_max) {
      result.push({ key: 'completion', label: `${filters.completion_min || '0'}% - ${filters.completion_max || '100'}%`, clear: () => onChange({ completion_min: '', completion_max: '' }) });
    }
    if (filters.end_date_from || filters.end_date_to) {
      result.push({ key: 'date', label: `${filters.end_date_from || '...'} to ${filters.end_date_to || '...'}`, clear: () => onChange({ end_date_from: '', end_date_to: '' }) });
    }
    if (filters.contractor_search) {
      result.push({ key: 'contractor', label: `Contractor: ${filters.contractor_search}`, clear: () => onChange({ contractor_search: '' }) });
    }
    if (filters.search) {
      result.push({ key: 'search', label: `"${filters.search}"`, clear: () => onChange({ search: '' }) });
    }
    return result;
  }, [filters, onChange]);

  return (
    <div className="space-y-3">
      {/* Agency chips */}
      {!lockedAgency && (
        <div className="flex items-center gap-2 flex-wrap">
          {SUB_AGENCY_OPTIONS.map((agency) => {
            const active = filters.sub_agencies.includes(agency);
            return (
              <button
                key={agency}
                onClick={() => {
                  onChange({
                    sub_agencies: active
                      ? filters.sub_agencies.filter((a) => a !== agency)
                      : [...filters.sub_agencies, agency],
                  });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-gold-500/20 text-gold-500 border-gold-500/30'
                    : 'bg-navy-900 text-navy-600 border-navy-800 hover:text-white hover:border-navy-700'
                }`}
              >
                {agency}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-navy-600" />
          <input
            type="text"
            placeholder="Search projects..."
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            className="w-full bg-navy-950 border border-navy-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-navy-600 focus:border-gold-500 focus:outline-none"
          />
        </div>

        <button
          onClick={() => setPanelOpen(!panelOpen)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${
            activeFilterCount > 0
              ? 'bg-gold-500/10 border-gold-500/30 text-gold-500'
              : 'bg-navy-900 border-navy-800 text-slate-400 hover:text-white hover:border-navy-700'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-xs font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
          <ChevronDown className={`h-3 w-3 transition-transform ${panelOpen ? 'rotate-180' : ''}`} />
        </button>

        <select
          value={`${filters.sort}:${filters.sort_dir}`}
          onChange={(e) => {
            const [sort, sort_dir] = e.target.value.split(':') as [string, 'asc' | 'desc'];
            onChange({ sort, sort_dir });
          }}
          className="bg-navy-950 border border-navy-800 rounded-lg px-3 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-navy-800 bg-navy-900 text-slate-400 hover:text-white hover:border-navy-700 transition-colors"
          title="Export CSV"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </button>

        {activeFilterCount > 0 && (
          <button onClick={onClear} className="text-navy-600 hover:text-white text-xs flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Clear all
          </button>
        )}
      </div>

      {/* Collapsible filter panel */}
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: panelOpen ? '300px' : '0', opacity: panelOpen ? 1 : 0 }}
      >
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 flex flex-wrap gap-3 items-end">
          <MultiSelect
            label="Region"
            options={REGION_OPTIONS}
            selected={filters.regions}
            onChange={(val) => onChange({ regions: val })}
          />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-navy-600">Completion</span>
            <input
              type="number" min="0" max="100" placeholder="Min"
              value={filters.completion_min}
              onChange={(e) => onChange({ completion_min: e.target.value })}
              className="w-16 bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
            <span className="text-navy-600 text-xs">-</span>
            <input
              type="number" min="0" max="100" placeholder="Max"
              value={filters.completion_max}
              onChange={(e) => onChange({ completion_max: e.target.value })}
              className="w-16 bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-navy-600">End Date</span>
            <input
              type="date"
              value={filters.end_date_from}
              onChange={(e) => onChange({ end_date_from: e.target.value })}
              className="bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
            <span className="text-navy-600 text-xs">-</span>
            <input
              type="date"
              value={filters.end_date_to}
              onChange={(e) => onChange({ end_date_to: e.target.value })}
              className="bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white focus:border-gold-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-navy-600">Contractor</span>
            <input
              type="text" placeholder="Search contractor..."
              value={filters.contractor_search}
              onChange={(e) => onChange({ contractor_search: e.target.value })}
              className="w-40 bg-navy-950 border border-navy-800 rounded-lg px-2 py-2 text-sm text-white placeholder-navy-600 focus:border-gold-500 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Active filter pills */}
      {pills.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {pills.map((pill) => (
            <span
              key={pill.key}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-gold-500/20 text-gold-500 border border-gold-500/30"
            >
              {pill.label}
              <button onClick={pill.clear} className="hover:text-white" aria-label={`Remove ${pill.label}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
