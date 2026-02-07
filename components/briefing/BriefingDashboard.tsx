'use client';

import { useEffect, useState } from 'react';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { AlertTriangle, Calendar, CheckSquare, Clock, RefreshCw, Edit2 } from 'lucide-react';
import { TaskEditModal } from './TaskEditModal';
import { CalendarCommandCenter } from './CalendarCommandCenter';
import { CollapsibleSection } from '@/components/ui/CollapsibleSection';
import { LoadingSkeleton } from '@/components/intel/common/LoadingSkeleton';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefreshIndicator';

interface Task {
  notion_id: string;
  title: string;
  status: string | null;
  due_date: string | null;
  assignee: string | null;
  agency: string | null;
  role: string | null;
  priority: string | null;
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
  generated_at: string;
}

export function BriefingDashboard() {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    fetchBriefing();
  }, []);

  async function fetchBriefing() {
    try {
      setLoading(true);
      const res = await fetch('/api/briefing');
      if (!res.ok) throw new Error('Failed to fetch briefing');
      const data = await res.json();
      setBriefing(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  const handleEditTask = (task: Task) => {
    setEditingTask(task);
  };

  const handleSaveTask = () => {
    fetchBriefing();
  };

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
      </div>
    );
  }

  if (!briefing) return null;

  return (
    <div className="space-y-8 relative" {...pullHandlers}>
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

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Daily Briefing</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
        </div>
        <button
          onClick={fetchBriefing}
          disabled={loading}
          className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2 disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden md:inline">{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Calendar Command Center */}
      <CalendarCommandCenter
        todayEvents={briefing.calendar.today}
        weekEvents={briefing.calendar.this_week}
        onRefresh={fetchBriefing}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <CheckSquare className="h-5 w-5 md:h-6 md:w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-2xl md:text-[2.5rem] font-semibold text-[#d4af37] leading-none">{briefing.summary.total_tasks}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Open Tasks</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <Clock className="h-5 w-5 md:h-6 md:w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-2xl md:text-[2.5rem] font-semibold text-[#d4af37] leading-none">{briefing.summary.due_today_count}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Due Today</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 text-red-400" />
            </div>
          </div>
          <p className="text-2xl md:text-[2.5rem] font-semibold text-red-400 leading-none">{briefing.summary.overdue_count}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Overdue</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Calendar className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
            </div>
          </div>
          <p className="text-2xl md:text-[2.5rem] font-semibold text-emerald-400 leading-none">{briefing.summary.meetings_today}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Meetings Today</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column - Tasks */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Overdue */}
          {briefing.overdue.length > 0 && (
            <CollapsibleSection title="Overdue" badge={{ text: String(briefing.overdue.length), variant: 'danger' }} icon={AlertTriangle} defaultOpen={true}>
              <TaskList tasks={briefing.overdue} showOverdueInfo onEdit={handleEditTask} />
            </CollapsibleSection>
          )}

          {/* Due Today */}
          <CollapsibleSection title="Due Today" badge={{ text: String(briefing.due_today.length), variant: 'gold' }} icon={Clock} defaultOpen={true}>
            {briefing.due_today.length > 0 ? (
              <TaskList tasks={briefing.due_today} onEdit={handleEditTask} />
            ) : (
              <p className="text-[#64748b] text-sm">No tasks due today</p>
            )}
          </CollapsibleSection>

          {/* This Week */}
          {briefing.due_this_week.length > 0 && (
            <CollapsibleSection title="This Week" badge={{ text: String(briefing.due_this_week.length), variant: 'default' }} icon={Calendar} defaultOpen={false}>
              <TaskList tasks={briefing.due_this_week} showDueDate onEdit={handleEditTask} />
            </CollapsibleSection>
          )}

          {/* Open Tasks */}
          {briefing.no_due_date.length > 0 && (
            <CollapsibleSection title="Open Tasks" badge={{ text: String(briefing.no_due_date.length), variant: 'default' }} icon={CheckSquare} defaultOpen={false}>
              <TaskList tasks={briefing.no_due_date.slice(0, 10)} onEdit={handleEditTask} />
              {briefing.no_due_date.length > 10 && (
                <p className="text-sm text-[#64748b] mt-3 text-center">
                  + {briefing.no_due_date.length - 10} more tasks
                </p>
              )}
            </CollapsibleSection>
          )}
        </div>

        {/* Right Column - Summaries */}
        <div className="space-y-4 md:space-y-6">
          {/* By Agency */}
          <div className="card-premium p-4 md:p-6">
            <h2 className="text-lg font-semibold text-white mb-4">By Agency</h2>
            <RoleSummary data={briefing.by_agency} />
          </div>
        </div>
      </div>
    </div>
  );
}

// TaskList component
function TaskList({ tasks, showOverdueInfo, showDueDate, onEdit }: {
  tasks: Task[];
  showOverdueInfo?: boolean;
  showDueDate?: boolean;
  onEdit?: (task: Task) => void;
}) {
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.notion_id}
          className={`flex items-start space-x-3 p-3 rounded-xl bg-[#1a2744]/50 hover:bg-[#1a2744] transition-colors ${onEdit ? 'cursor-pointer' : ''}`}
          onClick={() => onEdit?.(task)}
        >
          <div className="flex-shrink-0 pt-0.5">
            <div className={`w-4 h-4 rounded border-2 ${task.status === 'Done' ? 'bg-emerald-500 border-emerald-500' : 'border-[#4a5568]'}`}>
              {task.status === 'Done' && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white">{task.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {task.agency && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#d4af37]/20 text-[#f4d03f]">
                  {task.agency}
                </span>
              )}
              {task.priority === 'High' && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-400">
                  High Priority
                </span>
              )}
              {task.status && task.status !== 'To do' && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                  task.status === 'Done' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-[#4a5568]/30 text-[#94a3b8]'
                }`}>
                  {task.status}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center space-x-2">
            {showOverdueInfo && task.due_date && (
              <p className="text-sm text-red-400 font-medium">
                {formatDistanceToNow(new Date(task.due_date))} overdue
              </p>
            )}
            {showDueDate && task.due_date && (
              <p className={`text-sm ${isPast(new Date(task.due_date)) ? 'text-red-400' : 'text-[#64748b]'}`}>
                {format(new Date(task.due_date), 'MMM d')}
              </p>
            )}
            {onEdit && (
              <Edit2 className="h-4 w-4 text-[#4a5568]" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// RoleSummary component
function RoleSummary({ data }: { data: Record<string, Task[]> }) {
  const entries = Object.entries(data).sort((a, b) => b[1].length - a[1].length);

  if (entries.length === 0) {
    return <p className="text-[#64748b] text-sm">No data available</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([name, tasks]) => (
        <div key={name} className="flex items-center justify-between p-3 rounded-xl bg-[#1a2744]/50">
          <span className="text-sm text-white">{name}</span>
          <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#d4af37]/20 text-[#f4d03f]">
            {tasks.length}
          </span>
        </div>
      ))}
    </div>
  );
}
