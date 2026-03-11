'use client';

import { useState } from 'react';
import { Search, X, Filter } from 'lucide-react';

interface TaskFiltersProps {
  onFilterChange: (filters: Record<string, string>) => void;
  showAssignee?: boolean;
  assignees?: { id: string; full_name: string }[];
}

const AGENCIES = [
  { value: '', label: 'All Agencies' },
  { value: 'gpl', label: 'GPL' },
  { value: 'cjia', label: 'CJIA' },
  { value: 'gwi', label: 'GWI' },
  { value: 'gcaa', label: 'GCAA' },
  { value: 'marad', label: 'MARAD' },
  { value: 'heci', label: 'HECI' },
  { value: 'ppdi', label: 'PPDI' },
  { value: 'has', label: 'HAS' },
];

const PRIORITIES = [
  { value: '', label: 'All Priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
];

export function TaskFilters({ onFilterChange, showAssignee, assignees }: TaskFiltersProps) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const update = (key: string, value: string) => {
    const next = { ...filters, [key]: value };
    if (!value) delete next[key];
    setFilters(next);
    onFilterChange(next);
  };

  const handleSearch = () => {
    update('search', search);
  };

  const clearAll = () => {
    setFilters({});
    setSearch('');
    onFilterChange({});
  };

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className="w-full pl-9 pr-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
        />
      </div>

      <select
        value={filters.agency || ''}
        onChange={(e) => update('agency', e.target.value)}
        aria-label="Filter by agency"
        className="px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
      >
        {AGENCIES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>

      <select
        value={filters.priority || ''}
        onChange={(e) => update('priority', e.target.value)}
        aria-label="Filter by priority"
        className="px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
      >
        {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>

      <select
        value={filters.status || ''}
        onChange={(e) => update('status', e.target.value)}
        aria-label="Filter by status"
        className="px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
      >
        {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>

      {showAssignee && assignees && (
        <select
          value={filters.assignee_id || ''}
          onChange={(e) => update('assignee_id', e.target.value)}
          aria-label="Filter by assignee"
          className="px-3 py-2 bg-navy-900 border border-navy-800 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
        >
          <option value="">All Assignees</option>
          {assignees.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
        </select>
      )}

      {hasFilters && (
        <button onClick={clearAll} className="flex items-center gap-1 px-2 py-2 text-xs text-navy-600 hover:text-white transition-colors">
          <X className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
