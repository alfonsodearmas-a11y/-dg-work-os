'use client';

import { useEffect, useState } from 'react';
import { Upload, FileText, Building2, FolderOpen, RefreshCw, Search } from 'lucide-react';
import { UploadZone } from '@/components/documents/UploadZone';
import { DocumentCard } from '@/components/documents/DocumentCard';
import { DocumentSearch } from '@/components/documents/DocumentSearch';
import { LoadingSkeleton } from '@/components/intel/common/LoadingSkeleton';

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

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function fetchDocuments(search?: string, filters?: { agency?: string; type?: string }) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filters?.agency) params.set('agency', filters.agency);
      if (filters?.type) params.set('type', filters.type);

      const res = await fetch(`/api/documents?${params}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : [];
      setDocuments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSearch = (query: string, filters: { agency?: string; type?: string }) => {
    fetchDocuments(query, filters);
  };

  // Group documents by agency
  const byAgency = documents.reduce((acc, doc) => {
    const agency = doc.agency || 'Other';
    if (!acc[agency]) acc[agency] = [];
    acc[agency].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  // Group by type
  const byType = documents.reduce((acc, doc) => {
    const type = doc.document_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  const typeLabels: Record<string, string> = {
    contract: 'Contracts',
    report: 'Reports',
    letter: 'Letters',
    memo: 'Memos',
    budget: 'Budgets',
    policy: 'Policies',
    meeting_notes: 'Meeting Notes',
    invoice: 'Invoices',
    other: 'Other'
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-3xl font-bold text-white">Document Vault</h1>
          <p className="text-[#64748b] mt-1 text-xs md:text-sm">AI-powered document analysis and search</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <button
            onClick={() => fetchDocuments()}
            className="btn-navy flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden md:inline">Refresh</span>
          </button>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn-gold flex items-center gap-2 px-2.5 py-1.5 md:px-4 md:py-2"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline">Upload</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <FileText className="h-5 w-5 md:h-6 md:w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-xl md:text-[2.5rem] font-semibold text-[#d4af37] leading-none">{documents.length}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Total Documents</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <Building2 className="h-5 w-5 md:h-6 md:w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-xl md:text-[2.5rem] font-semibold text-[#d4af37] leading-none">{Object.keys(byAgency).length}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Agencies</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <FolderOpen className="h-5 w-5 md:h-6 md:w-6 text-[#d4af37]" />
            </div>
          </div>
          <p className="text-xl md:text-[2.5rem] font-semibold text-[#d4af37] leading-none">{Object.keys(byType).length}</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Document Types</p>
        </div>

        <div className="card-premium p-4 md:p-6">
          <div className="flex items-center justify-between mb-2 md:mb-4">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
              <Search className="h-5 w-5 md:h-6 md:w-6 text-emerald-400" />
            </div>
          </div>
          <p className="text-xl md:text-[2.5rem] font-semibold text-emerald-400 leading-none">AI</p>
          <p className="text-[#64748b] text-xs md:text-sm mt-1">Search Enabled</p>
        </div>
      </div>

      {/* Upload Zone */}
      {showUpload && (
        <div className="card-premium p-4 md:p-6">
          <UploadZone onUploadComplete={() => {
            // Keep the upload zone visible so the user sees the success message.
            // Refetch immediately (will show completed docs), then poll once
            // more after a delay to catch the newly processed document.
            fetchDocuments();
            setTimeout(() => fetchDocuments(), 8000);
          }} />
        </div>
      )}

      {/* Search */}
      <div className="card-premium p-4 md:p-6">
        <DocumentSearch onSearch={handleSearch} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column - Documents */}
        <div className="lg:col-span-2 space-y-4 md:space-y-6">
          {/* Recent Uploads */}
          <div className="card-premium p-4 md:p-6">
            <h2 className="text-lg font-semibold text-white flex items-center mb-4">
              <FileText className="h-5 w-5 mr-2 text-[#d4af37]" />
              Recent Uploads
            </h2>
            {loading ? (
              <LoadingSkeleton type="documentList" count={5} />
            ) : documents.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-[#1a2744] flex items-center justify-center mx-auto mb-4">
                  <FileText className="h-8 w-8 text-[#64748b]" />
                </div>
                <p className="text-[#94a3b8]">No documents yet</p>
                <p className="text-[#64748b] text-sm mt-1">Upload your first document above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.slice(0, 10).map((doc) => (
                  <DocumentCard key={doc.id} document={doc} expandable />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column - Filters */}
        <div className="space-y-6">
          {/* By Agency */}
          {Object.keys(byAgency).length > 0 && (
            <div className="card-premium p-4 md:p-6">
              <h2 className="text-lg font-semibold text-white mb-4">By Agency</h2>
              <div className="space-y-2">
                {Object.entries(byAgency)
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([agency, docs]) => (
                    <button
                      key={agency}
                      onClick={() => handleSearch('', { agency: agency === 'Other' ? '' : agency })}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#1a2744]/50 hover:bg-[#1a2744] transition-colors text-left"
                    >
                      <span className="text-white font-medium">{agency}</span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#d4af37]/20 text-[#f4d03f]">
                        {docs.length}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* By Type */}
          {Object.keys(byType).length > 0 && (
            <div className="card-premium p-4 md:p-6">
              <h2 className="text-lg font-semibold text-white mb-4">By Type</h2>
              <div className="space-y-2">
                {Object.entries(byType)
                  .sort((a, b) => b[1].length - a[1].length)
                  .map(([type, docs]) => (
                    <button
                      key={type}
                      onClick={() => handleSearch('', { type })}
                      className="w-full flex items-center justify-between p-3 rounded-xl bg-[#1a2744]/50 hover:bg-[#1a2744] transition-colors text-left"
                    >
                      <span className="text-white font-medium capitalize">
                        {typeLabels[type] || type.replace('_', ' ')}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-[#4a5568]/30 text-[#94a3b8]">
                        {docs.length}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
