'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export interface ProvenanceProps {
  source: 'manual' | 'extraction';
  source_meeting_id: string | null;
  source_timestamp: string | null;
  source_quote: string | null;
}

export function SourceProvenanceBadge({ source, source_meeting_id, source_timestamp, source_quote }: ProvenanceProps) {
  const [open, setOpen] = useState(false);
  if (source !== 'extraction') return null;
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-[10px] uppercase tracking-wide bg-gold-500/20 text-gold-500 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
        title="Generated from a meeting">
        <Sparkles className="h-3 w-3" /> from meeting
      </button>
      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 w-72 bg-navy-900 border border-navy-800 rounded-lg p-3 text-xs shadow-xl">
          <div className="text-navy-600 mb-1">Source quote</div>
          <blockquote className="border-l-2 border-gold-500 pl-2 italic">
            {source_quote ?? '(no quote stored)'}
          </blockquote>
          <div className="mt-2 text-navy-600">
            Meeting: {source_meeting_id ?? '—'}
            {source_timestamp && <> · @ {source_timestamp}</>}
          </div>
        </div>
      )}
    </span>
  );
}
