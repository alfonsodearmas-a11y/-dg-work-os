'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, Clock, Building2, ChevronRight, ChevronDown, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface Document {
  id: string;
  title: string;
  original_filename: string;
  summary: string | null;
  document_type: string | null;
  agency: string | null;
  tags: string[] | null;
  uploaded_at: string;
  processing_status: string;
}

interface DocumentCardProps {
  document: Document;
  expandable?: boolean;
}

const typeStyles: Record<string, { bg: string; text: string }> = {
  contract: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  report: { bg: 'bg-[#d4af37]/20', text: 'text-[#f4d03f]' },
  letter: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  memo: { bg: 'bg-[#4a5568]/30', text: 'text-[#94a3b8]' },
  budget: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  policy: { bg: 'bg-red-500/20', text: 'text-red-400' },
  meeting_notes: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  invoice: { bg: 'bg-orange-500/20', text: 'text-orange-400' }
};

export function DocumentCard({ document, expandable = false }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const typeStyle = typeStyles[document.document_type || ''] || { bg: 'bg-[#4a5568]/30', text: 'text-[#94a3b8]' };
  const isProcessing = document.processing_status === 'processing';

  // Non-expandable: render as Link (original behavior)
  if (!expandable) {
    return (
      <Link href={`/documents/${document.id}`}>
        <div className="flex items-start space-x-4 p-4 rounded-xl bg-[#1a2744]/50 hover:bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37]/30 transition-all cursor-pointer group">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-[#d4af37]/10 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="h-6 w-6 text-[#d4af37] animate-spin" />
              ) : (
                <FileText className="h-6 w-6 text-[#d4af37]" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate group-hover:text-[#d4af37] transition-colors">
              {document.title || document.original_filename}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {document.document_type && (
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeStyle.bg} ${typeStyle.text} capitalize`}>
                  {document.document_type.replace('_', ' ')}
                </span>
              )}
              {document.agency && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#d4af37]/20 text-[#f4d03f]">
                  {document.agency}
                </span>
              )}
              {isProcessing && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                  Processing...
                </span>
              )}
            </div>
            {document.summary && (
              <p className="mt-2 text-sm text-[#94a3b8] line-clamp-2">{document.summary}</p>
            )}
            <div className="mt-3 flex items-center text-xs text-[#64748b] space-x-4">
              <span className="flex items-center">
                <Clock className="h-3.5 w-3.5 mr-1" />
                {format(new Date(document.uploaded_at), 'MMM d, yyyy')}
              </span>
              {document.agency && (
                <span className="flex items-center">
                  <Building2 className="h-3.5 w-3.5 mr-1" />
                  {document.agency}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 self-center">
            <ChevronRight className="h-5 w-5 text-[#4a5568] group-hover:text-[#d4af37] transition-colors" />
          </div>
        </div>
      </Link>
    );
  }

  // Expandable: click to expand inline
  return (
    <div className="rounded-xl bg-[#1a2744]/50 border border-[#2d3a52] hover:border-[#d4af37]/30 transition-all">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center space-x-4 p-4 cursor-pointer text-left group"
      >
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-[#d4af37]/10 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
            ) : (
              <FileText className="h-5 w-5 text-[#d4af37]" />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate group-hover:text-[#d4af37] transition-colors text-sm">
            {document.title || document.original_filename}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {document.document_type && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${typeStyle.bg} ${typeStyle.text} capitalize`}>
                {document.document_type.replace('_', ' ')}
              </span>
            )}
            {document.agency && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#d4af37]/20 text-[#f4d03f]">
                {document.agency}
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-[#64748b] shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <div className={`collapse-grid ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-4 pb-4 space-y-3">
            {document.summary && (
              <p className="text-sm text-[#94a3b8]">{document.summary}</p>
            )}
            <div className="flex items-center justify-between">
              <div className="flex items-center text-xs text-[#64748b] space-x-4">
                <span className="flex items-center">
                  <Clock className="h-3.5 w-3.5 mr-1" />
                  {format(new Date(document.uploaded_at), 'MMM d, yyyy')}
                </span>
                {document.agency && (
                  <span className="flex items-center">
                    <Building2 className="h-3.5 w-3.5 mr-1" />
                    {document.agency}
                  </span>
                )}
              </div>
              <Link
                href={`/documents/${document.id}`}
                className="flex items-center gap-1 text-xs text-[#d4af37] hover:text-[#f4d03f] transition-colors"
              >
                <span>View Full Document</span>
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
