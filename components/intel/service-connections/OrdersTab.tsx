'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Loader2, Filter } from 'lucide-react';
import type { ServiceConnection, StageHistoryEntry } from '@/lib/service-connection-types';

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-500/20 text-blue-400',
  completed: 'bg-emerald-500/20 text-emerald-400',
  cancelled: 'bg-red-500/20 text-red-400',
  legacy_excluded: 'bg-gray-500/20 text-gray-400',
};

const TRACK_LABELS: Record<string, string> = {
  A: 'Track A',
  B: 'Track B',
  unknown: '—',
};

export function OrdersTab() {
  const [orders, setOrders] = useState<ServiceConnection[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  // Filters
  const [status, setStatus] = useState('');
  const [track, setTrack] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const pageSize = 30;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (status) params.set('status', status);
    if (track) params.set('track', track);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/service-connections/list?${params}`);
      if (res.ok) {
        const json = await res.json();
        setOrders(json.data || []);
        setTotal(json.total || 0);
        setTotalPages(json.totalPages || 1);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [page, status, track, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  // Split legacy orders
  const regularOrders = orders.filter(o => o.status !== 'legacy_excluded');
  const legacyOrders = orders.filter(o => o.status === 'legacy_excluded');

  return (
    <div className="space-y-4">
      {/* Search + Filters */}
      <div className="card-premium p-3 md:p-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748b]" />
            <input
              type="text"
              placeholder="Search by name, customer ref, or SO#..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm placeholder-[#64748b] focus:border-[#d4af37] focus:outline-none"
            />
          </div>
          <button onClick={handleSearch} className="btn-navy px-4 py-2 text-sm">Search</button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-lg border ${showFilters ? 'border-[#d4af37] text-[#d4af37]' : 'border-[#2d3a52] text-[#64748b]'}`}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        {showFilters && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[#2d3a52]">
            <select
              value={status}
              onChange={e => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">All Status</option>
              <option value="open">Open</option>
              <option value="completed">Completed</option>
              <option value="legacy_excluded">Legacy</option>
            </select>
            <select
              value={track}
              onChange={e => { setTrack(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] text-white text-sm focus:border-[#d4af37] focus:outline-none"
            >
              <option value="">All Tracks</option>
              <option value="A">Track A</option>
              <option value="B">Track B</option>
              <option value="unknown">Unknown</option>
            </select>
            {(status || track || search) && (
              <button
                onClick={() => { setStatus(''); setTrack(''); setSearch(''); setSearchInput(''); setPage(1); }}
                className="text-xs text-[#d4af37] hover:text-[#f0d060]"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="card-premium p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
          </div>
        ) : regularOrders.length === 0 && legacyOrders.length === 0 ? (
          <p className="text-center text-[#64748b] py-8">No orders found matching your criteria.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d3a52]">
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs w-8" />
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs">Customer</th>
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">SO #</th>
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs">Stage</th>
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden md:table-cell">Track</th>
                    <th className="text-left py-2 text-[#64748b] font-medium text-xs hidden lg:table-cell">Region</th>
                    <th className="text-right py-2 text-[#64748b] font-medium text-xs">Days</th>
                    <th className="text-right py-2 text-[#64748b] font-medium text-xs">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {regularOrders.map(order => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      expanded={expanded === order.id}
                      onToggle={() => setExpanded(expanded === order.id ? null : order.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#2d3a52]">
                <span className="text-xs text-[#64748b]">{total} orders · Page {page} of {totalPages}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg bg-[#0a1628] border border-[#2d3a52] hover:border-[#d4af37] text-[#94a3b8] disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Legacy Orders */}
            {legacyOrders.length > 0 && (
              <div className="mt-6 pt-4 border-t border-[#2d3a52]">
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-sm text-[#64748b] hover:text-[#94a3b8]">
                    <ChevronRight className="h-4 w-4 group-open:rotate-90 transition-transform" />
                    <span>{legacyOrders.length} legacy orders (pre-2015, excluded from metrics)</span>
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm opacity-60">
                      <tbody>
                        {legacyOrders.map(order => (
                          <tr key={order.id} className="border-b border-[#2d3a52]/30">
                            <td className="py-2 text-[#64748b]">
                              {order.first_name} {order.last_name}
                            </td>
                            <td className="py-2 text-[#64748b]">{order.customer_reference}</td>
                            <td className="py-2 text-[#64748b]">{order.current_stage}</td>
                            <td className="py-2 text-right text-[#64748b]">{order.application_date}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderRow({ order, expanded, onToggle }: {
  order: ServiceConnection;
  expanded: boolean;
  onToggle: () => void;
}) {
  const name = `${order.first_name || ''} ${order.last_name || ''}`.trim() || '—';
  const daysDisplay = order.status === 'completed'
    ? order.total_days_to_complete
    : order.application_date
      ? Math.round((Date.now() - new Date(order.application_date + 'T00:00:00Z').getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return (
    <>
      <tr
        className="border-b border-[#2d3a52]/50 hover:bg-[#1a2744]/50 cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2.5">
          {expanded
            ? <ChevronUp className="h-3.5 w-3.5 text-[#64748b]" />
            : <ChevronDown className="h-3.5 w-3.5 text-[#64748b]" />}
        </td>
        <td className="py-2.5">
          <div className="text-white text-xs font-medium">{name}</div>
          <div className="text-[10px] text-[#64748b]">{order.customer_reference}</div>
        </td>
        <td className="py-2.5 text-[#94a3b8] text-xs hidden md:table-cell">{order.service_order_number || '—'}</td>
        <td className="py-2.5 text-[#94a3b8] text-xs">{order.current_stage || '—'}</td>
        <td className="py-2.5 text-xs hidden md:table-cell">
          <span className={order.track === 'A' ? 'text-emerald-400' : order.track === 'B' ? 'text-amber-400' : 'text-[#64748b]'}>
            {TRACK_LABELS[order.track]}
          </span>
        </td>
        <td className="py-2.5 text-[#94a3b8] text-xs hidden lg:table-cell">{order.region || '—'}</td>
        <td className="py-2.5 text-right text-xs text-[#94a3b8]">{daysDisplay !== null ? `${daysDisplay}d` : '—'}</td>
        <td className="py-2.5 text-right">
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[order.status] || ''}`}>
            {order.status}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="py-3 px-4 bg-[#0f1d35]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
              <div><span className="text-[#64748b]">Application Date:</span> <span className="text-white">{order.application_date || '—'}</span></div>
              <div><span className="text-[#64748b]">Account Type:</span> <span className="text-white">{order.account_type || '—'}</span></div>
              <div><span className="text-[#64748b]">SO Type:</span> <span className="text-white">{order.service_order_type || '—'}</span></div>
              <div><span className="text-[#64748b]">First Seen:</span> <span className="text-white">{order.first_seen_date || '—'}</span></div>
              <div><span className="text-[#64748b]">Last Seen:</span> <span className="text-white">{order.last_seen_date || '—'}</span></div>
              {order.disappeared_date && (
                <div><span className="text-[#64748b]">Completed:</span> <span className="text-emerald-400">{order.disappeared_date}</span></div>
              )}
              {order.linked_so_number && (
                <div><span className="text-[#64748b]">Linked SO:</span> <span className="text-amber-400">{order.linked_so_number}</span></div>
              )}
              <div><span className="text-[#64748b]">Region:</span> <span className="text-white">{order.region || '—'}</span></div>
            </div>

            {/* Stage History Timeline */}
            {order.stage_history && order.stage_history.length > 0 && (
              <div>
                <span className="text-[#64748b] text-xs font-medium">Stage History</span>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {(order.stage_history as StageHistoryEntry[]).map((entry, i) => (
                    <div key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-[#2d3a52]">→</span>}
                      <span className="px-2 py-1 rounded bg-[#1a2744] border border-[#2d3a52] text-[10px]">
                        <span className="text-white">{entry.stage}</span>
                        {entry.days !== null && (
                          <span className="text-[#64748b] ml-1">({entry.days}d)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
