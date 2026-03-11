'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Plus, Search, Filter, Clock, CheckCircle, XCircle,
  Eye, FileText, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X,
  AlertTriangle, Download,
} from 'lucide-react';
import { exportToCsv } from '@/lib/export-csv';
import { Spinner } from '@/components/ui/Spinner';

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
  normal: 'bg-navy-700/20 text-slate-400',
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
  const [sortField, setSortField] = useState<string>('submitted_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const STATUS_ORDER: Record<string, number> = { pending: 0, under_review: 1, approved: 2, rejected: 3 };

  const sortedApplications = useMemo(() => {
    return [...applications].sort((a, b) => {
      let cmp = 0;
      const fa = sortField as keyof Application;
      const va = a[fa];
      const vb = b[fa];
      if (fa === 'priority') {
        cmp = (PRIORITY_ORDER[String(va)] ?? 9) - (PRIORITY_ORDER[String(vb)] ?? 9);
      } else if (fa === 'status') {
        cmp = (STATUS_ORDER[String(va)] ?? 9) - (STATUS_ORDER[String(vb)] ?? 9);
      } else if (fa === 'submitted_at' || fa === 'created_at') {
        cmp = new Date(String(va || '')).getTime() - new Date(String(vb || '')).getTime();
      } else {
        cmp = String(va || '').localeCompare(String(vb || ''));
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [applications, sortField, sortDir]);

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
          className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Pending Applications</h1>
          <p className="text-sm text-navy-600 mt-0.5">{total} total applications</p>
        </div>
        <button
          onClick={() =>
            exportToCsv('applications.csv', sortedApplications.map(a => ({
              Reference: a.reference_number || '',
              Applicant: a.applicant_name,
              Type: a.application_type,
              Priority: a.priority,
              Status: a.status,
              Submitted: a.submitted_at,
              Docs: a.docs_count,
            })))
          }
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-navy-800 text-slate-400 hover:text-white hover:border-gold-500/50 transition-colors text-sm"
          aria-label="Export applications to CSV"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </button>
        <Link
          href="/applications/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors text-sm font-medium"
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
            <span className="text-xs text-navy-600">Pending</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">{stats.pending}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-navy-600">Under Review</span>
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.under_review}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-green-400" />
            <span className="text-xs text-navy-600">Approved (30d)</span>
          </div>
          <p className="text-2xl font-bold text-green-400">{stats.approved_30d}</p>
        </div>
        <div className="card-premium p-4">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-400" />
            <span className="text-xs text-navy-600">Rejected (30d)</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{stats.rejected_30d}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-600" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by name or reference..."
            className="w-full pl-10 pr-4 py-2.5 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
            hasFilters ? 'border-gold-500/50 text-gold-500 bg-gold-500/10' : 'border-navy-800 text-slate-400 hover:text-white'
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasFilters && (
            <span className="w-5 h-5 rounded-full bg-gold-500 text-navy-950 text-xs flex items-center justify-center font-bold">
              {[filterStatus, filterType, filterPriority].filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-navy-900 border border-navy-800">
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={e => { setFilterPriority(e.target.value); setPage(1); }}
            className="px-3 py-1.5 bg-navy-950 border border-navy-800 rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-gold-500/50"
          >
            <option value="">All Priorities</option>
            {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {hasFilters && (
            <button onClick={clearFilters} className="px-2.5 py-1.5 text-xs text-gold-500 hover:text-white transition-colors">
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Table (desktop) / Cards (mobile) */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center py-12 text-navy-600">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No applications found</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-800">
                    {([
                      { field: 'reference_number', label: 'Reference' },
                      { field: 'applicant_name', label: 'Applicant' },
                      { field: 'application_type', label: 'Type' },
                      { field: 'priority', label: 'Priority' },
                      { field: 'status', label: 'Status' },
                      { field: 'submitted_at', label: 'Submitted' },
                      { field: 'docs_count', label: 'Docs' },
                    ] as const).map(col => (
                      <th
                        key={col.field}
                        className="text-left px-4 py-3 text-xs font-semibold uppercase text-navy-600 cursor-pointer select-none hover:text-white transition-colors"
                        onClick={() => handleSort(col.field)}
                        aria-sort={sortField === col.field ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortField === col.field && (
                            sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-gold-500" /> : <ChevronDown className="h-3 w-3 text-gold-500" />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedApplications.map(app => (
                    <tr
                      key={app.id}
                      onClick={() => window.location.href = `/applications/${app.id}`}
                      className="border-b border-navy-800/50 cursor-pointer hover:bg-navy-800/10 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gold-500">{app.reference_number || '\u2014'}</td>
                      <td className="px-4 py-3 text-white">{app.applicant_name}</td>
                      <td className="px-4 py-3 text-slate-400">{app.application_type}</td>
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
                      <td className="px-4 py-3 text-xs text-navy-600">{formatDate(app.submitted_at)}</td>
                      <td className="px-4 py-3 text-xs text-navy-600">{app.docs_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-navy-800/50">
              {sortedApplications.map(app => (
                <Link
                  key={app.id}
                  href={`/applications/${app.id}`}
                  className="block p-4 hover:bg-navy-800/10 transition-colors"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="text-white font-medium">{app.applicant_name}</p>
                      <p className="text-xs text-navy-600">{app.application_type}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 ${STATUS_STYLES[app.status]?.bg || ''}`}>
                      {STATUS_STYLES[app.status]?.label || app.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-navy-600">
                    {app.reference_number && (
                      <span className="font-mono text-gold-500">{app.reference_number}</span>
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
          <p className="text-xs text-navy-600">
            Page {page} of {totalPages} ({total} total)
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-2 rounded-lg border border-navy-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-2 rounded-lg border border-navy-800 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
