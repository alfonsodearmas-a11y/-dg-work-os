'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Clock, AlertTriangle, CheckCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  agency: string;
  due_date: string | null;
  rejection_reason: string | null;
  created_at: string;
}

interface Stats {
  status_new: string;
  in_progress: string;
  delayed: string;
  done: string;
  total_active: string;
}

export default function CEODashboard() {
  const { user } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [tasksRes, statsRes] = await Promise.all([
        fetch('/api/tm/tasks?limit=50'),
        fetch('/api/tm/tasks/stats'),
      ]);
      const tasksData = await tasksRes.json();
      const statsData = await statsRes.json();
      if (tasksData.success) setTasks(tasksData.data.tasks);
      if (statsData.success) setStats(statsData.data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (taskId: string, status: string) => {
    setActionLoading(taskId);
    try {
      await fetch(`/api/tm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch {}
    setActionLoading(null);
  };

  const needsAttention = tasks.filter(t => t.status === 'new');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const overdue = tasks.filter(t => t.status === 'delayed');
  const recentlyCompleted = tasks.filter(t => t.status === 'done').slice(0, 5);

  const greeting = (() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white">{greeting}, {user?.fullName?.split(' ')[0]}</h1>
        <p className="text-sm text-[#64748b] mt-1">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            label="New Tasks"
            value={stats.status_new}
            color="text-yellow-400"
            bgColor="bg-yellow-500/10"
            icon={Bell}
          />
          <SummaryCard
            label="In Progress"
            value={stats.in_progress}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
            icon={Clock}
          />
          <SummaryCard
            label="Delayed"
            value={stats.delayed}
            color="text-red-400"
            bgColor="bg-red-500/10"
            icon={AlertTriangle}
            alert={parseInt(stats.delayed) > 0}
          />
          <SummaryCard
            label="Done"
            value={stats.done}
            color="text-green-400"
            bgColor="bg-green-500/10"
            icon={CheckCircle}
          />
        </div>
      )}

      {/* Overdue Alert */}
      {overdue.length > 0 && (
        <div className="card-premium p-4 border-red-500/30 bg-red-500/5">
          <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Overdue ({overdue.length})
          </h3>
          <div className="space-y-2">
            {overdue.map(t => (
              <TaskRow key={t.id} task={t} onClick={() => router.push(`/dashboard/tasks/${t.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-[#d4af37] mb-3">New Tasks ({needsAttention.length})</h3>
          <div className="space-y-2">
            {needsAttention.map(t => (
              <div key={t.id} className="bg-[#0f1d32] rounded-lg p-3 flex items-center justify-between gap-3">
                <button onClick={() => router.push(`/dashboard/tasks/${t.id}`)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm text-white font-medium truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-[#64748b]">{t.agency.toUpperCase()}</span>
                    {t.due_date && (
                      <span className="text-[10px] text-[#64748b]">
                        Due {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </button>
                <button
                  onClick={() => updateStatus(t.id, 'in_progress')}
                  disabled={actionLoading === t.id}
                  className="shrink-0 px-3 py-1.5 text-xs bg-[#d4af37]/20 text-[#d4af37] rounded-lg hover:bg-[#d4af37]/30 transition-colors font-medium"
                >
                  {actionLoading === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Start'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* In Progress */}
      {inProgress.length > 0 && (
        <div className="card-premium p-4">
          <h3 className="text-sm font-semibold text-blue-400 mb-3">In Progress ({inProgress.length})</h3>
          <div className="space-y-2">
            {inProgress.map(t => (
              <TaskRow key={t.id} task={t} onClick={() => router.push(`/dashboard/tasks/${t.id}`)} />
            ))}
          </div>
        </div>
      )}

      {/* Recently Completed */}
      {recentlyCompleted.length > 0 && (
        <details className="card-premium p-4">
          <summary className="text-sm font-semibold text-green-400 cursor-pointer">
            Recently Completed ({recentlyCompleted.length})
          </summary>
          <div className="space-y-2 mt-3">
            {recentlyCompleted.map(t => (
              <TaskRow key={t.id} task={t} onClick={() => router.push(`/dashboard/tasks/${t.id}`)} />
            ))}
          </div>
        </details>
      )}

      {/* Empty state */}
      {tasks.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle className="h-12 w-12 text-green-400/30 mx-auto mb-4" />
          <p className="text-lg font-medium text-white">All clear!</p>
          <p className="text-sm text-[#64748b] mt-1">No tasks assigned to you right now.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bgColor, icon: Icon, alert }: {
  label: string; value: string; color: string; bgColor: string; icon: React.ElementType; alert?: boolean;
}) {
  return (
    <div className={`card-premium p-4 ${alert ? 'ring-1 ring-red-500/40' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#64748b]">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
      </div>
      <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

function TaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const isOverdue = task.status === 'delayed' || (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done');
  const daysLeft = task.due_date ? Math.ceil((new Date(task.due_date).getTime() - Date.now()) / 86400000) : null;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[#0f1d32] rounded-lg p-3 hover:bg-[#2d3a52]/30 transition-colors flex items-center justify-between"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate">{task.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-[#64748b]">{task.agency.toUpperCase()}</span>
          <span className={`text-[10px] capitalize ${task.priority === 'high' ? 'text-orange-400' : 'text-[#64748b]'}`}>
            {task.priority}
          </span>
        </div>
      </div>
      {task.due_date && (
        <span className={`text-xs shrink-0 ml-2 ${isOverdue ? 'text-red-400' : daysLeft !== null && daysLeft <= 2 ? 'text-yellow-400' : 'text-[#64748b]'}`}>
          {isOverdue ? 'Overdue' : daysLeft !== null && daysLeft === 0 ? 'Today' : daysLeft !== null && daysLeft === 1 ? 'Tomorrow' : new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      )}
      <ArrowRight className="h-4 w-4 text-[#64748b] ml-2 shrink-0" />
    </button>
  );
}
