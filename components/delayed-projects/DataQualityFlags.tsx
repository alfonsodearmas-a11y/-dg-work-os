'use client';

import { useMemo, useState } from 'react';
import { FileWarning, Calendar, DollarSign, HardHat, AlertCircle, ChevronDown } from 'lucide-react';
import type { DelayedProjectWithComputed } from '@/lib/delayed-projects/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import { AgencyBadge } from './shared';

interface DataQualityFlagsProps {
  projects: DelayedProjectWithComputed[];
}

interface FlagCategory {
  key: string;
  label: string;
  icon: typeof FileWarning;
  items: { id: string; name: string; shortName: string; agency: string }[];
}

export function DataQualityFlags({ projects }: DataQualityFlagsProps) {
  const categories = useMemo<FlagCategory[]>(() => {
    const noEndDate: FlagCategory['items'] = [];
    const noValue: FlagCategory['items'] = [];
    const noContractor: FlagCategory['items'] = [];
    const zeroOverdue: FlagCategory['items'] = [];

    for (const p of projects) {
      const item = {
        id: p.id,
        name: p.project_name,
        shortName: getShortName(p.project_name),
        agency: p.sub_agency,
      };

      if (!p.project_end_date) noEndDate.push(item);
      if (p.contract_value === 0) noValue.push(item);
      if (!p.contractors?.trim()) noContractor.push(item);
      if (p.completion_percent === 0 && (p.days_overdue ?? 0) > 0) zeroOverdue.push(item);
    }

    return [
      { key: 'no-date', label: 'No End Date', icon: Calendar, items: noEndDate },
      { key: 'no-value', label: 'No Contract Value', icon: DollarSign, items: noValue },
      { key: 'no-contractor', label: 'No Contractor', icon: HardHat, items: noContractor },
      { key: 'zero-overdue', label: '0% & Overdue', icon: AlertCircle, items: zeroOverdue },
    ];
  }, [projects]);

  const totalFlags = categories.reduce((sum, c) => sum + c.items.length, 0);

  const uniqueProjectIds = (() => {
    const ids = new Set<string>();
    for (const cat of categories) {
      for (const item of cat.items) ids.add(item.id);
    }
    return ids.size;
  })();

  if (totalFlags === 0) {
    return (
      <div className="card-premium p-4 space-y-3">
        <div className="flex items-center gap-2">
          <FileWarning className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-white">Data Quality</h3>
        </div>
        <p className="text-xs text-emerald-400">All project records are complete.</p>
      </div>
    );
  }

  return (
    <div className="card-premium p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileWarning className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-white">Data Quality Flags</h3>
      </div>

      <div className="space-y-1">
        {categories.map((cat) => (
          <FlagSection key={cat.key} category={cat} />
        ))}
      </div>

      <p className="text-[10px] text-navy-600 pt-1 border-t border-navy-800">
        {totalFlags} flag{totalFlags !== 1 ? 's' : ''} across {uniqueProjectIds} project{uniqueProjectIds !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function FlagSection({ category }: { category: FlagCategory }) {
  const [expanded, setExpanded] = useState(category.items.length > 0);
  const Icon = category.icon;
  const hasItems = category.items.length > 0;

  return (
    <div>
      <button
        onClick={() => hasItems && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 py-1.5 px-2 rounded-lg text-left transition-colors ${
          hasItems ? 'hover:bg-navy-900/50 cursor-pointer' : 'cursor-default opacity-50'
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${hasItems ? 'text-orange-400' : 'text-slate-600'}`} />
        <span className={`text-xs flex-1 ${hasItems ? 'text-white' : 'text-slate-600'}`}>
          {category.label}
        </span>
        <span className={`text-xs font-semibold min-w-[1.5rem] text-center px-1.5 py-0.5 rounded-full ${
          hasItems ? 'bg-red-500/20 text-red-400' : 'bg-navy-800 text-navy-600'
        }`}>
          {category.items.length}
        </span>
        {hasItems && (
          <ChevronDown className={`w-3 h-3 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>

      {expanded && hasItems && (
        <div className="pl-6 pr-1 pb-1 space-y-0.5">
          {category.items.map((item) => (
            <div key={item.id} className="flex items-center gap-1.5 py-0.5">
              <AgencyBadge agency={item.agency} />
              <span className="text-xs text-slate-400" title={item.name}>
                {item.shortName}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
