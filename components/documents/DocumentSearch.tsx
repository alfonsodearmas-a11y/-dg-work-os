'use client';

import { useState } from 'react';
import { Search, Building2, FolderOpen } from 'lucide-react';

interface DocumentSearchProps {
  onSearch: (query: string, filters: { agency?: string; type?: string }) => void;
}

const agencies = ['GPL', 'GWI', 'HECI', 'MARAD', 'GCAA', 'CJIA', 'HAS', 'MOPUA'];
const types = ['contract', 'report', 'letter', 'memo', 'budget', 'policy', 'meeting_notes', 'invoice'];

export function DocumentSearch({ onSearch }: DocumentSearchProps) {
  const [query, setQuery] = useState('');
  const [agency, setAgency] = useState('');
  const [type, setType] = useState('');

  const handleSearch = () => {
    onSearch(query, {
      agency: agency || undefined,
      type: type || undefined
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1 relative">
        <input
          type="text"
          placeholder="Search documents with AI..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search documents"
          className="w-full pl-12 pr-4 py-3 bg-navy-900 border border-navy-800 rounded-xl text-white placeholder-navy-600 focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors"
        />
        <Search className="absolute left-4 top-3.5 h-5 w-5 text-navy-600" />
      </div>

      <div className="relative">
        <select
          value={agency}
          onChange={(e) => setAgency(e.target.value)}
          aria-label="Filter by agency"
          className="w-full sm:w-auto px-4 py-3 pl-10 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors appearance-none cursor-pointer"
          style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
        >
          <option value="" className="bg-navy-900">All Agencies</option>
          {agencies.map((a) => (
            <option key={a} value={a} className="bg-navy-900">{a}</option>
          ))}
        </select>
        <Building2 className="absolute left-3 top-3.5 h-5 w-5 text-navy-600 pointer-events-none" />
      </div>

      <div className="relative">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by document type"
          className="w-full sm:w-auto px-4 py-3 pl-10 bg-navy-900 border border-navy-800 rounded-xl text-white focus:ring-2 focus:ring-gold-500 focus:border-gold-500 transition-colors appearance-none cursor-pointer capitalize"
          style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em', paddingRight: '2.5rem' }}
        >
          <option value="" className="bg-navy-900">All Types</option>
          {types.map((t) => (
            <option key={t} value={t} className="bg-navy-900 capitalize">{t.replace('_', ' ')}</option>
          ))}
        </select>
        <FolderOpen className="absolute left-3 top-3.5 h-5 w-5 text-navy-600 pointer-events-none" />
      </div>

      <button
        onClick={handleSearch}
        className="btn-gold px-6 py-3 font-medium flex items-center justify-center space-x-2"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span>Search</span>
      </button>
    </div>
  );
}
