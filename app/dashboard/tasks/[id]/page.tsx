'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, CheckCircle, XCircle, Play, Send, Clock,
  MessageSquare, Loader2, AlertTriangle, ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { STATUS_LABELS, AGENCY_COLORS } from '@/components/tasks/TaskManagementCard';

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  agency: string;
  assignee_id: string;
  assignee_name?: string;
  creator_name?: string;
  due_date: string | null;
  tags: string[];
  evidence: string[];
  completion_notes: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export default function CEOTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const router = useRouter();
  const [task, setTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [showExtensionModal, setShowExtensionModal] = useState(false);
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [taskRes, commentsRes] = await Promise.all([
        fetch(`/api/tm/tasks/${id}`),
        fetch(`/api/tm/tasks/${id}/comments`),
      ]);
      const taskData = await taskRes.json();
      const commentsData = await commentsRes.json();
      if (taskData.success) setTask(taskData.data);
      if (commentsData.success) setComments(commentsData.data);
    } catch {}
    setLoading(false);
  }, [id]);

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
      if (data.success) setTask(data.data);
    } catch {}
    setSubmitting(false);
    setShowSubmitModal(false);
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tm/tasks/${id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: newComment }),
      });
      setNewComment('');
      fetchData();
    } catch {}
    setSubmitting(false);
  };

  const requestExtension = async () => {
    if (!extensionDate || !extensionReason) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tm/tasks/${id}/extension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requested_date: extensionDate, reason: extensionReason }),
      });
      setShowExtensionModal(false);
      setExtensionDate('');
      setExtensionReason('');
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

  const isOverdue = task.status === 'overdue' || (task.due_date && new Date(task.due_date) < new Date() && task.status !== 'verified');
  const statusInfo = STATUS_LABELS[task.status] || STATUS_LABELS.assigned;

  // Status-based lifecycle progress
  const stages = ['assigned', 'acknowledged', 'in_progress', 'submitted', 'verified'];
  const currentStageIdx = stages.indexOf(task.status === 'rejected' ? 'in_progress' : task.status === 'overdue' ? 'in_progress' : task.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard" className="p-2 rounded-lg hover:bg-[#2d3a52]/50 text-[#64748b] hover:text-white transition-colors mt-1">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{task.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`text-xs px-2 py-0.5 rounded ${statusInfo.color}`}>{statusInfo.label}</span>
            <span className={`text-xs capitalize ${task.priority === 'critical' ? 'text-red-400' : task.priority === 'high' ? 'text-orange-400' : 'text-[#64748b]'}`}>
              {task.priority}
            </span>
            {isOverdue && <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Overdue</span>}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="card-premium p-4">
        <div className="flex items-center gap-1">
          {stages.map((stage, idx) => (
            <div key={stage} className="flex items-center flex-1">
              <div className={`h-1.5 flex-1 rounded-full ${idx <= currentStageIdx ? 'bg-[#d4af37]' : 'bg-[#2d3a52]'}`} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5">
          {stages.map((stage, idx) => (
            <span key={stage} className={`text-[10px] ${idx <= currentStageIdx ? 'text-[#d4af37]' : 'text-[#64748b]'}`}>
              {stage.replace('_', ' ')}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Rejection Notice */}
          {task.status === 'rejected' && task.rejection_reason && (
            <div className="card-premium p-4 border-red-500/30 bg-red-500/5">
              <h3 className="text-sm font-semibold text-red-400 mb-1">Returned for Revision</h3>
              <p className="text-sm text-white">{task.rejection_reason}</p>
            </div>
          )}

          {/* Description */}
          {task.description && (
            <div className="card-premium p-5">
              <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-2">Description</h3>
              <p className="text-sm text-white whitespace-pre-wrap">{task.description}</p>
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
                    <span className="text-[10px] text-[#64748b]">{new Date(c.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-sm text-[#94a3b8]">{c.body}</p>
                </div>
              ))}
              {comments.length === 0 && <p className="text-sm text-[#64748b]">No comments yet</p>}
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

        {/* Right Sidebar - Actions */}
        <div className="space-y-4">
          <div className="card-premium p-4 space-y-2">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-2">Actions</h3>

            {task.status === 'assigned' && (
              <button
                onClick={() => updateStatus('acknowledged')}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#d4af37] text-[#0a1628] rounded-lg text-sm font-semibold hover:bg-[#c5a030] transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Acknowledge
              </button>
            )}

            {task.status === 'acknowledged' && (
              <button
                onClick={() => updateStatus('in_progress')}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Work
              </button>
            )}

            {task.status === 'in_progress' && (
              <button
                onClick={() => setShowSubmitModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <Send className="h-4 w-4" /> Submit for Review
              </button>
            )}

            {task.status === 'rejected' && (
              <button
                onClick={() => updateStatus('in_progress')}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Resume Work
              </button>
            )}

            {task.status === 'submitted' && (
              <div className="text-center py-4">
                <Clock className="h-8 w-8 text-purple-400 mx-auto mb-2" />
                <p className="text-sm text-purple-400 font-medium">Awaiting DG Review</p>
              </div>
            )}

            {task.status === 'verified' && (
              <div className="text-center py-4">
                <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
                <p className="text-sm text-green-400 font-medium">Completed</p>
              </div>
            )}

            {/* Extension request button */}
            {!['verified', 'submitted'].includes(task.status) && task.due_date && (
              <button
                onClick={() => setShowExtensionModal(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs text-[#64748b] hover:text-white border border-[#2d3a52] rounded-lg hover:bg-[#2d3a52]/30 transition-colors"
              >
                <Clock className="h-3 w-3" /> Request Extension
              </button>
            )}
          </div>

          {/* Properties */}
          <div className="card-premium p-4">
            <h3 className="text-xs font-semibold text-[#64748b] uppercase mb-3">Details</h3>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748b]">Agency</span>
                <span className="text-white">{task.agency.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">From</span>
                <span className="text-white">{task.creator_name || 'Director General'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Due</span>
                <span className={isOverdue ? 'text-red-400' : 'text-white'}>
                  {task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'No deadline'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748b]">Created</span>
                <span className="text-white">{new Date(task.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-white mb-3">Submit for Review</h3>
            <p className="text-sm text-[#64748b] mb-3">Add completion notes for the Director General.</p>
            <textarea
              value={completionNotes}
              onChange={e => setCompletionNotes(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
              placeholder="Describe what was accomplished..."
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowSubmitModal(false)} className="px-4 py-2 text-sm text-[#64748b] hover:text-white">Cancel</button>
              <button
                onClick={() => updateStatus('submitted', { completion_notes: completionNotes })}
                disabled={submitting || !completionNotes.trim()}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extension Modal */}
      {showExtensionModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-[#1a2744] border border-[#2d3a52] rounded-xl w-full max-w-md p-5">
            <h3 className="text-lg font-semibold text-white mb-3">Request Extension</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#64748b] mb-1">New deadline</label>
                <input
                  type="date"
                  value={extensionDate}
                  onChange={e => setExtensionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50"
                />
              </div>
              <div>
                <label className="block text-xs text-[#64748b] mb-1">Reason</label>
                <textarea
                  value={extensionReason}
                  onChange={e => setExtensionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-[#0a1628] border border-[#2d3a52] rounded-lg text-sm text-white placeholder:text-[#64748b] focus:outline-none focus:ring-1 focus:ring-[#d4af37]/50 resize-none"
                  placeholder="Why do you need more time?"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowExtensionModal(false)} className="px-4 py-2 text-sm text-[#64748b] hover:text-white">Cancel</button>
              <button
                onClick={requestExtension}
                disabled={submitting || !extensionDate || !extensionReason.trim()}
                className="px-4 py-2 text-sm bg-[#d4af37] text-[#0a1628] rounded-lg hover:bg-[#c5a030] transition-colors flex items-center gap-2 font-semibold"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
