'use client';

import { useState } from 'react';
import { format, addMonths } from 'date-fns';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

const AGENCY_COLORS: Record<string, string> = {
  'GPL': 'bg-yellow-100 text-yellow-800',
  'GWI': 'bg-blue-100 text-blue-800',
  'HECI': 'bg-green-100 text-green-800',
  'CJIA': 'bg-purple-100 text-purple-800',
  'MARAD': 'bg-cyan-100 text-cyan-800',
  'GCAA': 'bg-orange-100 text-orange-800',
  'MOPUA': 'bg-pink-100 text-pink-800',
  'HAS': 'bg-indigo-100 text-indigo-800',
};

const STATUS_COLORS: Record<string, string> = {
  'COMMENCED': 'bg-blue-100 text-blue-800',
  'DELAYED': 'bg-red-100 text-red-800',
  'COMPLETED': 'bg-green-100 text-green-800',
  'CANCELLED': 'bg-gray-100 text-gray-800',
  'ROLLOVER': 'bg-yellow-100 text-yellow-800',
};

interface Project {
  id: string;
  project_reference: string;
  project_name: string;
  sub_agency: string | null;
  region: string | null;
  contract_value: number | null;
  contractor: string | null;
  completion_percent: number | null;
  project_status: string | null;
  allocated_balance: number | null;
  total_expenditure: number | null;
  contract_awarded_date: string | null;
  agreement_start_date: string | null;
  expected_end_date: string | null;
  duration_months: number | null;
  remarks: string | null;
}

interface ProjectListProps {
  projects: Project[];
}

function formatCurrency(value: number | null): string {
  if (!value) return '-';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toLocaleString()}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr || dateStr === '1970-01-01') return '-';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    return '-';
  }
}

function calculateEndDate(startDate: string | null, durationMonths: number | null): string {
  if (!startDate || startDate === '1970-01-01' || !durationMonths) return '-';
  try {
    const end = addMonths(new Date(startDate), durationMonths);
    return format(end, 'MMM d, yyyy');
  } catch {
    return '-';
  }
}

export function ProjectList({ projects }: ProjectListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<string>('contract_value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedProjects = [...projects].sort((a, b) => {
    const aVal = a[sortField as keyof Project];
    const bVal = b[sortField as keyof Project];
    if (aVal === null) return 1;
    if (bVal === null) return -1;
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  if (projects.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No projects found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-600">
        <div className="col-span-1">Agency</div>
        <div className="col-span-3 cursor-pointer hover:text-gray-900" onClick={() => handleSort('project_name')}>
          Project Name {sortField === 'project_name' && (sortDir === 'asc' ? '↑' : '↓')}
        </div>
        <div className="col-span-2">Contractor</div>
        <div className="col-span-1">Status</div>
        <div className="col-span-1 text-right cursor-pointer hover:text-gray-900" onClick={() => handleSort('completion_percent')}>
          Progress {sortField === 'completion_percent' && (sortDir === 'asc' ? '↑' : '↓')}
        </div>
        <div className="col-span-2 text-right cursor-pointer hover:text-gray-900" onClick={() => handleSort('contract_value')}>
          Value {sortField === 'contract_value' && (sortDir === 'asc' ? '↑' : '↓')}
        </div>
        <div className="col-span-2">End Date</div>
      </div>

      {/* Projects */}
      {sortedProjects.map((project) => (
        <div key={project.id} className="border rounded-lg bg-white overflow-hidden">
          {/* Main Row */}
          <div
            className="grid grid-cols-12 gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 items-center"
            onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
          >
            <div className="col-span-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${AGENCY_COLORS[project.sub_agency || ''] || 'bg-gray-100 text-gray-800'}`}>
                {project.sub_agency || '-'}
              </span>
            </div>
            <div className="col-span-3">
              <p className="font-medium text-gray-900 truncate">{project.project_name}</p>
              <p className="text-xs text-gray-500 font-mono">{project.project_reference}</p>
            </div>
            <div className="col-span-2 text-sm text-gray-700 truncate">
              {project.contractor || '-'}
            </div>
            <div className="col-span-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[project.project_status || ''] || 'bg-gray-100 text-gray-800'}`}>
                {project.project_status || '-'}
              </span>
            </div>
            <div className="col-span-1 text-right">
              <div className="flex items-center justify-end space-x-2">
                <div className="w-12 bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${project.project_status === 'DELAYED' ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min(project.completion_percent || 0, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium">{project.completion_percent || 0}%</span>
              </div>
            </div>
            <div className="col-span-2 text-right font-medium">
              {formatCurrency(project.contract_value)}
            </div>
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {project.expected_end_date
                  ? formatDate(project.expected_end_date)
                  : calculateEndDate(project.agreement_start_date, project.duration_months)}
              </span>
              {expandedId === project.id ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </div>
          </div>

          {/* Expanded Details */}
          {expandedId === project.id && (
            <div className="px-4 py-4 bg-gray-50 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Region</p>
                <p className="font-medium">{project.region || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Contract Awarded</p>
                <p className="font-medium">{formatDate(project.contract_awarded_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Start Date</p>
                <p className="font-medium">{formatDate(project.agreement_start_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Duration</p>
                <p className="font-medium">{project.duration_months ? `${project.duration_months} months` : '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">Allocated Balance</p>
                <p className="font-medium">{formatCurrency(project.allocated_balance)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Expenditure</p>
                <p className="font-medium">{formatCurrency(project.total_expenditure)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-gray-500">Remarks</p>
                <p className="font-medium">{project.remarks || 'No remarks'}</p>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
