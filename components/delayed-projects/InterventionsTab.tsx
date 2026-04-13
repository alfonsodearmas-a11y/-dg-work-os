'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Plus,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/oversight/types';
import { getShortName } from '@/lib/delayed-projects/short-names';
import type {
  Intervention, DelayedProjectWithComputed,
  InterventionStatus,
} from '@/lib/delayed-projects/types';
import {
  AgencyBadge, InterventionTypeBadge,
  InterventionStatusBadge, DaysOverdueBadge,
} from './shared';

interface InterventionSectionProps {
  isMobile: boolean;
  onRefresh: () => void;
  onLogIntervention: (projectId: string, projectName: string) => void;
}

export function InterventionsTab({ isMobile, onRefresh, onLogIntervention }: InterventionSectionProps) {
  const [interventions, setInterventions] = useState<(Intervention & { project_name?: string; sub_agency?: string })[]>([]);
  const [unattended, setUnattended] = useState<DelayedProjectWithComputed[]>([]);
  const [totalProjects, setTotalProjects] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, projectsRes] = await Promise.all([
        fetch('/api/delayed-projects/interventions?limit=500'),
        fetch('/api/delayed-projects?limit=200'),
      ]);

      let allInterventions: (Intervention & { project_name?: string; sub_agency?: string })[] = [];
      if (listRes.ok) {
        const data = await listRes.json();
        allInterventions = data.interventions || [];
        setInterventions(allInterventions);
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        const allProjects: DelayedProjectWithComputed[] = data.projects || [];
        setTotalProjects(allProjects.length);
        const projectIdsWithInterventions = new Set(
          allInterventions.map((inv) => inv.project_id),
        );
        setUnattended(allProjects.filter((p) => !projectIdsWithInterventions.has(p.id)));
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

  // Expose refetch so parent can call after logging an intervention
  useEffect(() => {
    // Re-fetch when parent triggers a refresh (e.g. after logging an intervention)
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

  return (
    <div className="space-y-5">
      {/* Unattended Projects Banner */}
      {unattended.length > 0 ? (
        <div className="rounded-xl border-2 border-red-500/40 bg-red-500/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">
              {unattended.length} of {totalProjects} projects have zero interventions logged
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Nobody is tracking action on these delayed projects. Log an intervention to begin accountability tracking.
          </p>
          <div className="space-y-2">
            {unattended.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2 bg-navy-950/40 rounded-lg">
                <AgencyBadge agency={p.sub_agency} />
                <span className="text-xs text-white truncate flex-1" title={p.project_name}>{getShortName(p.project_name)}</span>
                <span className="text-xs text-slate-400 tabular-nums shrink-0">{p.completion_percent}%</span>
                <DaysOverdueBadge endDate={p.project_end_date} />
                <button
                  onClick={() => onLogIntervention(p.id, p.project_name)}
                  className="btn-navy px-2 py-1 text-[10px] flex items-center gap-1 shrink-0"
                >
                  <Plus className="h-3 w-3" /> Log
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-emerald-500/40 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-emerald-400">
              All projects have at least one intervention logged.
            </span>
          </div>
        </div>
      )}

      {/* Intervention Timeline */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Intervention Timeline</h3>
        </div>

        {interventions.length === 0 ? (
          <p className="text-xs text-slate-500 text-center py-8 italic">
            No interventions logged yet. Use the &quot;Log&quot; button above to record the first intervention.
          </p>
        ) : (
          <div className="space-y-3">
            {interventions.map((inv) => (
              <div key={inv.id} className="flex gap-3 p-3 bg-navy-950/40 rounded-lg border border-navy-800/60">
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
                {/* Quick status change */}
                {inv.status !== 'COMPLETED' && (
                  <div className="shrink-0">
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
                  </div>
                )}
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
                        <td className="text-white text-xs truncate max-w-[150px]">
                          {inv.project_name ? getShortName(inv.project_name) : '-'}
                        </td>
                        <td><InterventionTypeBadge type={inv.intervention_type} /></td>
                        <td className="text-slate-400 text-xs">{inv.assigned_to || '-'}</td>
                        <td className={`text-xs tabular-nums ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>
                          {inv.due_date ? fmtDate(inv.due_date) : '-'}
                        </td>
                        <td><InterventionStatusBadge status={inv.status} /></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
