'use client';

import { format } from 'date-fns';
import { FileText, Trash2, Calendar, DollarSign, User, AlertCircle, Clock, Building2, Tag } from 'lucide-react';
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
  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    const res = await fetch(`/api/documents/${document.id}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      onDelete?.();
    }
  };

  const typeStyle = typeStyles[document.document_type || ''] || { bg: 'bg-[#4a5568]/30', text: 'text-[#94a3b8]' };

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
          <button
            onClick={handleDelete}
            className="p-3 rounded-xl text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
          >
            <Trash2 className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Summary */}
      {document.summary && (
        <div className="card-premium p-6">
          <h2 className="text-lg font-semibold text-white flex items-center mb-4">
            <FileText className="h-5 w-5 mr-2 text-[#d4af37]" />
            AI Summary
          </h2>
          <p className="text-[#94a3b8] leading-relaxed">{document.summary}</p>
        </div>
      )}

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
    </div>
  );
}
