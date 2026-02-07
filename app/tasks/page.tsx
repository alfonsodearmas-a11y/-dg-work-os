'use client';

import Link from 'next/link';
import { ArrowLeft, CheckSquare } from 'lucide-react';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';

export default function TasksPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-3 md:gap-4">
        <Link
          href="/"
          className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors touch-active"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
            <CheckSquare className="h-4 w-4 md:h-5 md:w-5 text-[#d4af37]" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">Task Board</h1>
            <p className="text-xs md:text-sm text-[#64748b]">Synced with Notion</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <KanbanBoard />
    </div>
  );
}
