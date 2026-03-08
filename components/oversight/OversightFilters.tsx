'use client';

import React, { useState } from 'react';
import {
  SlidersHorizontal, ChevronDown, Search, X, BookmarkPlus, Bookmark, Loader2,
} from 'lucide-react';
import { AGENCY_OPTIONS, STATUS_OPTIONS, REGION_OPTIONS, HEALTH_OPTIONS, HEALTH_DOT } from './types';
import type { SavedFilter } from './types';
import { MultiSelect } from './shared';

export function SaveFilterModal({ filterParams, onClose, onSaved }: { filterParams: Record<string, any>; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/projects/filters', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filter_name: name, filter_params: filterParams }) });
      if (!res.ok) throw new Error();
      onSaved();
    } catch { alert('Failed to save filter'); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card-premium p-6 w-full max-w-sm mx-4 rounded-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">Save Filter Preset</h2>
        <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GPL Delayed Projects" className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none" onKeyDown={e => e.key === 'Enter' && handleSave()} autoFocus />
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="btn-navy px-4 py-2 text-sm">Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || saving} className="btn-gold px-4 py-2 text-sm disabled:opacity-40">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

export interface OversightFilterPanelProps {
  showFilters: boolean;
  onToggleFilters: () => void;
  agencies: string[];
  onAgenciesChange: (v: string[]) => void;
  statuses: string[];
  onStatusesChange: (v: string[]) => void;
  regions: string[];
  onRegionsChange: (v: string[]) => void;
  healths: string[];
  onHealthsChange: (v: string[]) => void;
  budgetMin: string;
  onBudgetMinChange: (v: string) => void;
  budgetMax: string;
  onBudgetMaxChange: (v: string) => void;
  contractor: string;
  onContractorChange: (v: string) => void;
  contractors: string[];
  dateField: string;
  onDateFieldChange: (v: string) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  sort: string;
  onSortChange: (v: string) => void;
  savedFilters: SavedFilter[];
  onApplySavedFilter: (sf: SavedFilter) => void;
  onDeleteSavedFilter: (id: string) => void;
  onClearFilters: () => void;
  onShowSaveFilter: () => void;
  activeFilterCount: number;
  hasActiveFilters: boolean;
}

export function OversightFilterPanel({
  showFilters, onToggleFilters,
  agencies, onAgenciesChange,
  statuses, onStatusesChange,
  regions, onRegionsChange,
  healths, onHealthsChange,
  budgetMin, onBudgetMinChange,
  budgetMax, onBudgetMaxChange,
  contractor, onContractorChange, contractors,
  dateField, onDateFieldChange,
  dateFrom, onDateFromChange,
  dateTo, onDateToChange,
  search, onSearchChange,
  sort, onSortChange,
  savedFilters, onApplySavedFilter, onDeleteSavedFilter,
  onClearFilters, onShowSaveFilter,
  activeFilterCount, hasActiveFilters,
}: OversightFilterPanelProps) {
  return (
    <div className="card-premium">
      <button onClick={onToggleFilters} className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#1a2744]/40 transition-colors">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[#d4af37]" />
          <span className="text-white text-sm font-medium">Filters</span>
          {activeFilterCount > 0 && <span className="bg-[#d4af37] text-[#0a1628] text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{activeFilterCount}</span>}
        </div>
        <ChevronDown className={`h-4 w-4 text-[#64748b] transition-transform ${showFilters ? 'rotate-180' : ''}`} />
      </button>
      {showFilters && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#2d3a52]">
          <div className="pt-3 grid grid-cols-2 md:flex md:flex-wrap md:items-end gap-3">
            <MultiSelect label="Agency" options={AGENCY_OPTIONS.map(a => ({ value: a, label: a }))} selected={agencies} onChange={onAgenciesChange} />
            <MultiSelect label="Status" options={STATUS_OPTIONS.map(s => ({ value: s, label: s }))} selected={statuses} onChange={onStatusesChange} />
            <MultiSelect label="Region" options={REGION_OPTIONS} selected={regions} onChange={onRegionsChange} />
            <MultiSelect label="Health" options={HEALTH_OPTIONS.map(h => ({ value: h.value, label: h.label }))} selected={healths} onChange={onHealthsChange} renderOption={opt => <span className="flex items-center gap-2 text-white"><span className={`w-2 h-2 rounded-full ${HEALTH_DOT[opt.value] || ''}`} />{opt.label}</span>} />
            <div className="flex items-center gap-1 col-span-2 md:col-span-1">
              <input type="number" placeholder="Min $" value={budgetMin} onChange={e => onBudgetMinChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-full md:w-24" />
              <span className="text-[#64748b] text-xs">-</span>
              <input type="number" placeholder="Max $" value={budgetMax} onChange={e => onBudgetMaxChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none w-full md:w-24" />
            </div>
            <input type="text" list="contractor-list" value={contractor} onChange={e => onContractorChange(e.target.value)} placeholder="Contractor..." className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none col-span-2 md:col-span-1 md:w-40" />
            <datalist id="contractor-list">{contractors.slice(0, 50).map(c => <option key={c} value={c} />)}</datalist>
            <div className="relative col-span-2 md:col-span-1 md:flex-1 md:min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
              <input type="text" placeholder="Search projects..." value={search} onChange={e => onSearchChange(e.target.value)} className="w-full bg-[#0a1628] border border-[#2d3a52] rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-3">
            <select value={dateField} onChange={e => onDateFieldChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"><option value="project_end_date">End Date</option><option value="start_date">Start Date</option><option value="updated_at">Last Updated</option></select>
            <select value={sort} onChange={e => onSortChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none"><option value="value">Sort: Value</option><option value="completion">Sort: Completion %</option><option value="end_date">Sort: End Date</option><option value="agency">Sort: Agency</option><option value="name">Sort: Name</option><option value="health">Sort: Health</option></select>
            <input type="date" value={dateFrom} onChange={e => onDateFromChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />
            <input type="date" value={dateTo} onChange={e => onDateToChange(e.target.value)} className="bg-[#0a1628] border border-[#2d3a52] rounded-lg px-3 py-2 text-sm text-white focus:border-[#d4af37] focus:outline-none" />
            <div className="hidden md:block flex-1" />
            {hasActiveFilters && (
              <>
                <button onClick={onShowSaveFilter} className="text-[#d4af37] text-xs flex items-center gap-1 hover:text-[#e5c04b]"><BookmarkPlus className="h-3.5 w-3.5" /> Save Preset</button>
                <button onClick={onClearFilters} className="text-[#64748b] hover:text-white text-xs flex items-center gap-1"><X className="h-3.5 w-3.5" /> Clear All</button>
              </>
            )}
          </div>
          {savedFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Bookmark className="h-3.5 w-3.5 text-[#64748b]" />
              {savedFilters.map(sf => (
                <div key={sf.id} className="flex items-center gap-1 bg-[#0a1628] border border-[#2d3a52] rounded-lg px-2 py-1">
                  <button onClick={() => onApplySavedFilter(sf)} className="text-[#d4af37] text-xs hover:text-[#e5c04b]">{sf.filter_name}</button>
                  <button onClick={() => onDeleteSavedFilter(sf.id)} className="text-[#4a5568] hover:text-red-400"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
