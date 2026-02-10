'use client';

import Link from 'next/link';
import { ChevronLeft, Mic } from 'lucide-react';
import { AudioUploader } from '@/components/meetings/AudioUploader';

export default function RecordPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/meetings/recordings"
          className="p-2 rounded-lg hover:bg-[#1a2744] text-[#64748b] hover:text-white transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-white flex items-center gap-3">
            <Mic className="h-7 w-7 text-[#d4af37]" />
            Upload / Record
          </h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">
            Upload audio, record from your mic, or paste a transcript for AI analysis
          </p>
        </div>
      </div>

      <AudioUploader />
    </div>
  );
}
