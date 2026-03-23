'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import FeederHealthTable from './components/FeederHealthTable';
import MonthlyPerformance from './components/MonthlyPerformance';
import TodayGrid from './components/TodayGrid';
import FeederDetailDrawer from './components/FeederDetailDrawer';
import { GPL_CONFIG } from '@/lib/gpl/config';
import { fmtRelativeTime } from '@/lib/format';

// ── Types ───────────────────────────────────────────────────────────────────

type TabId = 'feeders' | 'monthly' | 'today';

interface FeederSummaryRow {
  feeder_id: number;
  feeder_code: string;
  health: { outages_30d: number };
}

// ── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  alert,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="card-premium p-4 flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-navy-600 font-semibold">
        {label}
      </span>
      <span
        className={`text-2xl font-bold tabular-nums ${
          alert ? 'text-red-400' : 'text-white'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="card-premium p-4 animate-pulse">
          <div className="h-2 w-16 rounded bg-navy-800 mb-3" />
          <div className="h-6 w-12 rounded bg-navy-800" />
        </div>
      ))}
    </div>
  );
}

// ── Tab config ──────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'feeders', label: 'Feeders' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'today', label: 'Today' },
];

const KNOWN_SUBSTATIONS = new Set(Object.keys(GPL_CONFIG.substationNames));

// ── Page content (needs Suspense for useSearchParams) ───────────────────────

function GridHealthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab from URL
  const rawTab = searchParams.get('tab');
  const activeTab: TabId =
    rawTab === 'monthly' || rawTab === 'today' ? rawTab : 'feeders';

  function setActiveTab(tab: TabId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }

  // Drawer state
  const [selectedFeederId, setSelectedFeederId] = useState<number | null>(null);
  const drawerOpen = selectedFeederId !== null;

  // Cross-tab state
  const [todayDateRange, setTodayDateRange] = useState<string | undefined>();
  const [feederSubstationFilter, setFeederSubstationFilter] = useState('');

  // Overview data
  const [scoreData, setScoreData] = useState<{
    outage_count_30d: number;
    avg_restoration_min: number;
    last_synced: string;
    stale?: boolean;
  } | null>(null);
  const [activeOutages, setActiveOutages] = useState(0);
  const [customersAtRisk, setCustomersAtRisk] = useState(0);
  const [repeatOffenders, setRepeatOffenders] = useState(0);
  const [feederCodeMap, setFeederCodeMap] = useState<Map<string, number>>(
    new Map(),
  );
  const [metricsLoading, setMetricsLoading] = useState(true);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const hasAutoSynced = useRef(false);

  // ── Fetch overview metrics ────────────────────────────────────────────────

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const [scoreRes, todayRes, feedersRes] = await Promise.all([
        fetch('/api/pulse/gpl/score'),
        fetch('/api/pulse/gpl/today'),
        fetch('/api/pulse/gpl/feeders'),
      ]);

      if (scoreRes.ok) {
        const s = await scoreRes.json();
        setScoreData(s);
      }

      if (todayRes.ok) {
        const t = await todayRes.json();
        setActiveOutages(t.summary?.active ?? 0);
        const risk = (t.outages ?? [])
          .filter((o: { status: string }) => o.status === 'open')
          .reduce(
            (sum: number, o: { customers_affected: number }) =>
              sum + (o.customers_affected ?? 0),
            0,
          );
        setCustomersAtRisk(risk);
      }

      if (feedersRes.ok) {
        const f = await feedersRes.json();
        const feeders: FeederSummaryRow[] = f.feeders ?? [];
        setRepeatOffenders(
          feeders.filter((fd) => fd.health.outages_30d >= 3).length,
        );
        const codeMap = new Map<string, number>();
        for (const fd of feeders) {
          codeMap.set(fd.feeder_code, fd.feeder_id);
        }
        setFeederCodeMap(codeMap);
      }
    } catch {
      /* metrics are supplementary */
    }
    setMetricsLoading(false);
  }, []);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics, refreshKey]);

  // ── Sync ──────────────────────────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/pulse/gpl/sync', { method: 'POST' });
      if (res.ok) setRefreshKey((k) => k + 1);
    } catch {
      /* non-blocking */
    }
    setSyncing(false);
  }, []);

  // Auto-sync if stale on first load (once only)
  useEffect(() => {
    if (scoreData?.stale && !hasAutoSynced.current) {
      hasAutoSynced.current = true;
      handleSync();
    }
  }, [scoreData?.stale, handleSync]);

  // ── Cross-component handlers ──────────────────────────────────────────────

  function handleNavigateToday(dateRange: { from: string; to: string }) {
    setTodayDateRange(`${dateRange.from}/${dateRange.to}`);
    setActiveTab('today');
  }

  function handleMonthlyFeederSelect(codeOrId: string) {
    // Substation code → switch to Feeders tab with filter
    if (KNOWN_SUBSTATIONS.has(codeOrId)) {
      setFeederSubstationFilter(codeOrId);
      setActiveTab('feeders');
      return;
    }
    // Feeder code → resolve to numeric ID and open drawer
    const numericId = feederCodeMap.get(codeOrId);
    if (numericId) setSelectedFeederId(numericId);
  }

  const syncAgo = scoreData?.last_synced
    ? fmtRelativeTime(scoreData.last_synced)
    : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div>
        <div className="flex items-center gap-1.5 text-xs text-navy-600 mb-3">
          <Link
            href="/intel"
            className="hover:text-gold-500 transition-colors"
          >
            Pulse
          </Link>
          <span>/</span>
          <span className="text-slate-400">GPL Grid Health</span>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1
              className="text-xl md:text-2xl font-bold text-gold-500"
              style={{ fontFamily: 'DM Serif Display, serif' }}
            >
              GPL Grid Health
            </h1>
            <p className="text-navy-600 text-xs mt-0.5">
              Feeder performance, outage patterns, and live grid status
            </p>
          </div>

          <div className="flex items-center gap-3">
            {syncAgo && (
              <span className="text-[11px] text-navy-600">
                Last synced {syncAgo}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="btn-navy flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={syncing ? 'animate-spin' : ''}
              />
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>
        </div>
      </div>

      {/* Overview metric cards */}
      {metricsLoading ? (
        <MetricSkeleton />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <MetricCard
            label="Active outages"
            value={activeOutages}
            alert={activeOutages > 0}
          />
          <MetricCard
            label="Customers at risk"
            value={
              customersAtRisk > 0 ? customersAtRisk.toLocaleString() : '0'
            }
            alert={customersAtRisk > 0}
          />
          <MetricCard
            label="30-day outages"
            value={scoreData?.outage_count_30d ?? '--'}
          />
          <MetricCard
            label="Avg restoration"
            value={
              scoreData?.avg_restoration_min != null
                ? `${scoreData.avg_restoration_min}m`
                : '--'
            }
          />
          <MetricCard
            label="Repeat offenders"
            value={repeatOffenders}
            alert={repeatOffenders > 0}
          />
        </div>
      )}

      {/* Tab pills */}
      <div className="flex gap-2.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (tab.id === 'feeders') setFeederSubstationFilter('');
              if (tab.id === 'today') setTodayDateRange(undefined);
              setActiveTab(tab.id);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-gold-500 text-navy-950'
                : 'bg-transparent text-navy-600 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div key={refreshKey}>
        {activeTab === 'feeders' && (
          <FeederHealthTable
            onFeederSelect={setSelectedFeederId}
            initialSubstationFilter={feederSubstationFilter}
          />
        )}
        {activeTab === 'monthly' && (
          <MonthlyPerformance
            onFeederSelect={handleMonthlyFeederSelect}
            onNavigateToday={handleNavigateToday}
          />
        )}
        {activeTab === 'today' && (
          <TodayGrid
            onFeederSelect={setSelectedFeederId}
            dateRange={todayDateRange}
          />
        )}
      </div>

      {/* Feeder detail drawer */}
      <FeederDetailDrawer
        feederId={selectedFeederId}
        isOpen={drawerOpen}
        onClose={() => setSelectedFeederId(null)}
      />
    </div>
  );
}

// ── Page export with Suspense boundary for useSearchParams ──────────────────

export default function GridHealthPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div>
            <div className="h-3 w-32 rounded bg-navy-800 mb-3" />
            <div className="h-7 w-56 rounded bg-navy-800 mb-1" />
            <div className="h-3 w-72 rounded bg-navy-800" />
          </div>
          <MetricSkeleton />
        </div>
      }
    >
      <GridHealthContent />
    </Suspense>
  );
}
