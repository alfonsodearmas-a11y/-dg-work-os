'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, FileText, Upload, Trash2, Clock, CheckCircle, XCircle,
  AlertTriangle, Eye, ChevronDown, Download, X, File,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatDistanceToNow, format, parseISO } from 'date-fns';

interface Application {
  id: string;
  agency: string;
  applicant_name: string;
  application_type: string;
  reference_number: string | null;
  status: string;
  priority: string;
  submitted_at: string;
  notes: string | null;
  created_by: string;
  creator_name: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

interface Document {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  uploader_name: string | null;
  uploaded_at: string;
}

interface ActivityEntry {
  id: string;
  action: string;
  old_value: string | null;
  new_value: string | null;
  performed_by: string;
  performer_name: string | null;
  performed_at: string;
  details: Record<string, unknown> | null;
}

const STATUS_STYLES: Record<string, { bg: string; label: string; icon: typeof Clock }> = {
  pending: { bg: 'bg-amber-500/20 text-amber-400', label: 'Pending', icon: Clock },
  under_review: { bg: 'bg-blue-500/20 text-blue-400', label: 'Under Review', icon: Eye },
  approved: { bg: 'bg-green-500/20 text-green-400', label: 'Approved', icon: CheckCircle },
  rejected: { bg: 'bg-red-500/20 text-red-400', label: 'Rejected', icon: XCircle },
};

const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-gray-500/20 text-gray-400',
  normal: 'bg-navy-700/20 text-slate-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'created this application',
  status_changed: 'changed status',
  document_uploaded: 'uploaded a document',
  document_deleted: 'deleted a document',
  note_added: 'added a note',
};

const MINISTRY_ROLES = ['dg', 'minister', 'ps'];

