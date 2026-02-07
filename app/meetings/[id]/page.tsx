'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { MeetingMinutesView } from '@/components/meetings/MeetingMinutesView';

export default function MeetingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [meeting, setMeeting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/meetings/${id}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to load meeting');
        }
        const data = await res.json();
        setMeeting(data);
      } catch (e: any) {
        setError(e.message);
      }
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Link href="/meetings" className="inline-flex items-center gap-1.5 text-[#64748b] hover:text-white text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Meetings
        </Link>
        <div className="card-premium p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
          <span className="text-[#64748b] ml-3">Loading meeting...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link href="/meetings" className="inline-flex items-center gap-1.5 text-[#64748b] hover:text-white text-sm transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Meetings
        </Link>
        <div className="card-premium p-8 text-center">
          <p className="text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/meetings" className="inline-flex items-center gap-1.5 text-[#64748b] hover:text-white text-sm transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Meetings
      </Link>
      <MeetingMinutesView meeting={meeting} />
    </div>
  );
}
