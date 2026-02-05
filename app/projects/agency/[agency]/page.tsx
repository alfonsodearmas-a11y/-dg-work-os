'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, DollarSign, Clock, AlertTriangle, CheckCircle, ChevronRight, TrendingUp } from 'lucide-react';
import { format, addMonths } from 'date-fns';

const AGENCY_INFO: Record<string, { name: string; description: string }> = {
  'GPL': { name: 'Guyana Power & Light', description: 'Power generation and distribution' },
  'GWI': { name: 'Guyana Water Inc.', description: 'Water supply and sanitation' },
  'HECI': { name: 'Hinterland Electrification Company Inc.', description: 'Rural electrification projects' },
  'CJIA': { name: 'Cheddi Jagan International Airport', description: 'Airport infrastructure' },
  'MARAD': { name: 'Maritime Administration Department', description: 'Maritime infrastructure' },
  'GCAA': { name: 'Guyana Civil Aviation Authority', description: 'Aviation regulation' },
  'MOPUA': { name: 'Ministry of Public Works', description: 'Public infrastructure' },
  'HAS': { name: 'Harbour & Aviation Services', description: 'Port and aviation services' },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  'COMMENCED': { bg: 'bg-[#d4af37]/20', text: 'text-[#f4d03f]', dot: 'bg-[#d4af37]' },
  'DELAYED': { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
  'COMPLETED': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  'CANCELLED': { bg: 'bg-[#64748b]/20', text: 'text-[#94a3b8]', dot: 'bg-[#64748b]' },
  'ROLLOVER': { bg: 'bg-amber-500/20', text: 'text-amber-400', dot: 'bg-amber-500' },
};

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

export default function AgencyPage() {
  const params = useParams();
  const agency = params.agency as string;
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const agencyInfo = AGENCY_INFO[agency] || { name: agency, description: '' };

  useEffect(() => {
    fetchProjects();
  }, [agency]);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects?agency=${agency}`);
      const data = await res.json();
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProjects = statusFilter
    ? projects.filter(p => p.project_status === statusFilter)
    : projects;

  const stats = {
    total: projects.length,
    commenced: projects.filter(p => p.project_status === 'COMMENCED').length,
    delayed: projects.filter(p => p.project_status === 'DELAYED').length,
    completed: projects.filter(p => p.project_status === 'COMPLETED').length,
    totalValue: projects.reduce((sum, p) => sum + (p.contract_value || 0), 0),
    avgCompletion: projects.length > 0
      ? projects.reduce((sum, p) => sum + (p.completion_percent || 0), 0) / projects.length
      : 0,
  };

  const statusTabs = [
    { key: '', label: 'All', count: projects.length },
    { key: 'COMMENCED', label: 'In Progress', count: stats.commenced },
    { key: 'DELAYED', label: 'Delayed', count: stats.delayed },
    { key: 'COMPLETED', label: 'Completed', count: stats.completed },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start space-x-4">
        <Link
          href="/projects"
          className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#b8860b] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#0a1628]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">{agency}</h1>
              <p className="text-[#64748b]">{agencyInfo.name}</p>
            </div>
          </div>
          <p className="text-[#94a3b8] mt-2">{agencyInfo.description}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-premium p-5">
          <p className="stat-number">{stats.total}</p>
          <p className="text-[#64748b] text-sm mt-1">Total Projects</p>
        </div>
        <div className="card-premium p-5">
          <p className="stat-number">{stats.commenced}</p>
          <p className="text-[#64748b] text-sm mt-1">In Progress</p>
        </div>
        <div className="card-premium p-5">
          <p className="stat-number text-red-400">{stats.delayed}</p>
          <p className="text-[#64748b] text-sm mt-1">Delayed</p>
        </div>
        <div className="card-premium p-5">
          <p className="stat-number text-emerald-400">{stats.completed}</p>
          <p className="text-[#64748b] text-sm mt-1">Completed</p>
        </div>
        <div className="card-premium p-5">
          <p className="stat-number">{formatCurrency(stats.totalValue)}</p>
          <p className="text-[#64748b] text-sm mt-1">Total Value</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-[#2d3a52]">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-3 font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? 'border-[#d4af37] text-[#d4af37]'
                : 'border-transparent text-[#64748b] hover:text-white'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12 text-[#64748b]">
          No projects found
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects
            .sort((a, b) => (b.contract_value || 0) - (a.contract_value || 0))
            .map((project) => {
              const statusStyle = STATUS_STYLES[project.project_status] || STATUS_STYLES['COMMENCED'];
              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="card-premium p-5 block hover:border-[#d4af37]/50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                          {project.project_status || 'Unknown'}
                        </span>
                        <span className="text-[#64748b] text-xs font-mono">{project.project_reference}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-white truncate">{project.project_name}</h3>
                      <p className="text-[#94a3b8] mt-1">{project.contractor || 'No contractor assigned'}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="text-xl font-bold text-[#d4af37]">{formatCurrency(project.contract_value)}</p>
                      <div className="flex items-center justify-end space-x-2 mt-2">
                        <div className="w-20 bg-[#2d3a52] rounded-full h-2">
                          <div
                            className="progress-gold h-2"
                            style={{ width: `${Math.min(project.completion_percent || 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-white">{project.completion_percent || 0}%</span>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[#64748b] ml-4 flex-shrink-0" />
                  </div>
                  <div className="flex items-center space-x-6 mt-4 pt-4 border-t border-[#2d3a52] text-sm text-[#64748b]">
                    <span>Region: {project.region || '-'}</span>
                    <span>Start: {formatDate(project.agreement_start_date)}</span>
                    <span>End: {project.expected_end_date ? formatDate(project.expected_end_date) : calculateEndDate(project.agreement_start_date, project.duration_months)}</span>
                    <span>Duration: {project.duration_months ? `${project.duration_months} months` : '-'}</span>
                  </div>
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}
