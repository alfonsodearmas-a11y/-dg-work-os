'use client';

import { ArrowLeft, Droplets } from 'lucide-react';
import Link from 'next/link';
import { GWIDetail } from '@/components/intel/GWIDetail';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { PendingConnectionsCard } from '@/components/intel/PendingConnectionsCard';

export default function GWIIntelPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link
          href="/intel"
          className="p-2.5 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors touch-active shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg shrink-0">
            <Droplets className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">GWI Deep Dive</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">Guyana Water Inc.</p>
          </div>
        </div>
      </div>

      {/* Pending Connections */}
      <PendingConnectionsCard agency="GWI" />

      {/* Self-managing GWI Detail */}
      <ErrorBoundary fallbackTitle="Failed to load GWI dashboard">
        <GWIDetail />
      </ErrorBoundary>
    </div>
  );
}
