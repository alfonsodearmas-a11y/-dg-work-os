'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, RefreshCw, Clock } from 'lucide-react';
import { TaskEditModal } from './TaskEditModal';
import { CalendarCommandCenter } from './CalendarCommandCenter';
import { TasksSection } from './TasksSection';
import { LoadingSkeleton } from '@/components/intel/common/LoadingSkeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefreshIndicator';
import { fetchWithOffline } from '@/lib/offline/sync-manager';
import { DataFreshnessPill } from '@/components/pwa/OfflineBanner';

interface Task {
  notion_id: string;
  title: string;
  status: 'To Do' | 'In Progress' | 'Waiting' | 'Done';
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  role: string | null;
  priority: 'High' | 'Medium' | 'Low' | null;
  url?: string;
}

interface Briefing {
  summary: {
    total_tasks: number;
    overdue_count: number;
    due_today_count: number;
    due_this_week_count: number;
    meetings_today: number;
  };
  overdue: Task[];
  due_today: Task[];
  due_this_week: Task[];
  no_due_date: Task[];
  by_role: Record<string, Task[]>;
  by_agency: Record<string, Task[]>;
  calendar: {
    today: any[];
    this_week: any[];
    tomorrow?: any[];
    stats?: {
      total_events: number;
      total_hours: number;
      free_hours: number;
    };
  };
  _errors?: {
    calendar?: { type: string; message: string };
    tasks?: { type: string; message: string };
  };
  generated_at: string;
}

const CALENDAR_POLL_MS = 5 * 60 * 1000; // 5 minutes
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export function BriefingDashboard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [staleText, setStaleText] = useState('');
  const [dataSource, setDataSource] = useState<'network' | 'offline'>('network');
  const [dataAge, setDataAge] = useState(0);
  const isMobile = useIsMobile();
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const staleRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBriefing = useCallback(async () => {
    try {
      setLoading(true);
      const dateKey = new Date().toISOString().slice(0, 10);
      const result = await fetchWithOffline<Briefing>('/api/briefing', 'briefing', dateKey);
      setBriefing(result.data);
      setDataSource(result.source);
      setDataAge(result.age);
      setError(null);
      setLastFetched(new Date());
      setIsStale(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchBriefing();
  }, [fetchBriefing]);

  // Auto-refresh polling (every 5 minutes)
  useEffect(() => {
    pollRef.current = setInterval(() => {
      fetchBriefing();
    }, CALENDAR_POLL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchBriefing]);

  // Stale data check (every 30 seconds)
  useEffect(() => {
    const checkStale = () => {
      if (!lastFetched) return;
      const elapsed = Date.now() - lastFetched.getTime();
      if (elapsed > STALE_THRESHOLD_MS) {
        setIsStale(true);
        setStaleText(formatDistanceToNow(lastFetched, { addSuffix: true }));
      } else {
        setIsStale(false);
      }
    };

    staleRef.current = setInterval(checkStale, 30000);
    return () => {
      if (staleRef.current) clearInterval(staleRef.current);
    };
  }, [lastFetched]);

  // Refresh on tab visibility change
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && lastFetched) {
        const elapsed = Date.now() - lastFetched.getTime();
        if (elapsed > STALE_THRESHOLD_MS) {
          fetchBriefing();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchBriefing, lastFetched]);

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
  };

  const handleSaveTask = () => {
    fetchBriefing();
  };

  // All tasks combined (excluding Done)
  const allTasks = briefing ? [
    ...briefing.overdue,
    ...briefing.due_today,
    ...briefing.due_this_week,
    ...briefing.no_due_date,
  ] : [];

  const { isRefreshing, pullDistance, handlers: pullHandlers } = usePullToRefresh({
    onRefresh: fetchBriefing,
    enabled: isMobile,
  });

  if (loading && !briefing) {
    return <LoadingSkeleton type="briefing" />;
  }

  if (error && !briefing) {
    return (
      <div className="card-premium p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400 font-medium">{error}</p>
        <p className="text-[#64748b] text-sm mt-2">
          Check your Notion and Google Calendar credentials
        </p>
        <button
          onClick={fetchBriefing}
          className="btn-navy mt-4 px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-6 md:space-y-8 relative pb-8" {...pullHandlers}>
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />

      {/* Ministry crest watermark */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center z-0" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ministry-logo.png" alt="" className="w-[400px] h-[400px] opacity-[0.03]" />
      </div>

      {/* Edit Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
        />
      )}

      {/* 1. Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-3xl font-bold text-white">Daily Briefing</h1>
            <DataFreshnessPill source={dataSource} age={dataAge} />
          </div>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Stale data indicator */}
          {isStale && (
            <span className="hidden md:flex items-center gap-1.5 text-[10px] text-[#64748b]">
              <Clock className="h-3 w-3" />
              {staleText}
            </span>
          )}
          <button
            onClick={fetchBriefing}
            disabled={loading}
            className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden md:inline">{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Stale banner (mobile) */}
      {isStale && isMobile && (
        <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-[#1a2744] border border-[#2d3a52]">
          <Clock className="h-3 w-3 text-[#64748b]" />
          <span className="text-[10px] text-[#64748b]">Last synced {staleText}</span>
          <button onClick={fetchBriefing} className="text-[10px] text-[#d4af37] font-medium ml-1">Refresh</button>
        </div>
      )}

      {/* 2-4. Calendar Command Center (DayAtGlance + WeekStrip + Timeline + Upcoming) */}
      <CalendarCommandCenter
        todayEvents={briefing.calendar.today}
        weekEvents={briefing.calendar.this_week}
        onRefresh={fetchBriefing}
        calendarError={briefing._errors?.calendar || null}
      />

      {/* 5. Tasks Section */}
      <TasksSection
        tasks={allTasks as Task[]}
        onEditTask={handleEditTask}
        onRefresh={fetchBriefing}
      />
    </div>
  );
}
