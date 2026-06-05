'use client';

import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, MessageSquare, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEffectiveUser } from '@/components/providers/ViewAsProvider';
import { useToast } from '@/components/ui/Toast';
import { fmtDate } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import type {
  Intervention,
  InterventionSummary,
  InterventionStatus,
} from '@/lib/delayed-projects/types';
import {
  AgencyBadge, InterventionTypeBadge,
  InterventionStatusBadge,
} from './shared';

interface InterventionSectionProps {
  interventionSummary: InterventionSummary | null;
}

const BANNER_STYLES = {
  critical: 'bg-red-500/5 border-red-500/30 backdrop-blur-xl',
  warning: 'bg-amber-500/5 border-amber-500/30 backdrop-blur-xl',
  clear: 'bg-emerald-500/5 border-emerald-500/30 backdrop-blur-xl',
} as const;

const BANNER_TEXT_STYLES = {
  critical: 'text-red-400',
  warning: 'text-amber-400',
  clear: 'text-emerald-400',
} as const;

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="p-1 rounded text-navy-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
      aria-label="Delete intervention"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

export function InterventionsTab({ interventionSummary }: InterventionSectionProps) {
  const { effectiveUser } = useEffectiveUser();
  const { toast } = useToast();
  const [interventions, setInterventions] = useState<(Intervention & { project_name?: string; sub_agency?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; description: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const unattendedCount = interventionSummary?.projects_with_zero ?? 0;
  const totalProjects = interventionSummary?.total_projects ?? 0;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/delayed-projects/interventions?limit=500');
      if (res.ok) {
        const data = await res.json();
        setInterventions(data.interventions || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleStatusChange(interventionId: string, newStatus: InterventionStatus) {
    try {
      const res = await fetch(`/api/delayed-projects/interventions/${interventionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchData();
    } catch {}
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/delayed-projects/interventions/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchData();
        window.dispatchEvent(new Event('intervention-deleted'));
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || 'Failed to delete intervention');
      }
    } catch {
      toast.error('Failed to delete intervention');
    }
    setDeleting(false);
    setDeleteTarget(null);
  }

  function canDelete(inv: Intervention): boolean {
    const isDG = effectiveUser.role === 'superadmin';
    const isCreator =
      inv.created_by === effectiveUser.name ||
      inv.created_by === effectiveUser.email;
    return isDG || isCreator;
  }

  // Expose refetch so parent can call after logging an intervention
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('intervention-created', handler);
    return () => window.removeEventListener('intervention-created', handler);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="md" />
      </div>
    );
  }

  // Pending/in-progress interventions for follow-up tracker
  const followUps = interventions.filter((inv) =>
    inv.status === 'PENDING' || inv.status === 'IN_PROGRESS' || inv.status === 'OVERDUE',
  );

  // Banner severity
  const ratio = totalProjects > 0 ? unattendedCount / totalProjects : 0;
  const bannerSeverity = ratio > 0.5 ? 'critical' : ratio > 0 ? 'warning' : 'clear';

  return (
    <div className="space-y-5">
      {/* Intervention Accountability Banner */}
      {unattendedCount > 0 ? (
        <div className={`rounded-xl border p-5 flex items-center gap-4 transition-all duration-500 ${BANNER_STYLES[bannerSeverity]}`}>
          <AlertTriangle className={`h-6 w-6 shrink-0 ${BANNER_TEXT_STYLES[bannerSeverity]}`} />
          <div>
            <p className={`font-serif font-normal text-xl leading-tight ${BANNER_TEXT_STYLES[bannerSeverity]}`}>
              {unattendedCount} of {totalProjects}
            </p>
            <p className={`text-sm font-medium ${BANNER_TEXT_STYLES[bannerSeverity]} opacity-80`}>
              projects have zero interventions logged
            </p>
          </div>
        </div>
      ) : totalProjects > 0 ? (
        <div className={`rounded-xl border p-5 flex items-center gap-3 ${BANNER_STYLES.clear}`}>
          <span className="font-serif font-normal text-lg text-emerald-400">
            All projects have at least one intervention logged.
          </span>
        </div>
      ) : null}

      {/* Intervention Timeline */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Intervention Timeline</h3>
        </div>

        {interventions.length === 0 ? (
          <EmptyState
            icon={<div className="w-12 h-12 rounded-xl bg-navy-800/50 flex items-center justify-center"><MessageSquare className="w-6 h-6" /></div>}
            title="No Interventions Yet"
            description='Use the "+ Log" button on any project above to record the first intervention.'
          />
        ) : (
          <div className="space-y-3">
            {interventions.map((inv) => (
              <div key={inv.id} className="flex gap-3 p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] backdrop-blur-sm">
                <div className="shrink-0 pt-0.5">
                  <div className="w-2 h-2 rounded-full bg-gold-500" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <InterventionTypeBadge type={inv.intervention_type} />
                    <InterventionStatusBadge status={inv.status} />
                    {inv.project_name && (
                      <span className="text-[10px] text-navy-600">
                        {inv.sub_agency && <AgencyBadge agency={inv.sub_agency} />}
                        {' '}{getShortName(inv.project_name)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white">{inv.description}</p>
                  <div className="flex items-center gap-3 text-[10px] text-navy-600">
                    {inv.assigned_to && <span>Assigned: <span className="text-slate-400">{inv.assigned_to}</span></span>}
                    {inv.due_date && <span>Due: <span className="text-slate-400">{fmtDate(inv.due_date)}</span></span>}
                    <span>By: <span className="text-slate-400">{inv.created_by}</span></span>
                    <span>{new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {inv.status !== 'COMPLETED' && (
                    <select
                      value={inv.status}
                      onChange={(e) => handleStatusChange(inv.id, e.target.value as InterventionStatus)}
                      className="bg-navy-950 border border-navy-800 rounded text-[10px] text-slate-400 px-1.5 py-1 focus:border-gold-500 focus:outline-none"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="OVERDUE">Overdue</option>
                    </select>
                  )}
                  {canDelete(inv) && (
                    <DeleteButton onClick={() => setDeleteTarget({ id: inv.id, description: inv.description })} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Follow-Up Tracker */}
      {followUps.length > 0 && (
        <div className="card-premium p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Follow-Up Tracker</h3>
          <div className="overflow-x-auto">
            <table className="table-premium w-full text-sm">
              <thead>
                <tr>
                  <th className="text-left">Project</th>
                  <th className="text-left">Action</th>
                  <th className="text-left">Assigned</th>
                  <th className="text-left">Due Date</th>
                  <th className="text-left">Status</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {followUps
                  .sort((a, b) => {
                    if (!a.due_date) return 1;
                    if (!b.due_date) return -1;
                    return a.due_date.localeCompare(b.due_date);
                  })
                  .map((inv) => {
                    const isOverdue = inv.due_date && new Date(inv.due_date + 'T00:00:00') < new Date() && inv.status !== 'COMPLETED';
                    return (
                      <tr key={inv.id} className={isOverdue ? 'bg-red-500/5' : ''}>
                        <td className="text-white text-xs max-w-[180px]">
                          {inv.project_name ? getShortName(inv.project_name) : '-'}
                        </td>
                        <td><InterventionTypeBadge type={inv.intervention_type} /></td>
                        <td className="text-slate-400 text-xs">{inv.assigned_to || '-'}</td>
                        <td className={`text-xs tabular-nums ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                          {inv.due_date ? fmtDate(inv.due_date) : '-'}
                        </td>
                        <td><InterventionStatusBadge status={inv.status} /></td>
                        <td>
                          {canDelete(inv) && (
                            <DeleteButton onClick={() => setDeleteTarget({ id: inv.id, description: inv.description })} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-navy-900 border border-navy-800 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-navy-800">
              <h2 className="text-lg font-semibold text-white">Delete Intervention</h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-slate-300">Delete this intervention? This cannot be undone.</p>
              <p className="text-xs text-navy-600 line-clamp-2">&ldquo;{deleteTarget.description}&rdquo;</p>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-navy-800">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="btn-navy px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {deleting && <Spinner size="sm" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
