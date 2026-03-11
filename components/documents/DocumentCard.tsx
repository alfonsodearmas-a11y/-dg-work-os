'use client';

import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { FileText, Clock, Building2, ChevronRight, ChevronDown, Loader2, ExternalLink, Trash2, RefreshCw, AlertTriangle, CloudDownload, Pencil, Check } from 'lucide-react';
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
  sync_source?: string | null;
}

interface DocumentCardProps {
  document: Document;
  expandable?: boolean;
  onDelete?: (id: string) => void;
  onUpdate?: (id: string, updates: { doc_type?: string; tags?: string[] }) => void;
}

const typeStyles: Record<string, { bg: string; text: string }> = {
  contract: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  report: { bg: 'bg-gold-500/20', text: 'text-gold-400' },
  letter: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  memo: { bg: 'bg-navy-700/30', text: 'text-slate-400' },
  budget: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  policy: { bg: 'bg-red-500/20', text: 'text-red-400' },
  meeting_notes: { bg: 'bg-cyan-500/20', text: 'text-cyan-400' },
  invoice: { bg: 'bg-orange-500/20', text: 'text-orange-400' }
};

const DOC_TYPES = ['report', 'memo', 'letter', 'policy', 'budget', 'contract', 'meeting_notes', 'invoice', 'other'];

