'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Search, ChevronDown, Clock,
  CheckCircle, XCircle, AlertTriangle, Filter,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

interface LogEntry {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  object_type: string | null;
  object_id: string | null;
  object_name: string | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  result: 'success' | 'denied' | 'error';
  denial_reason: string | null;
  created_at: string;
}

const RESULT_STYLES = {
  success: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
  denied: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  error: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

const ACTION_LABELS: Record<string, string> = {
  invite_user: 'Invited user',
  update_user: 'Updated user',
  delete_user: 'Deleted user',
  grant_access: 'Granted access',
  revoke_access: 'Revoked access',
  delegate_permission: 'Delegated permission',
};

interface Props {
  hasPermission: boolean;
}

export function ActivityLogPanel({ hasPermission }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState('');
  const [filterResult, setFilterResult] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const fetchLogs = useCallback(async () => {
    if (!hasPermission) { setLoading(false); return; }
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    if (filterAction) params.set('action', filterAction);

    try {
      const res = await fetch(`/api/people/activity?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {
      setLogs([]);
    }
    setLoading(false);
  }, [hasPermission, limit, offset, filterAction]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[#64748b]">
        <Activity className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">You don&apos;t have permission to view activity logs</p>
        <p className="text-xs mt-1">Requires audit.read permission</p>
      </div>
    );
  }

  const filteredLogs = logs.filter(l => {
    if (filterResult && l.result !== filterResult) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        l.user_name.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.object_name || '').toLowerCase().includes(q) ||
        (l.object_type || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[#d4af37]" />
          <h2 className="text-lg font-semibold text-white">Activity Log</h2>
          <span className="text-xs text-[#64748b]">({filteredLogs.length})</span>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            filterAction || filterResult
              ? 'border-[#d4af37]/50 text-[#d4af37] bg-[#d4af37]/10'
              : 'border-[#2d3a52] text-[#64748b] hover:text-white'
          }`}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </button>
      </div>

      {/* Search + Filters */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search activity..."
          className="w-full pl-9 pr-4 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-[#1a2744] border border-[#2d3a52]">
          <select
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setOffset(0); }}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Actions</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={filterResult}
            onChange={e => setFilterResult(e.target.value)}
            className="px-3 py-1.5 bg-[#0a1628] border border-[#2d3a52] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
          >
            <option value="">All Results</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="error">Error</option>
          </select>
          {(filterAction || filterResult) && (
            <button
              onClick={() => { setFilterAction(''); setFilterResult(''); }}
              className="px-2.5 py-1.5 text-xs text-[#d4af37] hover:text-white transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Log entries */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-[#64748b]">
            <Activity className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No activity logged yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[#2d3a52]/50">
            {filteredLogs.map(log => {
              const style = RESULT_STYLES[log.result] || RESULT_STYLES.success;
              const ResultIcon = style.icon;

              return (
                <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${style.bg}`}>
                    <ResultIcon className={`h-3.5 w-3.5 ${style.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-white font-medium">{log.user_name}</span>
                      <span className="text-xs text-[#94a3b8]">
                        {ACTION_LABELS[log.action] || log.action}
                      </span>
                      {log.object_name && (
                        <span className="text-xs text-[#64748b] font-mono">{log.object_name}</span>
                      )}
                    </div>

                    {log.denial_reason && (
                      <p className="text-xs text-red-400 mt-0.5">{log.denial_reason}</p>
                    )}

                    {log.changes && Object.keys(log.changes).length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {Object.entries(log.changes).map(([key, value]) => (
                          <ChangeEntry key={key} field={key} value={value} />
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1 mt-1 text-[10px] text-[#4a5568]">
                      <Clock className="h-2.5 w-2.5" />
                      {formatDistanceToNow(parseISO(log.created_at), { addSuffix: true })}
                      {log.object_type && (
                        <span className="ml-2 font-mono">{log.object_type}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {filteredLogs.length >= limit && (
        <div className="flex items-center justify-center gap-3">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1.5 rounded border border-[#2d3a52] text-xs text-[#64748b] hover:text-white disabled:opacity-30 transition-colors"
          >
            Previous
          </button>
          <span className="text-xs text-[#64748b]">
            Showing {offset + 1}–{offset + filteredLogs.length}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1.5 rounded border border-[#2d3a52] text-xs text-[#64748b] hover:text-white transition-colors"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function ChangeEntry({ field, value }: { field: string; value: unknown }) {
  if (typeof value === 'object' && value !== null && 'from' in value && 'to' in value) {
    const v = value as { from: unknown; to: unknown };
    return (
      <p className="text-[10px] text-[#64748b]">
        <span className="font-mono text-[#94a3b8]">{field}</span>:{' '}
        <span className="text-red-400/70 line-through">{String(v.from || '—')}</span>
        {' → '}
        <span className="text-green-400">{String(v.to || '—')}</span>
      </p>
    );
  }
  return (
    <p className="text-[10px] text-[#64748b]">
      <span className="font-mono text-[#94a3b8]">{field}</span>: {String(value)}
    </p>
  );
}
