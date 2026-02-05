'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  AlertTriangle,
  TrendingUp,
  Building2,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  ChevronRight,
  RefreshCw
} from 'lucide-react';
import { ProjectUpload } from '@/components/projects/ProjectUpload';

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

  useEffect(() => {
    fetchData();
  }, []);

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
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {summary
              .sort((a, b) => b.total - a.total)
              .map((agency) => (
                <Link
                  key={agency.agency}
                  href={`/projects/agency/${agency.agency}`}
                  className="card-premium agency-card p-6 block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-[#d4af37] font-bold text-xl">{agency.agency}</h3>
                      <p className="text-[#64748b] text-sm">{AGENCY_NAMES[agency.agency] || agency.agency}</p>
                    </div>
                    <ChevronRight className="h-5 w-5 text-[#64748b]" />
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
                </Link>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
