'use client';

import { ArrowLeft, Droplets } from 'lucide-react';
import Link from 'next/link';
import { GWIDetail } from '@/components/intel/GWIDetail';

export default function GWIIntelPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/intel"
          className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 shadow-lg">
            <Droplets className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">GWI Deep Dive</h1>
            <p className="text-[#64748b] text-sm">Guyana Water Inc. — Financial, Collections, Customer Service, Procurement</p>
          </div>
        </div>
      </div>

      {/* Self-managing GWI Detail */}
      <GWIDetail />
    </div>
  );
}