function TypeDropdown({
  currentType,
  onSelect,
  onClose,
}: {
  currentType: string | null;
  onSelect: (type: string) => void;
  onClose: () => void;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 mt-1 rounded-lg border border-navy-800 bg-navy-900 py-1 shadow-2xl min-w-[140px]"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
    >
      {DOC_TYPES.map((type) => {
        const style = typeStyles[type] || { bg: 'bg-navy-700/30', text: 'text-slate-400' };
        const isSelected = type === currentType;
        return (
          <button
            key={type}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onSelect(type);
            }}
            className={`flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-navy-800 transition-colors capitalize ${
              isSelected ? 'text-gold-500' : 'text-white/80'
            }`}
          >
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.bg} ${isSelected ? 'ring-1 ring-gold-500' : ''}`} />
            <span className="flex-1">{type.replace('_', ' ')}</span>
            {isSelected && <Check className="h-3 w-3 text-gold-500 flex-shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export function DocumentCard({ document, expandable = false, onDelete, onUpdate }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const typeStyle = typeStyles[document.document_type || ''] || { bg: 'bg-navy-700/30', text: 'text-slate-400' };
  const isProcessing = document.processing_status === 'processing' || reanalyzing;
  const isFailed = document.processing_status === 'failed';
  const hasNoAnalysis = !document.summary || document.summary === 'Unable to analyze document';
  const isFromDrive = document.sync_source === 'google_drive';

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

  const handleTypeSelect = (type: string) => {
    onUpdate?.(document.id, { doc_type: type });
    setEditingType(false);
  };

  // Renders the type badge — clickable if onUpdate is provided
  const renderTypeBadge = (sizeClass: string) => {
    if (!document.document_type) return null;

    if (onUpdate) {
      return (
        <div className="relative">
          <button
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setEditingType(!editingType);
            }}
            className={`group/badge inline-flex items-center gap-1 px-2 py-0.5 rounded ${sizeClass} font-medium ${typeStyle.bg} ${typeStyle.text} capitalize cursor-pointer hover:ring-1 hover:ring-gold-500/40 hover:bg-gold-500/10 transition-all`}
          >
            {document.document_type.replace('_', ' ')}
            <Pencil className="h-2.5 w-2.5 opacity-0 group-hover/badge:opacity-60 transition-opacity" />
          </button>
          {editingType && (
            <TypeDropdown
              currentType={document.document_type}
              onSelect={handleTypeSelect}
              onClose={() => setEditingType(false)}
            />
          )}
        </div>
      );
    }

    return (
      <span className={`px-2 py-0.5 rounded ${sizeClass} font-medium ${typeStyle.bg} ${typeStyle.text} capitalize`}>
        {document.document_type.replace('_', ' ')}
      </span>
    );
  };

  // Non-expandable: render as Link (original behavior)
  if (!expandable) {
    return (
      <Link href={`/documents/${document.id}`}>
        <div className="flex items-start space-x-4 p-4 rounded-xl bg-navy-900/50 hover:bg-navy-900 border border-navy-800 hover:border-gold-500/30 transition-all cursor-pointer group">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 rounded-xl bg-gold-500/10 flex items-center justify-center">
              {isProcessing ? (
                <Loader2 className="h-6 w-6 text-gold-500 animate-spin" />
              ) : (
                <FileText className="h-6 w-6 text-gold-500" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate group-hover:text-gold-500 transition-colors">
              {document.title || document.original_filename}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {renderTypeBadge('text-xs')}
              {document.agency && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-gold-500/20 text-gold-400">
                  {document.agency}
                </span>
              )}
              {isProcessing && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                  Processing...
                </span>
              )}
              {isFromDrive && (
                <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-400 flex items-center gap-1">
                  <CloudDownload className="h-3 w-3" />
                  Drive
                </span>
              )}
            </div>
            {document.summary && document.summary !== 'Unable to analyze document' && (
              <p className="mt-2 text-sm text-slate-400 line-clamp-2">{document.summary}</p>
            )}
            <div className="mt-3 flex items-center text-xs text-navy-600 space-x-4">
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
            <ChevronRight className="h-5 w-5 text-navy-700 group-hover:text-gold-500 transition-colors" />
          </div>
        </div>
      </Link>
    );
  }

  // Expandable: click to expand inline
  return (
    <div className="rounded-xl bg-navy-900/50 border border-navy-800 hover:border-gold-500/30 transition-all group/card relative">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center space-x-4 p-4 cursor-pointer text-left group"
      >
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-lg bg-gold-500/10 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="h-5 w-5 text-gold-500 animate-spin" />
            ) : isFailed ? (
              <AlertTriangle className="h-5 w-5 text-red-400" />
            ) : (
              <FileText className="h-5 w-5 text-gold-500" />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate group-hover:text-gold-500 transition-colors text-sm">
            {document.title || document.original_filename}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {renderTypeBadge('text-[10px]')}
            {document.agency && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-gold-500/20 text-gold-400">
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
            {isFromDrive && (
              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 text-blue-400 flex items-center gap-0.5">
                <CloudDownload className="h-2.5 w-2.5" />
                Drive
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          size={16}
          className={`text-navy-600 shrink-0 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
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
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors text-xs font-medium"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
              </div>
            )}

            {hasNoAnalysis && !isFailed && !isProcessing && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-gold-500/10 border border-gold-500/20">
                <p className="text-sm text-slate-400">No analysis available.</p>
                <button
                  onClick={handleReanalyze}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gold-500/20 text-gold-500 hover:bg-gold-500/30 transition-colors text-xs font-medium"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Analyze
                </button>
              </div>
            )}

            {document.summary && document.summary !== 'Unable to analyze document' && (
              <p className="text-sm text-slate-400">{document.summary}</p>
            )}

            {/* Actions row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center text-xs text-navy-600 space-x-4">
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
                    className="flex items-center gap-1 text-xs text-navy-600 hover:text-gold-500 transition-colors"
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
                  className="flex items-center gap-1 text-xs text-navy-600 hover:text-red-400 transition-colors"
                  title="Delete document"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
                <Link
                  href={`/documents/${document.id}`}
                  className="flex items-center gap-1 text-xs text-gold-500 hover:text-gold-400 transition-colors"
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
            <p className="text-slate-400 text-sm">
              Delete <strong className="text-white">{document.title || document.original_filename}</strong>? This cannot be undone.
            </p>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl bg-navy-900 border border-navy-800 text-slate-400 hover:text-white hover:border-navy-700 transition-colors text-sm font-medium"
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
