'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { TaskManagementCard } from '@/components/tasks/TaskManagementCard';

interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  agency: string;
  assignee_name?: string;
  due_date?: string | null;
}

const TABS = [
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
];

export default function CEOTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tab, setTab] = useState('active');
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const status = tab === 'active'
      ? 'new,in_progress,delayed'
      : 'done';
    try {
      const res = await fetch(`/api/tm/tasks?status=${status}&limit=100`);
      const data = await res.json();
      if (data.success) setTasks(data.data.tasks);
    } catch {}
    setLoading(false);
  }, [tab]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">My Tasks</h1>

      <div className="flex gap-1 bg-[#1a2744] border border-[#2d3a52] rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.key ? 'bg-[#d4af37]/20 text-[#d4af37]' : 'text-[#64748b] hover:text-white'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-center text-[#64748b] py-16">No tasks found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {tasks.map(t => (
            <TaskManagementCard
              key={t.id}
              task={t}
              onClick={() => router.push(`/dashboard/tasks/${t.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