export default function ApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [app, setApp] = useState<Application | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Status update
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Upload
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const userRole = (session?.user as { role?: string })?.role || 'officer';
  const userId = session?.user?.id;
  const isMinistryOrAdmin = MINISTRY_ROLES.includes(userRole) || userRole === 'agency_admin';

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchApplication = useCallback(async () => {
    try {
      const res = await fetch(`/api/applications/${id}`);
      if (res.ok) {
        const data = await res.json();
        setApp(data.application);
        setDocuments(data.documents || []);
        setActivity(data.activity || []);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchApplication(); }, [fetchApplication]);

  // Status transitions available to user
  const getAvailableStatuses = () => {
    if (!app) return [];
    const current = app.status;
    if (MINISTRY_ROLES.includes(userRole) || userRole === 'agency_admin') {
      return ['pending', 'under_review', 'approved', 'rejected'].filter(s => s !== current);
    }
    // Officers: pending → under_review only
    if (current === 'pending') return ['under_review'];
    return [];
  };

  const handleStatusUpdate = async () => {
    if (!newStatus || !statusNote.trim()) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note: statusNote.trim() }),
      });
      if (res.ok) {
        showToast('Status updated', 'success');
        setNewStatus('');
        setStatusNote('');
        fetchApplication();
      } else {
        const data = await res.json();
        showToast(data.error || 'Failed to update', 'error');
      }
    } catch {
      showToast('Failed to update status', 'error');
    }
    setUpdatingStatus(false);
  };

  // File upload handler
  const uploadFile = async (file: File) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (!allowed.includes(file.type)) {
      showToast('Only PDF, DOCX, and XLSX files are allowed', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast('File must be under 10MB', 'error');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/applications/${id}/documents`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        showToast('Document uploaded', 'success');
        fetchApplication();
      } else {
        const data = await res.json();
        showToast(data.error || 'Upload failed', 'error');
      }
    } catch {
      showToast('Upload failed', 'error');
    }
    setUploading(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const deleteDocument = async (docId: string) => {
    if (!confirm('Delete this document?')) return;
    setDeleting(docId);
    try {
      const res = await fetch(`/api/applications/${id}/documents/${docId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Document deleted', 'success');
        fetchApplication();
      } else {
        const data = await res.json();
        showToast(data.error || 'Delete failed', 'error');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
    setDeleting(null);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Spinner />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="text-center py-16 text-navy-600">
        <p>Application not found</p>
        <Link href="/applications" className="text-gold-500 text-sm mt-2 inline-block hover:underline">
          Back to applications
        </Link>
      </div>
    );
  }

  const statusInfo = STATUS_STYLES[app.status] || STATUS_STYLES.pending;
  const StatusIcon = statusInfo.icon;
  const availableStatuses = getAvailableStatuses();

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/applications"
          className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors"
          aria-label="Back to applications"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-white truncate">{app.applicant_name}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {app.reference_number && (
              <span className="text-xs font-mono text-gold-500">{app.reference_number}</span>
            )}
            <span className="text-xs text-navy-600">{app.application_type}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${statusInfo.bg}`}>
          <StatusIcon className="h-3.5 w-3.5" />
          {statusInfo.label}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Application Info */}
          <div className="card-premium p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Application Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <InfoField label="Agency" value={app.agency.toUpperCase()} />
              <InfoField label="Type" value={app.application_type} />
              <InfoField label="Priority">
                <span className={`text-xs px-2 py-0.5 rounded ${PRIORITY_STYLES[app.priority] || ''}`}>
                  {app.priority}
                </span>
              </InfoField>
              <InfoField label="Submitted" value={format(parseISO(app.submitted_at), 'MMM d, yyyy')} />
              <InfoField label="Created By" value={app.creator_name || 'Unknown'} />
              <InfoField label="Reference" value={app.reference_number || '\u2014'} />
            </div>
            {app.notes && (
              <div>
                <p className="text-xs text-navy-600 mb-1">Notes</p>
                <p className="text-sm text-slate-400 whitespace-pre-wrap">{app.notes}</p>
              </div>
            )}
          </div>

          {/* Status Update */}
          {availableStatuses.length > 0 && (
            <div className="card-premium p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Update Status</h2>
              <div className="flex flex-wrap gap-2">
                {availableStatuses.map(s => {
                  const si = STATUS_STYLES[s];
                  return (
                    <button
                      key={s}
                      onClick={() => setNewStatus(newStatus === s ? '' : s)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        newStatus === s
                          ? 'border-gold-500 bg-gold-500/10 text-gold-500'
                          : 'border-navy-800 text-slate-400 hover:text-white hover:border-navy-700'
                      }`}
                    >
                      {si?.label || s}
                    </button>
                  );
                })}
              </div>
              {newStatus && (
                <div className="space-y-2">
                  <textarea
                    value={statusNote}
                    onChange={e => setStatusNote(e.target.value)}
                    placeholder="Note required for status change..."
                    rows={2}
                    className="w-full px-3 py-2 bg-navy-950 border border-navy-800 rounded-lg text-sm text-white placeholder:text-navy-600 focus:outline-none focus:ring-1 focus:ring-gold-500/50 resize-none"
                  />
                  <button
                    onClick={handleStatusUpdate}
                    disabled={updatingStatus || !statusNote.trim()}
                    className="px-4 py-2 rounded-lg bg-gold-500 text-navy-950 text-xs font-semibold hover:bg-[#e5c348] disabled:opacity-50 transition-colors"
                  >
                    {updatingStatus ? 'Updating...' : `Move to ${STATUS_STYLES[newStatus]?.label || newStatus}`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Documents */}
          <div className="card-premium p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Documents ({documents.length})</h2>

            {/* Upload Zone */}
            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-gold-500 bg-gold-500/5'
                  : 'border-navy-800 hover:border-navy-700'
              }`}
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2">
                  <Spinner size="sm" />
                  <span className="text-sm text-slate-400">Uploading...</span>
                </div>
              ) : (
                <>
                  <Upload className="h-6 w-6 text-navy-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Drop file here or click to browse</p>
                  <p className="text-xs text-navy-700 mt-1">PDF, DOCX, XLSX — max 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.docx,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
              />
            </div>

            {/* Document List */}
            {documents.length > 0 && (
              <div className="divide-y divide-navy-800/50">
                {documents.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 py-3">
                    <File className="h-5 w-5 text-navy-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{doc.file_name}</p>
                      <p className="text-xs text-navy-600">
                        {formatFileSize(doc.file_size)} · {doc.uploader_name || 'Unknown'} · {formatDistanceToNow(parseISO(doc.uploaded_at), { addSuffix: true })}
                      </p>
                    </div>
                    {(userId === doc.uploaded_by || userRole === 'dg') && (
                      <button
                        onClick={() => deleteDocument(doc.id)}
                        disabled={deleting === doc.id}
                        className="p-1.5 rounded text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        aria-label="Delete document"
                      >
                        {deleting === doc.id ? (
                          <Spinner size="sm" className="border-red-400" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column — Activity Timeline */}
        <div className="space-y-5">
          <div className="card-premium p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Activity Timeline</h2>
            {activity.length === 0 ? (
              <p className="text-xs text-navy-600 text-center py-4">No activity recorded</p>
            ) : (
              <div className="space-y-0">
                {activity.map((entry, i) => (
                  <div key={entry.id} className="relative pl-6 pb-4 last:pb-0">
                    {/* Timeline line */}
                    {i < activity.length - 1 && (
                      <div className="absolute left-[7px] top-3 bottom-0 w-px bg-navy-800" />
                    )}
                    {/* Dot */}
                    <div className={`absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                      entry.action === 'status_changed'
                        ? 'border-gold-500 bg-gold-500/20'
                        : entry.action === 'document_uploaded'
                        ? 'border-blue-400 bg-blue-400/20'
                        : entry.action === 'document_deleted'
                        ? 'border-red-400 bg-red-400/20'
                        : 'border-navy-700 bg-navy-800'
                    }`} />

                    <div>
                      <p className="text-xs text-slate-400">
                        <span className="text-white font-medium">{entry.performer_name || 'System'}</span>{' '}
                        {ACTION_LABELS[entry.action] || entry.action}
                      </p>

                      {entry.action === 'status_changed' && entry.old_value && entry.new_value && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[entry.old_value]?.bg || ''}`}>
                            {STATUS_STYLES[entry.old_value]?.label || entry.old_value}
                          </span>
                          <span className="text-[10px] text-navy-600">&rarr;</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[entry.new_value]?.bg || ''}`}>
                            {STATUS_STYLES[entry.new_value]?.label || entry.new_value}
                          </span>
                        </div>
                      )}

                      {entry.action === 'document_uploaded' && entry.new_value && (
                        <p className="text-[10px] text-navy-600 mt-0.5 truncate">{entry.new_value}</p>
                      )}

                      {entry.action === 'note_added' && entry.new_value && (
                        <p className="text-[10px] text-slate-400 mt-0.5 italic">&ldquo;{entry.new_value}&rdquo;</p>
                      )}

                      {entry.action === 'status_changed' && typeof entry.details?.note === 'string' && (
                        <p className="text-[10px] text-navy-600 mt-0.5 italic">&ldquo;{entry.details.note}&rdquo;</p>
                      )}

                      <p className="text-[10px] text-navy-700 mt-0.5">
                        {formatDistanceToNow(parseISO(entry.performed_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function InfoField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-navy-600 mb-0.5">{label}</p>
      {children || <p className="text-sm text-white">{value}</p>}
    </div>
  );
}
