'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Filter, Search, X, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { format, addMonths } from 'date-fns';

const AGENCIES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'MOPUA', 'HAS'];
const STATUSES = ['COMMENCED', 'DELAYED', 'COMPLETED', 'CANCELLED', 'ROLLOVER'];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  'COMMENCED': { bg: 'bg-[#d4af37]/20', text: 'text-[#f4d03f]' },
  'DELAYED': { bg: 'bg-red-500/20', text: 'text-red-400' },
  'COMPLETED': { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  'CANCELLED': { bg: 'bg-[#64748b]/20', text: 'text-[#94a3b8]' },
  'ROLLOVER': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
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

export default function ProjectListPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [agencyFilter, setAgencyFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data || []);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProjects = projects.filter((p) => {
    if (agencyFilter && p.sub_agency !== agencyFilter) return false;
    if (statusFilter && p.project_status !== statusFilter) return false;
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        p.project_name?.toLowerCase().includes(search) ||
        p.project_reference?.toLowerCase().includes(search) ||
        p.contractor?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const hasFilters = agencyFilter || statusFilter || searchTerm;

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
        <div>
          <h1 className="text-3xl font-bold text-white">All Projects</h1>
          <p className="text-[#64748b] mt-1">{filteredProjects.length} of {projects.length} projects</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card-premium p-6">
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex items-center space-x-2 text-[#64748b]">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search projects, contractors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white placeholder-[#64748b] focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors"
            />
            <Search className="absolute left-3 top-3 h-4 w-4 text-[#64748b]" />
          </div>

          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="px-4 py-2.5 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors"
          >
            <option value="" className="bg-[#1a2744]">All Agencies</option>
            {AGENCIES.map((a) => (
              <option key={a} value={a} className="bg-[#1a2744]">{a}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 bg-[#1a2744] border border-[#2d3a52] rounded-xl text-white focus:ring-2 focus:ring-[#d4af37] focus:border-[#d4af37] transition-colors"
          >
            <option value="" className="bg-[#1a2744]">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s} className="bg-[#1a2744]">{s}</option>
            ))}
          </select>

          {hasFilters && (
            <button
              onClick={() => {
                setAgencyFilter('');
                setStatusFilter('');
                setSearchTerm('');
              }}
              className="flex items-center space-x-1 text-sm text-[#d4af37] hover:text-[#f4d03f] transition-colors"
            >
              <X className="h-4 w-4" />
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>

      {/* Project List */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <p className="text-[#94a3b8]">No projects found</p>
          {hasFilters && (
            <button
              onClick={() => {
                setAgencyFilter('');
                setStatusFilter('');
                setSearchTerm('');
              }}
              className="text-[#d4af37] hover:underline mt-2"
            >
              Clear filters
            </button>
          )}
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
                  className="card-premium p-5 block hover:border-[#d4af37]/50 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-3 mb-2">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-[#0a1628]">
                          {project.sub_agency}
                        </span>
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
