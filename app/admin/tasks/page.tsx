'use client';

import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { CommandCenter } from '@/components/tasks/CommandCenter';

export default function AdminTasksPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Command Center</h1>
          <p className="text-sm text-[#64748b] mt-1">Track and manage task assignments across all agencies</p>
        </div>
        <button
          onClick={() => router.push('/admin/tasks/new')}
          className="btn-gold flex items-center gap-2 px-4 py-2.5 text-sm"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      <CommandCenter />
    </div>
  );
}
