'use client';

import { CommandCenter } from '@/components/tasks/CommandCenter';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function AdminTasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Command Center</h1>
        <p className="text-sm text-[#64748b] mt-1">Track and manage task assignments across all agencies</p>
      </div>

      <ErrorBoundary fallbackTitle="Failed to load Command Center">
        <CommandCenter />
      </ErrorBoundary>
    </div>
  );
}
