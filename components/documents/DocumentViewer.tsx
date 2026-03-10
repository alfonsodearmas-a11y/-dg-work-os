'use client';

import { format } from 'date-fns';
import { useState } from 'react';
import { FileText, Trash2, Calendar, DollarSign, User, AlertCircle, Clock, Building2, Tag, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';
import { AskDocument } from './AskDocument';

interface ExtractedData {
  figures?: Array<{ label: string; value: string; context: string }>;
  dates?: Array<{ label: string; date: string; context: string }>;
  people?: Array<{ name: string; role: string; organization: string }>;
  commitments?: Array<{ description: string; deadline: string; responsible: string }>;
}

interface Query {
  id: string;
  question: string;
  answer: string;
  created_at: string;
}

interface Document {
  id: string;
  title: string;
  original_filename: string;
  summary: string | null;
  document_type: string | null;
  document_date: string | null;
  agency: string | null;
  tags: string[] | null;
  extracted_data: ExtractedData | null;
  uploaded_at: string;
  file_path: string;
  processing_status: string;
  queries: Query[];
}

interface DocumentViewerProps {
  document: Document;
  onDelete?: () => void;
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

export function DocumentViewer({ document, onDelete }: DocumentViewerProps) {
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/documents/${document.id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      onDelete?.();
    }
    setDeleting(false);
    setShowDeleteConfirm(false);
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/documents/${document.id}/reanalyze`, { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch {
      // fail silently
    } finally {
      setReanalyzing(false);
    }
  };

  const typeStyle = typeStyles[document.document_type || ''] || { bg: 'bg-[#4a5568]/30', text: 'text-[#94a3b8]' };
  const isFailed = document.processing_status === 'failed';
  const hasNoAnalysis = !document.summary || document.summary === 'Unable to analyze document';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card-premium p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-4">
            <div className="w-14 h-14 rounded-xl bg-[#d4af37]/20 flex items-center justify-center flex-shrink-0">
              <FileText className="h-7 w-7 text-[#d4af37]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                {document.title || document.original_filename}
              </h1>
              <p className="text-[#64748b] text-sm mt-1">{document.original_filename}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {document.document_type && (
                  <span className={`px-3 py-1 rounded-lg text-sm font-medium ${typeStyle.bg} ${typeStyle.text} capitalize`}>
                    {document.document_type.replace('_', ' ')}
                  </span>
                )}
                {document.agency && (
                  <span className="px-3 py-1 rounded-lg text-sm font-medium bg-[#d4af37]/20 text-[#f4d03f]">
                    {document.agency}
                  </span>
                )}
                {document.tags?.map((tag) => (
                  <span key={tag} className="px-3 py-1 rounded-lg text-sm font-medium bg-[#4a5568]/30 text-[#94a3b8]">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex items-center text-sm text-[#64748b] space-x-4">
                <span className="flex items-center">
                  <Clock className="h-4 w-4 mr-1.5" />
                  Uploaded {format(new Date(document.uploaded_at), 'MMM d, yyyy')}
                </span>
                {document.agency && (
                  <span className="flex items-center">
                    <Building2 className="h-4 w-4 mr-1.5" />
                    {document.agency}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              className="p-3 rounded-xl text-[#d4af37] hover:bg-[#d4af37]/10 border border-transparent hover:border-[#d4af37]/30 transition-all disabled:opacity-50"
              aria-label="Re-analyze document"
              title="Re-analyze with AI"
            >
              {reanalyzing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="p-3 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
              aria-label="Delete document"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary / Analysis Status */}
      {isFailed && !reanalyzing ? (
        <div className="card-premium p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Analysis Failed</h2>
                <p className="text-sm text-[#64748b]">AI was unable to analyze this document.</p>
              </div>
            </div>
            <button
              onClick={handleReanalyze}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Retry Analysis
            </button>
          </div>
        </div>
      ) : reanalyzing ? (
        <div className="card-premium p-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-[#d4af37] animate-spin" />
            <p className="text-[#94a3b8]">Claude Opus is re-analyzing this document...</p>
          </div>
        </div>
      ) : hasNoAnalysis ? (
        <div className="card-premium p-6">
          <div className="flex items-center justify-between">
            <p className="text-[#94a3b8]">No analysis available for this document.</p>
            <button
              onClick={handleReanalyze}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#d4af37]/20 text-[#d4af37] hover:bg-[#d4af37]/30 transition-colors text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" />
              Analyze Now
            </button>
          </div>
        </div>
      ) : document.summary ? (
        <div className="card-premium p-6">
          <h2 className="text-lg font-semibold text-white flex items-center mb-4">
            <FileText className="h-5 w-5 mr-2 text-[#d4af37]" />
            AI Summary
          </h2>
          <p className="text-[#94a3b8] leading-relaxed">{document.summary}</p>
        </div>
      ) : null}

      {/* Extracted Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Key Figures */}
        {document.extracted_data?.figures && document.extracted_data.figures.length > 0 && (
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-white flex items-center mb-4">
              <DollarSign className="h-5 w-5 mr-2 text-emerald-400" />
              Key Figures
            </h2>
            <div className="space-y-4">
              {document.extracted_data.figures.map((figure, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#1a2744]/50">
                  <p className="text-[#94a3b8] text-sm">{figure.label}</p>
                  <p className="text-xl font-bold text-emerald-400 mt-1">{figure.value}</p>
                  {figure.context && (
                    <p className="text-[#64748b] text-sm mt-2">{figure.context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key Dates */}
        {document.extracted_data?.dates && document.extracted_data.dates.length > 0 && (
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-white flex items-center mb-4">
              <Calendar className="h-5 w-5 mr-2 text-blue-400" />
              Key Dates
            </h2>
            <div className="space-y-4">
              {document.extracted_data.dates.map((date, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#1a2744]/50">
                  <p className="text-[#94a3b8] text-sm">{date.label}</p>
                  <p className="text-lg font-semibold text-blue-400 mt-1">
                    {format(new Date(date.date), 'MMMM d, yyyy')}
                  </p>
                  {date.context && (
                    <p className="text-[#64748b] text-sm mt-2">{date.context}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Key People */}
        {document.extracted_data?.people && document.extracted_data.people.length > 0 && (
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-white flex items-center mb-4">
              <User className="h-5 w-5 mr-2 text-purple-400" />
              Key People
            </h2>
            <div className="space-y-4">
              {document.extracted_data.people.map((person, i) => (
                <div key={i} className="p-4 rounded-xl bg-[#1a2744]/50">
                  <p className="text-white font-medium">{person.name}</p>
                  <p className="text-purple-400 text-sm mt-1">{person.role}</p>
                  <p className="text-[#64748b] text-sm">{person.organization}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commitments */}
        {document.extracted_data?.commitments && document.extracted_data.commitments.length > 0 && (
          <div className="card-premium p-6">
            <h2 className="text-lg font-semibold text-white flex items-center mb-4">
              <AlertCircle className="h-5 w-5 mr-2 text-orange-400" />
              Commitments & Action Items
            </h2>
            <div className="space-y-4">
              {document.extracted_data.commitments.map((commitment, i) => (
                <div key={i} className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/20">
                  <p className="text-[#94a3b8]">{commitment.description}</p>
                  <div className="mt-3 flex items-center justify-between text-sm">
                    <span className="text-orange-400">
                      Responsible: {commitment.responsible}
                    </span>
                    {commitment.deadline && (
                      <span className="text-[#64748b]">
                        Deadline: {commitment.deadline}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Q&A Section */}
      <div className="card-premium p-6">
        <h2 className="text-lg font-semibold text-white flex items-center mb-4">
          <Tag className="h-5 w-5 mr-2 text-[#d4af37]" />
          Ask About This Document
        </h2>
        <AskDocument documentId={document.id} previousQueries={document.queries} />
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
