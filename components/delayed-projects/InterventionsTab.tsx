'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, Clock, CheckCircle, Users, Plus,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { fmtDate } from '@/components/oversight/types';
import type {
  Intervention, InterventionSummary, DelayedProjectWithComputed,
  InterventionStatus,
} from '@/lib/delayed-projects/types';
import {
  WarRoomKpiCard, AgencyBadge, InterventionTypeBadge,
  InterventionStatusBadge, DaysOverdueBadge,
} from './shared';
import { InterventionModal } from './InterventionModal';

interface InterventionsTabProps {
  isMobile: boolean;
  onRefresh: () => void;
}

export function InterventionsTab({ isMobile, onRefresh }: InterventionsTabProps) {
  const [summary, setSummary] = useState<InterventionSummary | null>(null);
  const [interventions, setInterventions] = useState<(Intervention & { project_name?: string; sub_agency?: string })[]>([]);
  const [unattended, setUnattended] = useState<DelayedProjectWithComputed[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalProjectId, setModalProjectId] = useState('');
  const [modalProjectName, setModalProjectName] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, listRes, projectsRes] = await Promise.all([
        fetch('/api/delayed-projects/interventions?summary=true'),
        fetch('/api/delayed-projects/interventions?limit=500'),
        fetch('/api/delayed-projects?limit=200'),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());

      let allInterventions: (Intervention & { project_name?: string; sub_agency?: string })[] = [];
      if (listRes.ok) {
        const data = await listRes.json();
        allInterventions = data.interventions || [];
        setInterventions(allInterventions);
      }

      if (projectsRes.ok) {
        const data = await projectsRes.json();
        const allProjects: DelayedProjectWithComputed[] = data.projects || [];
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

  function handleLogIntervention(projectId: string, projectName: string) {
    setModalProjectId(projectId);
    setModalProjectName(projectName);
    setShowModal(true);
  }

  function handleCreated() {
    fetchData();
    onRefresh();
  }

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
      {/* Intervention Modal */}
      <InterventionModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreated={handleCreated}
        projectId={modalProjectId}
        projectName={modalProjectName}
      />

      {/* KPI Summary Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <WarRoomKpiCard
            label="Total Interventions"
            value={summary.total.toLocaleString()}
            icon={CheckCircle}
            accent="text-blue-400"
            bgAccent="bg-blue-500/15"
          />
          <WarRoomKpiCard
            label="Pending Follow-ups"
            value={(summary.pending + summary.in_progress).toLocaleString()}
            icon={Clock}
            accent="text-amber-400"
            bgAccent="bg-amber-500/15"
          />
          <WarRoomKpiCard
            label="Overdue Follow-ups"
            value={summary.overdue.toLocaleString()}
            icon={AlertTriangle}
            accent={summary.overdue > 0 ? 'text-red-400' : 'text-emerald-400'}
            bgAccent={summary.overdue > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
            alert={summary.overdue > 0}
          />
          <WarRoomKpiCard
            label="Unattended Projects"
            value={summary.projects_with_zero.toLocaleString()}
            icon={Users}
            accent={summary.projects_with_zero > 0 ? 'text-red-400' : 'text-emerald-400'}
            bgAccent={summary.projects_with_zero > 0 ? 'bg-red-500/15' : 'bg-emerald-500/15'}
            alert={summary.projects_with_zero > 5}
            sub={summary.projects_with_zero > 0 ? 'Zero interventions logged' : 'All projects covered'}
          />
        </div>
      )}

      {/* Unattended Projects Callout */}
      {unattended.length > 0 && (
        <div className="card-premium p-5 border-red-500/20">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <h3 className="text-sm font-semibold text-red-400">
              Unattended Projects ({unattended.length})
            </h3>
          </div>
          <p className="text-xs text-slate-400 mb-3">
            These delayed projects have zero interventions logged — nobody is tracking action on them.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {unattended.map((p) => (
              <div key={p.id} className="flex items-center gap-2 p-2 bg-navy-950/40 rounded-lg">
                <AgencyBadge agency={p.sub_agency} />
                <span className="text-xs text-white truncate flex-1">{p.project_name}</span>
                <DaysOverdueBadge days={p.days_overdue} />
                <button
                  onClick={() => handleLogIntervention(p.id, p.project_name)}
                  className="btn-navy px-2 py-1 text-[10px] flex items-center gap-1 shrink-0"
                >
                  <Plus className="h-3 w-3" /> Log
                </button>
              </div>
            ))}
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
          <div className="space-y-3 max-h-96 overflow-y-auto">
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
                        {' '}{inv.project_name}
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
                          {inv.project_name || '-'}
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
