'use client';

import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { CalendarView } from '@/components/calendar/CalendarView';

export default function CalendarPage() {
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
                  <Calendar className="h-5 w-5 text-[#d4af37]" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Calendar</h1>
                  <p className="text-sm text-[#64748b]">Synced with Google Calendar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <CalendarView />
      </div>
    </main>
  );
}
