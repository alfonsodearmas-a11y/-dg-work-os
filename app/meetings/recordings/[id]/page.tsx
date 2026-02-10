'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { RecordingDetailView } from '@/components/meetings/RecordingDetailView';

export default function RecordingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecording = useCallback(async () => {
    try {
      const res = await fetch(`/api/meetings/recordings/${id}`);
      if (!res.ok) throw new Error('Failed to load recording');
      const json = await res.json();
      setData(json);
      setError(null);
      return json;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    fetchRecording().finally(() => setLoading(false));
  }, [fetchRecording]);

  // Poll while transcribing or processing
  useEffect(() => {
    if (!data?.recording) return;
    const { status } = data.recording;
    if (status !== 'transcribing' && status !== 'processing') return;

    const interval = setInterval(async () => {
      const json = await fetchRecording();
      if (json?.recording && json.recording.status !== 'transcribing' && json.recording.status !== 'processing') {
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [data?.recording?.status, fetchRecording]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/meetings/recordings" className="p-2 rounded-lg hover:bg-[#1a2744] text-[#64748b] hover:text-white transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="h-8 bg-[#2d3a52] rounded w-64 animate-pulse" />
        </div>
        <div className="card-premium p-8 flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-[#d4af37] animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !data?.recording) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/meetings/recordings" className="p-2 rounded-lg hover:bg-[#1a2744] text-[#64748b] hover:text-white transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-white">Recording Not Found</h1>
        </div>
        <div className="card-premium p-8 text-center">
          <p className="text-red-400">{error || 'This recording does not exist.'}</p>
          <Link href="/meetings/recordings" className="btn-navy mt-4 inline-flex items-center gap-2 px-4 py-2">
            <ChevronLeft className="h-4 w-4" /> Back to Recordings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back nav */}
      <div className="flex items-center gap-3">
        <Link href="/meetings/recordings" className="p-2 rounded-lg hover:bg-[#1a2744] text-[#64748b] hover:text-white transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <span className="text-[#64748b] text-sm">Back to Recordings</span>
      </div>

      <RecordingDetailView
        recording={data.recording}
        actionItems={data.action_items || []}
      />
    </div>
  );
}
