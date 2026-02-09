'use client';

import { ArrowLeft, Plane } from 'lucide-react';
import Link from 'next/link';
import { useAgencyData } from '@/hooks/useAgencyData';
import { CJIADetail } from '@/components/intel/CJIADetail';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function CJIAIntelPage() {
  const { rawData, isLoading } = useAgencyData();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 md:gap-4">
        <Link
          href="/intel"
          className="p-2.5 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors touch-active shrink-0"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <div className="p-2 md:p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-lg shrink-0">
            <Plane className="text-white" size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-2xl font-bold text-white truncate">CJIA Deep Dive</h1>
            <p className="text-[#64748b] text-xs md:text-sm truncate">CJIA Airport — Operations</p>
          </div>
        </div>
      </div>

      {/* Self-managing CJIA Detail (mock data as fallback) */}
      <ErrorBoundary fallbackTitle="Failed to load CJIA dashboard">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <CJIADetail data={rawData.cjia} />
        )}
      </ErrorBoundary>
    </div>
  );
}
