'use client';

import { ArrowLeft, Shield } from 'lucide-react';
import Link from 'next/link';
import { useAgencyData } from '@/hooks/useAgencyData';
import { GCAADetail } from '@/components/intel/GCAADetail';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';

export default function GCAAIntelPage() {
  const { rawData, isLoading } = useAgencyData();

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
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shrink-0">
            <Shield className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">GCAA Deep Dive</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">Civil Aviation Authority</p>
          </div>
        </div>
      </div>

      {/* Self-managing GCAA Detail (mock data as fallback) */}
      <ErrorBoundary fallbackTitle="Failed to load GCAA dashboard">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner />
          </div>
        ) : (
          <GCAADetail data={rawData.gcaa} />
        )}
      </ErrorBoundary>
    </div>
  );
}
