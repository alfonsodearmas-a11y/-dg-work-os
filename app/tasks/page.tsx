'use client';

import Link from 'next/link';
import { ArrowLeft, CheckSquare } from 'lucide-react';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';

export default function TasksPage() {
  return (
    <main className="min-h-screen bg-[#0a1628]">
      {/* Header */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a1628]/80 border-b border-[#1a2744]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="p-2 rounded-lg text-[#64748b] hover:text-white hover:bg-[#1a2744] transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
                  <CheckSquare className="h-5 w-5 text-[#d4af37]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Task Board</h1>
                  <p className="text-sm text-[#64748b]">Synced with Notion</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <KanbanBoard />
      </div>
    </main>
  );
}
