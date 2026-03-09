'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Search, Filter, Clock, CheckCircle, XCircle,
  Eye, FileText, ChevronDown, ChevronLeft, ChevronRight, X,
  AlertTriangle,
} from 'lucide-react';

interface Application {
  id: string;
  agency: string;
  applicant_name: string;
  application_type: string;
  reference_number: string | null;
  status: string;
  priority: string;
  submitted_at: string;
  notes: string | null;
  docs_count: number;
  created_at: string;
}

interface Stats {
  pending: number;
  under_review: number;
  approved_30d: number;
  rejected_30d: number;
}

const STATUS_STYLES: Record<string, { bg: string; label: string }> = {
  pending: { bg: 'bg-amber-500/20 text-amber-400', label: 'Pending' },
  under_review: { bg: 'bg-blue-500/20 text-blue-400', label: 'Under Review' },
  approved: { bg: 'bg-green-500/20 text-green-400', label: 'Approved' },
  rejected: { bg: 'bg-red-500/20 text-red-400', label: 'Rejected' },
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-[#4a5568]/20 text-[#94a3b8]',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

const TYPE_OPTIONS = [
  'New Connection',
  'Meter Change',
  'Reconnection',
  'Service Upgrade',
  'Disconnection Review',
  'Billing Dispute',
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export default function ApplicationsPage() {
  const { data: session } = useSession();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats>({ pending: 0, under_review: 0, approved_30d: 0, rejected_30d: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (search) params.set('search', search);
    if (filterStatus) params.set('status', filterStatus);
    if (filterType) params.set('type', filterType);
    if (filterPriority) params.set('priority', filterPriority);

    try {
      const res = await fetch(`/api/applications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
        setStats(data.stats || { pending: 0, under_review: 0, approved_30d: 0, rejected_30d: 0 });
        setTotalPages(data.pages || 1);
        setTotal(data.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [page, search, filterStatus, filterType, filterPriority]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // Debounce search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const hasFilters = !!filterStatus || !!filterType || !!filterPriority;
  const clearFilters = () => { setFilterStatus(''); setFilterType(''); setFilterPriority(''); setPage(1); };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center flex-wrap gap-3">
        <Link
          href="/"
          className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Pending Applications</h1>
          <p className="text-sm text-[#64748b] mt-0.5">{total} total applications</p>
        </div>
        <Link
          href="/applications/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New Application</span>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-[#64748b]">Pending</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-[#64748b]">Under Review</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.under_review}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-xs text-[#64748b]">Approved (30d)</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{stats.approved_30d}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-[#64748b]">Rejected (30d)</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{stats.rejected_30d}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name or reference..."
            className="w-full pl-10 pr-4 py-2.5 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
            hasFilters ? 'border-[#d4af37]/50 text-[#d4af37] bg-[#d4af37]/10' : 'border-[#2d3a52] text-[#94a3b8] hover:text-white'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasFilters && (
            <span className="w-5 h-5 rounded-full bg-[#d4af37] text-[#0a1628] text-xs flex items-center justify-center font-bold">
              {[filterStatus, filterType, filterPriority].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-[#1a2744] border border-[#2d3a52]">
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => { setFilterPriority(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Priorities</option>
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="px-2.5 py-1.5 text-xs text-[#d4af37] hover:text-white transition-colors">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Table (desktop) / Cards (mobile) */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-[#64748b]">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No applications found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d3a52]">
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Reference</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Applicant</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Priority</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Submitted</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold uppercase text-[#64748b]">Docs</th>
                  </tr>
                </thead>
                <tbody>
                  {applications.map(app => (
                    <tr
                      key={app.id}
                      onClick={() => window.location.href = `/applications/${app.id}`}
                      className="border-b border-[#2d3a52]/50 cursor-pointer hover:bg-[#2d3a52]/10 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[#d4af37]">{app.reference_number || '\u2014'}</td>
                      <td className="px-4 py-3 text-white">{app.applicant_name}</td>
                      <td className="px-4 py-3 text-[#94a3b8]">{app.application_type}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_STYLES[app.priority] || PRIORITY_STYLES.normal}`}>
                          {app.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[app.status]?.bg || ''}`}>
                          {STATUS_STYLES[app.status]?.label || app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">{formatDate(app.submitted_at)}</td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">{app.docs_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-[#2d3a52]/50">
              {applications.map(app => (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="block p-4 hover:bg-[#2d3a52]/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium">{app.applicant_name}</p>
                      <p className="text-xs text-[#64748b]">{app.application_type}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${STATUS_STYLES[app.status]?.bg || ''}`}>
                      {STATUS_STYLES[app.status]?.label || app.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#64748b]">
                    {app.reference_number && (
                      <span className="font-mono text-[#d4af37]">{app.reference_number}</span>
                    )}
                    <span className={`px-1.5 py-0.5 rounded ${PRIORITY_STYLES[app.priority] || ''}`}>
                      {app.priority}
                    </span>
                    <span>{formatDate(app.submitted_at)}</span>
                    {app.docs_count > 0 && (
                      <span className="flex items-center gap-0.5"><FileText className="h-3 w-3" />{app.docs_count}</span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-[#64748b]">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-[#2d3a52] text-[#94a3b8] hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-[#2d3a52] text-[#94a3b8] hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
