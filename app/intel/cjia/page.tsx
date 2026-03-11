'use client';

import { ArrowLeft, Plane } from 'lucide-react';
import Link from 'next/link';
import { useAgencyData } from '@/hooks/useAgencyData';
import { CJIADetail } from '@/components/intel/CJIADetail';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { Spinner } from '@/components/ui/Spinner';

export default function CJIAIntelPage() {
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
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shrink-0">
            <Plane className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">CJIA Deep Dive</h1>
            <p className="text-navy-600 text-xs md:text-sm truncate">CJIA Airport — Operations</p>
          </div>
        </div>
      </div>

      {/* Self-managing CJIA Detail (mock data as fallback) */}
      <ErrorBoundary fallbackTitle="Failed to load CJIA dashboard">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Spinner />
          </div>
        ) : (
          <CJIADetail data={rawData.cjia} />
        )}
      </ErrorBoundary>
    </div>
  );
}
