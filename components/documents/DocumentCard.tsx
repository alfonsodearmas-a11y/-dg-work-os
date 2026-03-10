'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { FileText, Clock, Building2, ChevronRight, ChevronDown, Loader2, ExternalLink, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
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
  onDelete?: (id: string) => void;
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

export function DocumentCard({ document, expandable = false, onDelete }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const typeStyle = typeStyles[document.document_type || ''] || { bg: 'bg-[#4a5568]/30', text: 'text-[#94a3b8]' };
  const isProcessing = document.processing_status === 'processing' || reanalyzing;
  const isFailed = document.processing_status === 'failed';
  const hasNoAnalysis = !document.summary || document.summary === 'Unable to analyze document';

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/documents/${document.id}`, { method: 'DELETE' });
      if (res.ok) {
        onDelete?.(document.id);
      }
    } catch {
      // Silently fail — card stays visible
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleReanalyze = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/reanalyze`, { method: 'POST' });
      if (res.ok) {
        // Reload page to see updated analysis
        window.location.reload();
      }
    } catch {
      // fail silently
    } finally {
      setReanalyzing(false);
    }
  };

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
            {document.summary && document.summary !== 'Unable to analyze document' && (
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
    <div className="rounded-xl bg-[#1a2744]/50 border border-[#2d3a52] hover:border-[#d4af37]/30 transition-all group/card relative">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center space-x-4 p-4 cursor-pointer text-left group"
      >
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-[#d4af37]/10 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
            ) : isFailed ? (
              <AlertTriangle className="h-5 w-5 text-red-400" />
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
            {isProcessing && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/20 text-blue-400 animate-pulse">
                AI analyzing...
              </span>
            )}
            {isFailed && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-400">
                Analysis failed
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
            {isProcessing && (
              <div className="flex items-center space-x-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Loader2 className="h-4 w-4 text-blue-400 animate-spin flex-shrink-0" />
                <p className="text-sm text-blue-400">Claude Opus is analyzing this document. Summary and insights will appear shortly.</p>
              </div>
            )}

            {isFailed && !reanalyzing && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">Analysis failed. You can retry.</p>
                </div>
                <button
                  onClick={handleReanalyze}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-xs font-medium"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}

            {hasNoAnalysis && !isFailed && !isProcessing && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#d4af37]/10 border border-[#d4af37]/20">
                <p className="text-sm text-[#94a3b8]">No analysis available.</p>
                <button
                  onClick={handleReanalyze}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-xs font-medium"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Analyze
                </button>
              </div>
            )}

            {document.summary && document.summary !== 'Unable to analyze document' && (
              <p className="text-sm text-[#94a3b8]">{document.summary}</p>
            )}

            {/* Actions row */}
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
              <div className="flex items-center gap-2">
                {/* Re-analyze button for completed docs */}
                {document.processing_status === 'completed' && !reanalyzing && (
                  <button
                    onClick={handleReanalyze}
                    className="flex items-center gap-1 text-xs text-[#64748b] hover:text-[#d4af37] transition-colors"
                    title="Re-analyze with AI"
                  >
                    <RefreshCw className="h-3 w-3" />
                    <span className="hidden sm:inline">Re-analyze</span>
                  </button>
                )}
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
                  className="flex items-center gap-1 text-xs text-[#64748b] hover:text-red-400 transition-colors"
                  title="Delete document"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
                <Link
                  href={`/documents/${document.id}`}
                  className="flex items-center gap-1 text-xs text-[#d4af37] hover:text-[#f4d03f] transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span>View Full</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="card-premium p-6 max-w-sm mx-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Trash2 className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-white font-semibold">Delete Document</h3>
            </div>
            <p className="text-[#94a3b8] text-sm">
              Delete <strong className="text-white">{document.title || document.original_filename}</strong>? This cannot be undone.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#1a2744] border border-[#2d3a52] text-[#94a3b8] hover:text-white hover:border-[#4a5568] transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-colors text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
