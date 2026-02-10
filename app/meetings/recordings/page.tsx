'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2,
  Mic,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileAudio,
  Plus,
} from 'lucide-react';
import { RecordingCard, type RecordingCardData } from '@/components/meetings/RecordingCard';

export default function RecordingsPage() {
  const [recordings, setRecordings] = useState<RecordingCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  const fetchRecordings = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/meetings/recordings?${params}`);
      const data = await res.json();
      setRecordings(data.recordings || []);
      setTotal(data.total || 0);
    } catch {
      // Fail silently
    }
  }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    fetchRecordings().finally(() => setLoading(false));
  }, [fetchRecordings]);

  // Count by status
  const counts = recordings.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl md:text-3xl font-bold text-white">Recordings</h1>
            <p className="text-[#64748b] mt-1 text-xs md:text-sm">Meeting recordings & transcripts</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card-premium p-4 animate-pulse h-40">
              <div className="h-5 bg-[#2d3a52] rounded w-20 mb-3" />
              <div className="h-4 bg-[#2d3a52] rounded w-full mb-2" />
              <div className="h-4 bg-[#2d3a52] rounded w-2/3 mb-3" />
              <div className="h-3 bg-[#2d3a52] rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Recordings</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">Meeting recordings & transcripts with AI analysis</p>
        </div>
        <Link href="/meetings/record" className="btn-gold flex items-center gap-2 px-3 py-2 md:px-4 shrink-0">
          <Plus className="h-4 w-4" />
          <span className="hidden md:inline">Upload Recording</span>
        </Link>
      </div>

      {/* Stats Bar */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-[#64748b]">{total} total</span>
          {(counts.completed || 0) > 0 && (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle className="h-3.5 w-3.5" /> {counts.completed} analyzed
            </span>
          )}
          {((counts.processing || 0) + (counts.transcribing || 0)) > 0 && (
            <span className="flex items-center gap-1 text-amber-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {(counts.processing || 0) + (counts.transcribing || 0)} in progress
            </span>
          )}
          {(counts.uploading || 0) > 0 && (
            <span className="flex items-center gap-1 text-[#64748b]">
              <Clock className="h-3.5 w-3.5" /> {counts.uploading} awaiting transcript
            </span>
          )}
          {(counts.failed || 0) > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <AlertTriangle className="h-3.5 w-3.5" /> {counts.failed} failed
            </span>
          )}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: '', label: 'All' },
          { key: 'completed', label: 'Analyzed' },
          { key: 'processing', label: 'Processing' },
          { key: 'transcribing', label: 'Transcribing' },
          { key: 'uploading', label: 'Awaiting Transcript' },
          { key: 'failed', label: 'Failed' },
        ]).map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              statusFilter === s.key
                ? 'bg-[#d4af37]/20 text-[#d4af37] border border-[#d4af37]/30'
                : 'text-[#64748b] hover:text-white hover:bg-[#1a2744]'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Cards Grid */}
      {recordings.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Mic className="h-12 w-12 text-[#2d3a52] mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">No recordings yet</h3>
          <p className="text-[#64748b] text-sm mb-4">
            {statusFilter
              ? 'No recordings match this filter.'
              : 'Upload an audio file or paste a transcript to get started.'}
          </p>
          {!statusFilter && (
            <Link href="/meetings/record" className="btn-gold inline-flex items-center gap-2 px-4 py-2">
              <Plus className="h-4 w-4" /> Upload Recording
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recordings.map(r => (
            <RecordingCard key={r.id} recording={r} />
          ))}
        </div>
      )}
    </div>
  );
}
