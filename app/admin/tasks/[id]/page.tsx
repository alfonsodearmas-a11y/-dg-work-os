'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, UserPlus, Send, Clock,
  MessageSquare, Loader2, AlertTriangle,
} from 'lucide-react';
import { TaskTimeline } from '@/components/tasks/TaskTimeline';
import { STATUS_LABELS, AGENCY_COLORS, PRIORITY_COLORS } from '@/components/tasks/TaskManagementCard';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  agency: string;
  assignee_id: string;
  assignee_name?: string;
  assignee_email?: string;
  creator_name?: string;
  due_date: string | null;
  tags: string[];
  evidence: string[];
  completion_notes: string | null;
  rejection_reason: string | null;
  source_recording_id: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  submitted_at: string | null;
  verified_at: string | null;
}

export default function AdminTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [activities, setActivities] = useState<any[]>([]);
  const [comments, setComments] = useState<any[]>([]);
  const [extensions, setExtensions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [taskRes, activitiesRes, commentsRes, extRes] = await Promise.all([
        fetch(`/api/tm/tasks/${id}`),
        fetch(`/api/tm/tasks/${id}/comments`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/tm/tasks/${id}/comments`).then(r => r.json()).catch(() => ({ data: [] })),
        fetch(`/api/tm/tasks/${id}/extension`).then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      const taskData = await taskRes.json();
      if (taskData.success) setTask(taskData.data);
      else router.push('/admin/tasks');

      // Fetch activities directly
      const actRes = await fetch(`/api/tm/tasks/${id}`);
      // Activities come from a separate endpoint
      // For now we use the task activities we'll build inline
      setComments(commentsRes.data || []);
      setExtensions(extRes.data || []);
    } catch (err) {
      console.error('Failed to load task:', err);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const updateStatus = async (status: string, extra?: any) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tm/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, ...extra }),
      });
      const data = await res.json();
      if (data.success) {
        setTask(data.data);
        fetchData();
      }
    } catch {}
    setSubmitting(false);
    setShowRejectModal(false);
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tm/tasks/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment }),
      });
      if (res.ok) {
        setNewComment('');
        fetchData();
      }
    } catch {}
    setSubmitting(false);
  };

  const decideExtension = async (extId: string, approved: boolean) => {
    setSubmitting(true);
    try {
      await fetch(`/api/tm/tasks/${id}/extension/${extId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      fetchData();
    } catch {}
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) return null;

  const isOverdue = task.status === 'delayed' || (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done');
  const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.new;
  const agencyColor = AGENCY_COLORS[task.agency] || AGENCY_COLORS.ministry;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/admin/tasks" className="p-2 rounded-lg hover:bg-[#2d3a52]/50 text-[#64748b] hover:text-white transition-colors mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{task.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${agencyColor}`}>{task.agency.toUpperCase()}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.color}`}>{statusInfo.label}</span>
            <span className={`text-xs capitalize ${task.priority === 'high' ? 'text-orange-400' : 'text-[#64748b]'}`}>
              {task.priority} priority
            </span>
            {isOverdue && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          {task.description && (
            <div className="card-premium p-5">
              <h3 className="text-sm font-semibold text-[#64748b] mb-2">Description</h3>
              <p className="text-sm text-white whitespace-pre-wrap">{task.description}</p>
            </div>
          )}

          {/* Completion Notes */}
          {task.completion_notes && (
            <div className="card-premium p-5 border-green-500/20">
              <h3 className="text-sm font-semibold text-green-400 mb-2">Completion Notes</h3>
              <p className="text-sm text-white whitespace-pre-wrap">{task.completion_notes}</p>
            </div>
          )}

          {/* Rejection Reason */}
          {task.rejection_reason && (
            <div className="card-premium p-5 border-red-500/20">
              <h3 className="text-sm font-semibold text-red-400 mb-2">Rejection Reason</h3>
              <p className="text-sm text-white">{task.rejection_reason}</p>
            </div>
          )}

          {/* Comments */}
          <div className="card-premium p-5">
            <h3 className="text-sm font-semibold text-[#64748b] mb-4 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> Comments ({comments.length})
            </h3>
            <div className="space-y-3 mb-4">
              {comments.map((c: any) => (
                <div key={c.id} className="bg-[#0f1d32] rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-white">{c.user_name}</span>
                    <span className="text-[10px] text-[#64748b]">
                      {new Date(c.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-[#94a3b8]">{c.body}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()}
                placeholder="Add a comment..."
                className="flex-1 px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
              />
              <button onClick={addComment} disabled={submitting} className="btn-navy px-3 py-2 text-sm">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-4">
          {/* Actions */}
          {task.status !== 'done' && (
            <div className="card-premium p-4 space-y-2">
              <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-2">Actions</h3>
              <button
                onClick={() => updateStatus('done')}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <CheckCircle className="h-4 w-4" /> Mark Done
              </button>
              {task.status !== 'delayed' && (
                <button
                  onClick={() => updateStatus('delayed')}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors border border-red-500/30"
                >
                  <AlertTriangle className="h-4 w-4" /> Mark Delayed
                </button>
              )}
            </div>
          )}

          {/* Properties */}
          <div className="card-premium p-4">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-3">Properties</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748b]">Assignee</span>
                <span className="text-white">{task.assignee_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Created by</span>
                <span className="text-white">{task.creator_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Due Date</span>
                <span className={`${isOverdue ? 'text-red-400' : 'text-white'}`}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Created</span>
                <span className="text-white">{new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
              {task.tags.length > 0 && (
                <div>
                  <span className="text-[#64748b] block mb-1">Tags</span>
                  <div className="flex flex-wrap gap-1">
                    {task.tags.map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-[#2d3a52] text-[#64748b]">{t}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Extension Requests */}
          {extensions.length > 0 && (
            <div className="card-premium p-4">
              <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-3 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5" /> Extension Requests
              </h3>
              <div className="space-y-3">
                {extensions.map((ext: any) => (
                  <div key={ext.id} className="bg-[#0f1d32] rounded-lg p-3 text-sm">
                    <p className="text-[#64748b]">
                      <span className="text-white">{ext.requester_name}</span> requested extension to{' '}
                      <span className="text-white">{new Date(ext.requested_due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </p>
                    <p className="text-xs text-[#64748b] mt-1">{ext.reason}</p>
                    {ext.status === 'pending' && (
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => decideExtension(ext.id, true)} className="text-xs px-2 py-1 bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors">
                          Approve
                        </button>
                        <button onClick={() => decideExtension(ext.id, false)} className="text-xs px-2 py-1 bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors">
                          Reject
                        </button>
                      </div>
                    )}
                    {ext.status !== 'pending' && (
                      <span className={`text-xs mt-1 inline-block ${ext.status === 'approved' ? 'text-green-400' : 'text-red-400'}`}>
                        {ext.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recording Link */}
          {task.source_recording_id && (
            <Link
              href={`/meetings/recordings?id=${task.source_recording_id}`}
              className="card-premium p-4 block hover:ring-1 hover:ring-[#d4af37]/30 transition-all"
            >
              <p className="text-xs text-[#64748b]">Source Recording</p>
              <p className="text-sm text-[#d4af37] mt-1">View meeting recording</p>
            </Link>
          )}
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-white mb-3">Reject Task</h3>
            <p className="text-sm text-[#64748b] mb-3">Provide a reason so the assignee knows what to improve.</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
              placeholder="Reason for rejection..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 text-sm text-[#64748b] hover:text-white">Cancel</button>
              <button
                onClick={() => updateStatus('rejected', { rejection_reason: rejectReason })}
                disabled={submitting || !rejectReason.trim()}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
