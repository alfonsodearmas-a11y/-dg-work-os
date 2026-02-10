'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutGrid, List, ChevronRight, AlertTriangle, Clock,
  CheckCircle, Send, Eye, XCircle, UserCheck,
} from 'lucide-react';
import { TaskManagementCard } from './TaskManagementCard';
import { TaskFilters } from './TaskFilters';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  agency: string;
  assignee_id: string;
  assignee_name?: string;
  assignee_email?: string;
  creator_name?: string;
  due_date?: string | null;
  created_at: string;
  updated_at: string;
}

interface Stats {
  total_active: string;
  overdue: string;
  awaiting_review: string;
  completed_this_week: string;
}

const KANBAN_COLUMNS = [
  { status: 'assigned', label: 'Assigned', icon: Send, color: 'border-blue-500/50' },
  { status: 'acknowledged', label: 'Acknowledged', icon: UserCheck, color: 'border-indigo-500/50' },
  { status: 'in_progress', label: 'In Progress', icon: Clock, color: 'border-yellow-500/50' },
  { status: 'submitted', label: 'For Review', icon: Eye, color: 'border-purple-500/50' },
  { status: 'verified', label: 'Verified', icon: CheckCircle, color: 'border-green-500/50' },
  { status: 'rejected', label: 'Rejected', icon: XCircle, color: 'border-red-500/50' },
];

export function CommandCenter() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [assignees, setAssignees] = useState<{ id: string; full_name: string }[]>([]);
  const router = useRouter();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '200', ...filters });
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch(`/api/tm/tasks?${params}`),
        fetch('/api/tm/tasks/stats'),
      ]);
      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      if (tasksData.success) setTasks(tasksData.data.tasks);
      if (statsData.success) setStats(statsData.data);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    // Fetch assignees for filter dropdown
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setAssignees(d.data.filter((u: any) => u.role === 'ceo').map((u: any) => ({ id: u.id, full_name: u.full_name })));
        }
      })
      .catch(() => {});
  }, []);

  const getColumnTasks = (status: string) => tasks.filter(t => t.status === status);

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Active Tasks" value={stats.total_active} color="text-white" />
          <StatCard label="Overdue" value={stats.overdue} color="text-red-400" alert={parseInt(stats.overdue) > 0} />
          <StatCard label="Awaiting Review" value={stats.awaiting_review} color="text-purple-400" />
          <StatCard label="Completed This Week" value={stats.completed_this_week} color="text-green-400" />
        </div>
      )}

      {/* Filter + View Toggle Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <TaskFilters
          onFilterChange={setFilters}
          showAssignee
          assignees={assignees}
        />
        <div className="flex items-center gap-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg p-1">
          <button
            onClick={() => setView('kanban')}
            className={`p-1.5 rounded-md transition-colors ${view === 'kanban' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('table')}
            className={`p-1.5 rounded-md transition-colors ${view === 'table' ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : view === 'kanban' ? (
        <KanbanView tasks={tasks} columns={KANBAN_COLUMNS} onTaskClick={(id) => router.push(`/admin/tasks/${id}`)} />
      ) : (
        <TableView tasks={tasks} onTaskClick={(id) => router.push(`/admin/tasks/${id}`)} />
      )}
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: string; color: string; alert?: boolean }) {
  return (
    <div className={`card-premium p-4 ${alert ? 'ring-1 ring-red-500/40' : ''}`}>
      <p className="text-xs text-[#64748b] font-medium">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>
        {alert && <AlertTriangle className="inline h-5 w-5 mr-1 mb-1" />}
        {value}
      </p>
    </div>
  );
}

function KanbanView({
  tasks,
  columns,
  onTaskClick,
}: {
  tasks: Task[];
  columns: typeof KANBAN_COLUMNS;
  onTaskClick: (id: string) => void;
}) {
  // Also include overdue tasks in a special section
  const overdueTasks = tasks.filter(t => t.status === 'overdue');

  return (
    <div className="space-y-4">
      {overdueTasks.length > 0 && (
        <div className="card-premium p-4 border-red-500/30">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Overdue ({overdueTasks.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {overdueTasks.map(t => (
              <TaskManagementCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {columns.map(col => {
          const colTasks = tasks.filter(t => t.status === col.status);
          const Icon = col.icon;
          return (
            <div key={col.status} className={`bg-[#0f1d32] rounded-xl border-t-2 ${col.color} min-h-[300px]`}>
              <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-[#64748b]" />
                  <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">{col.label}</span>
                </div>
                <span className="text-xs text-[#64748b] bg-[#1a2744] px-1.5 py-0.5 rounded">{colTasks.length}</span>
              </div>
              <div className="px-2 pb-2 space-y-2">
                {colTasks.map(t => (
                  <TaskManagementCard key={t.id} task={t} onClick={() => onTaskClick(t.id)} compact />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-center text-xs text-[#64748b]/50 py-8">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function TableView({ tasks, onTaskClick }: { tasks: Task[]; onTaskClick: (id: string) => void }) {
  return (
    <div className="card-premium overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2d3a52]">
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Task</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Agency</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Assignee</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Priority</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b] uppercase">Due</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map(t => {
              const isOverdue = t.status === 'overdue' || (t.due_date && new Date(t.due_date) < new Date() && t.status !== 'verified');
              return (
                <tr
                  key={t.id}
                  onClick={() => onTaskClick(t.id)}
                  className={`border-b border-[#2d3a52]/50 cursor-pointer hover:bg-[#2d3a52]/20 transition-colors ${isOverdue ? 'bg-red-500/5' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="text-white font-medium line-clamp-1">{t.title}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-[#64748b]">{t.agency.toUpperCase()}</span>
                  </td>
                  <td className="px-4 py-3 text-[#64748b]">{t.assignee_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs capitalize ${t.priority === 'critical' ? 'text-red-400' : t.priority === 'high' ? 'text-orange-400' : t.priority === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs capitalize text-[#64748b]">{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.due_date ? (
                      <span className={`text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-[#64748b]'}`}>
                        {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    ) : (
                      <span className="text-xs text-[#64748b]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
