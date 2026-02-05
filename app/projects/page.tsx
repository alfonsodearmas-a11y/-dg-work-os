'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Upload,
  AlertTriangle,
  Building2,
  DollarSign,
  Clock,
  CheckCircle,
  ChevronDown,
  RefreshCw,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { ProjectUpload } from '@/components/projects/ProjectUpload';
import { LoadingSkeleton } from '@/components/intel/common/LoadingSkeleton';
import { Badge } from '@/components/ui/Badge';

interface AgencySummary {
  agency: string;
  total: number;
  completed: number;
  in_progress: number;
  delayed: number;
  cancelled: number;
  total_value: number;
  avg_completion: number;
}

const AGENCY_NAMES: Record<string, string> = {
  'GPL': 'Guyana Power & Light',
  'GWI': 'Guyana Water Inc.',
  'HECI': 'Hinterland Electrification',
  'CJIA': 'CJIA Airport',
  'MARAD': 'Maritime Administration',
  'GCAA': 'Civil Aviation Authority',
  'MOPUA': 'Ministry of Public Works',
  'HAS': 'Harbour & Aviation',
};

function formatCurrency(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

export default function ProjectsPage() {
  const [summary, setSummary] = useState<AgencySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [expandedAgency, setExpandedAgency] = useState<string | null>(null);
  const [agencyProjects, setAgencyProjects] = useState<Record<string, any[]>>({});
  const [loadingProjects, setLoadingProjects] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    fetchData();
  }, []);

  async function toggleAgency(agency: string) {
    if (expandedAgency === agency) {
      setExpandedAgency(null);
      return;
    }
    setExpandedAgency(agency);
    if (!agencyProjects[agency]) {
      setLoadingProjects(agency);
      try {
        const res = await fetch(`/api/projects?agency=${encodeURIComponent(agency)}`);
        const data = await res.json();
        setAgencyProjects(prev => ({ ...prev, [agency]: data || [] }));
      } catch {
        /* ignore */
      }
      setLoadingProjects(null);
    }
  }

  function getStatusVariant(status: string): 'success' | 'warning' | 'danger' | 'default' | 'gold' {
    switch (status) {
      case 'COMPLETED': return 'success';
      case 'DELAYED': return 'danger';
      case 'COMMENCED': return 'gold';
      case 'CANCELLED': return 'default';
      default: return 'default';
    }
  }

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/projects/summary');
      const data = await res.json();
      setSummary(data || []);
    } catch (error) {
      console.error('Failed to fetch project data:', error);
    } finally {
      setLoading(false);
    }
  }

  const totals = summary.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      completed: acc.completed + s.completed,
      inProgress: acc.inProgress + s.in_progress,
      delayed: acc.delayed + s.delayed,
      value: acc.value + s.total_value
    }),
    { total: 0, completed: 0, inProgress: 0, delayed: 0, value: 0 }
  );

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Project Tracker</h1>
          <p className="text-[#64748b] mt-1">Capital projects from oversight.gov.gy</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            className="btn-navy flex items-center space-x-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn-gold flex items-center space-x-2"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Excel</span>
          </button>
        </div>
      </div>

      {/* Upload Zone */}
      {showUpload && (
        <div className="card-premium p-6">
          <ProjectUpload onUploadComplete={() => {
            setShowUpload(false);
            fetchData();
          }} />
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="stat-number">{totals.total}</p>
          <p className="text-[#64748b] text-sm mt-1">Total Projects</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <Clock className="h-6 w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="stat-number">{totals.inProgress}</p>
          <p className="text-[#64748b] text-sm mt-1">In Progress</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-400" />
            </div>
          </div>
          <p className="stat-number text-red-400">{totals.delayed}</p>
          <p className="text-[#64748b] text-sm mt-1">Delayed</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
            </div>
          </div>
          <p className="stat-number text-emerald-400">{totals.completed}</p>
          <p className="text-[#64748b] text-sm mt-1">Completed</p>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="stat-number">{formatCurrency(totals.value)}</p>
          <p className="text-[#64748b] text-sm mt-1">Total Value</p>
        </div>
      </div>

      {/* Agency Cards */}
      <div>
        <h2 className="text-xl font-semibold text-white mb-4">Projects by Agency</h2>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <LoadingSkeleton type="projectCard" count={8} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary
              .sort((a, b) => b.total - a.total)
              .map((agency) => {
                const isExpanded = expandedAgency === agency.agency;
                const projects = agencyProjects[agency.agency] || [];
                const isLoadingThis = loadingProjects === agency.agency;

                return (
                  <div key={agency.agency} className="flex flex-col">
                    {/* Agency Card */}
                    <div
                      onClick={() => toggleAgency(agency.agency)}
                      className="card-premium agency-card p-6 cursor-pointer select-none"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h3 className="text-[#d4af37] font-bold text-xl">{agency.agency}</h3>
                          <p className="text-[#64748b] text-sm">{AGENCY_NAMES[agency.agency] || agency.agency}</p>
                        </div>
                        <ChevronDown
                          className={`h-5 w-5 text-[#64748b] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[#94a3b8]">Projects</span>
                          <span className="text-white font-semibold">{agency.total}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#94a3b8]">Value</span>
                          <span className="text-[#d4af37] font-semibold">{formatCurrency(agency.total_value)}</span>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-[#94a3b8]">Progress</span>
                          <span className="text-white font-semibold">{agency.avg_completion.toFixed(0)}%</span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-[#2d3a52] rounded-full h-2">
                          <div
                            className="progress-gold h-2"
                            style={{ width: `${Math.min(agency.avg_completion, 100)}%` }}
                          />
                        </div>

                        {/* Status Indicators */}
                        <div className="flex items-center space-x-4 pt-2 border-t border-[#2d3a52]">
                          <div className="flex items-center space-x-1">
                            <span className="status-dot commenced"></span>
                            <span className="text-xs text-[#94a3b8]">{agency.in_progress}</span>
                          </div>
                          {agency.delayed > 0 && (
                            <div className="flex items-center space-x-1">
                              <span className="status-dot delayed"></span>
                              <span className="text-xs text-red-400">{agency.delayed} delayed</span>
                            </div>
                          )}
                          {agency.completed > 0 && (
                            <div className="flex items-center space-x-1">
                              <span className="status-dot completed"></span>
                              <span className="text-xs text-emerald-400">{agency.completed}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expandable Project List */}
                    <div className={`collapse-grid ${isExpanded ? 'open' : ''}`}>
                      <div>
                        <div className="mt-1 rounded-b-xl border border-t-0 border-[#2d3a52] bg-[#1a2744]/80 p-4">
                          {isLoadingThis ? (
                            <div className="flex items-center justify-center py-6 gap-2">
                              <Loader2 className="h-4 w-4 text-[#d4af37] animate-spin" />
                              <span className="text-sm text-[#64748b]">Loading projects...</span>
                            </div>
                          ) : projects.length === 0 ? (
                            <p className="text-sm text-[#64748b] text-center py-4">No projects found.</p>
                          ) : (
                            <div className="space-y-1">
                              {projects.slice(0, 8).map((project: any) => (
                                <div
                                  key={project.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/projects/${project.id}`);
                                  }}
                                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-[#2d3a52]/50 cursor-pointer transition-colors group"
                                >
                                  <span className="text-sm text-[#94a3b8] truncate flex-1 group-hover:text-white transition-colors">
                                    {project.project_name}
                                  </span>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <Badge variant={getStatusVariant(project.project_status)}>
                                      {(project.project_status || 'Unknown').toLowerCase()}
                                    </Badge>
                                    <span className="text-xs text-[#64748b] font-mono w-16 text-right">
                                      {formatCurrency(project.contract_value || 0)}
                                    </span>
                                  </div>
                                </div>
                              ))}

                              {/* View All link */}
                              <Link
                                href={`/projects/agency/${agency.agency}`}
                                onClick={(e) => e.stopPropagation()}
                                className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-[#2d3a52] text-sm text-[#d4af37] hover:text-[#f4d03f] transition-colors"
                              >
                                <span>View All {agency.total} Projects</span>
                                <ArrowRight className="h-3.5 w-3.5" />
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
