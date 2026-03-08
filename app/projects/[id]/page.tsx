'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Calendar, DollarSign, Clock,
  MapPin, User, FileText, AlertTriangle, TrendingUp,
  CheckCircle, Camera, Banknote, MessageSquare, RefreshCw,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { EscalationControls } from '@/components/projects/EscalationControls';
import { ProjectAISummary } from '@/components/projects/ProjectAISummary';
import { ProjectActivityLog } from '@/components/projects/ProjectActivityLog';

const AGENCY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power & Light',
  GWI: 'Guyana Water Inc.',
  HECI: 'Hinterland Electrification Company Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  MARAD: 'Maritime Administration Department',
  GCAA: 'Guyana Civil Aviation Authority',
  MOPUA: 'Ministry of Public Works',
  HAS: 'Harbour & Aviation Services',
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Complete: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  Delayed: { bg: 'bg-red-500/20', text: 'text-red-400' },
  'In Progress': { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  'Not Started': { bg: 'bg-[#64748b]/20', text: 'text-[#94a3b8]' },
  'On Hold': { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  Cancelled: { bg: 'bg-red-500/20', text: 'text-red-300' },
};

const HEALTH_DOT: Record<string, { color: string; label: string }> = {
  green: { color: 'bg-emerald-400', label: 'On Track' },
  amber: { color: 'bg-amber-400', label: 'Minor Issues' },
  red: { color: 'bg-red-400', label: 'Critical' },
};

function fmtCurrency(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value.replace(/[$,]/g, '')) : Number(value);
  if (isNaN(num) || num <= 0) return '-';
  if (num > 1e11) return '-';
  const abs = Math.abs(num);
  if (abs >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
  return `$${num.toLocaleString()}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'Not set';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Not set';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtRegion(code: string | null): string {
  if (!code) return 'Not specified';
  const n = parseInt(code, 10);
  return isNaN(n) ? code : `Region ${n}`;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role || 'officer';
  const [project, setProject] = useState<any>(null);
  const [funding, setFunding] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fundingOpen, setFundingOpen] = useState(false);

  const loadProject = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/projects/${projectId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/projects/${projectId}/funding`).then(r => r.ok ? r.json() : []).catch(() => []),
    ])
      .then(([p, f]) => { setProject(p); setFunding(f); })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#d4af37] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-white">Project not found</h2>
        <Link href="/projects" className="text-[#d4af37] hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Not Started'];
  const isDelayed = project.status === 'Delayed';
  const pct = project.completion_pct || 0;
  const progressColor = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : pct > 0 ? 'bg-red-500' : 'bg-[#2d3a52]';
  const healthInfo = HEALTH_DOT[project.health] || HEALTH_DOT.green;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/projects"
          className="p-2 rounded-lg bg-[#1a2744] border border-[#2d3a52] hover:border-[#d4af37] transition-colors mt-1"
        >
          <ArrowLeft className="h-5 w-5 text-[#94a3b8]" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-[#0a1628]">
              {project.sub_agency || 'MOPUA'}
            </span>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${ss.bg} ${ss.text}`}>
              {project.status}
            </span>
            {/* Health dot */}
            <span className="inline-flex items-center gap-1.5" title={healthInfo.label}>
              <span className={`w-2.5 h-2.5 rounded-full ${healthInfo.color}`} />
              <span className="text-xs text-[#94a3b8]">{healthInfo.label}</span>
            </span>
            {isDelayed && project.days_overdue > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {project.days_overdue} days overdue
              </span>
            )}
            {project.has_images > 0 && (
              <span className="px-2 py-1 rounded-lg text-xs text-[#64748b] flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" /> {project.has_images} images
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white">{project.project_name}</h1>
          <p className="text-[#64748b] font-mono text-sm mt-1">{project.project_id}</p>
        </div>
      </div>

      {/* Escalation Controls */}
      <EscalationControls
        projectId={project.id}
        projectName={project.project_name || ''}
        escalated={!!project.escalated}
        escalationReason={project.escalation_reason}
        userRole={userRole}
        onUpdate={loadProject}
      />

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-premium p-3 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Completion</span>
          </div>
          <p className="stat-number-lg">{pct}%</p>
          <div className="mt-3 w-full bg-[#2d3a52] rounded-full h-3">
            <div className={`h-3 rounded-full ${progressColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
        </div>

        <div className="card-premium p-3 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Contract Value</span>
          </div>
          <p className="stat-number-lg text-[#d4af37]">{fmtCurrency(project.contract_value)}</p>
        </div>

        <div className="card-premium p-3 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#d4af37]/20 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-[#d4af37]" />
            </div>
            <span className="text-[#64748b] text-sm">Region</span>
          </div>
          <p className="stat-number">{fmtRegion(project.region)}</p>
        </div>

        <div className="card-premium p-3 md:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDelayed ? 'bg-red-500/20' : 'bg-[#d4af37]/20'}`}>
              <Calendar className={`h-5 w-5 ${isDelayed ? 'text-red-400' : 'text-[#d4af37]'}`} />
            </div>
            <span className="text-[#64748b] text-sm">{isDelayed ? 'Overdue' : 'End Date'}</span>
          </div>
          {isDelayed && project.days_overdue > 0 ? (
            <>
              <p className="stat-number text-red-400">{project.days_overdue}</p>
              <p className="text-[#64748b] text-sm">days overdue</p>
            </>
          ) : (
            <p className="stat-number">{fmtDate(project.project_end_date)}</p>
          )}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card-premium p-6">
          <div className="flex items-center gap-2 mb-6">
            <FileText className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Project Information</h2>
          </div>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-[#64748b]">Project Name</p>
              <p className="text-white font-medium mt-1">{project.project_name}</p>
            </div>
            <div>
              <p className="text-[#64748b]">Project ID</p>
              <p className="text-white font-mono mt-1">{project.project_id}</p>
            </div>
            <div>
              <p className="text-[#64748b]">Agency</p>
              <p className="text-white font-medium mt-1">{AGENCY_NAMES[project.sub_agency] || project.sub_agency || 'MOPUA'}</p>
            </div>
            <div>
              <p className="text-[#64748b]">Region</p>
              <p className="text-white font-medium mt-1">{fmtRegion(project.region)}</p>
            </div>
            <div>
              <p className="text-[#64748b]">End Date</p>
              <p className={`font-medium mt-1 ${isDelayed ? 'text-red-400' : 'text-white'}`}>
                {fmtDate(project.project_end_date)}
                {isDelayed && ' (Overdue)'}
              </p>
            </div>
          </div>
        </div>

        <div className="card-premium p-6">
          <div className="flex items-center gap-2 mb-6">
            <User className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Contractor</h2>
          </div>
          <p className="text-white text-xl font-semibold">{project.contractor || 'Not assigned'}</p>
          {project.tender_board_type && (
            <p className="text-[#64748b] text-sm mt-2">Tender Board: {project.tender_board_type}</p>
          )}
        </div>
      </div>

      {/* Oversight Detail Fields */}
      {(project.project_status || project.balance_remaining != null || project.total_distributed != null || project.total_expended != null || project.remarks || project.project_extended) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial Details */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-6">
              <Banknote className="h-5 w-5 text-[#d4af37]" />
              <h2 className="text-lg font-semibold text-white">Financial Details</h2>
            </div>
            <div className="space-y-4 text-sm">
              {project.project_status && (
                <div>
                  <p className="text-[#64748b]">Oversight Status</p>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-lg text-sm font-medium ${
                    project.project_status === 'DELAYED' ? 'bg-red-500/20 text-red-400'
                    : project.project_status === 'COMMENCED' ? 'bg-blue-500/20 text-blue-400'
                    : project.project_status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400'
                    : project.project_status === 'AWARDED' ? 'bg-green-500/20 text-green-400'
                    : project.project_status === 'ROLLOVER' ? 'bg-amber-500/20 text-amber-400'
                    : 'bg-[#2d3a52] text-[#94a3b8]'
                  }`}>
                    {project.project_status}
                  </span>
                </div>
              )}
              {project.balance_remaining != null && (
                <div>
                  <p className="text-[#64748b]">Balance Remaining</p>
                  <p className="text-white font-medium mt-1">{fmtCurrency(project.balance_remaining)}</p>
                </div>
              )}
              {project.contract_value != null && project.balance_remaining != null && (
                <div>
                  <p className="text-[#64748b]">Amount Spent</p>
                  <p className="text-white font-medium mt-1">
                    {fmtCurrency(project.contract_value - project.balance_remaining)}
                    <span className="text-[#64748b] ml-2">
                      ({Math.round(((project.contract_value - project.balance_remaining) / project.contract_value) * 100)}% of contract)
                    </span>
                  </p>
                </div>
              )}
              {project.total_distributed != null && (
                <div>
                  <p className="text-[#64748b]">Total Distributed</p>
                  <p className="text-white font-medium mt-1">{fmtCurrency(project.total_distributed)}</p>
                </div>
              )}
              {project.total_expended != null && (
                <div>
                  <p className="text-[#64748b]">Total Expended</p>
                  <p className="text-white font-medium mt-1">{fmtCurrency(project.total_expended)}</p>
                </div>
              )}
              {project.total_distributed != null && project.total_expended != null && project.total_distributed > 0 && (
                <div>
                  <p className="text-[#64748b]">Funding Utilization</p>
                  <p className="text-white font-medium mt-1">
                    {Math.round((project.total_expended / project.total_distributed) * 100)}%
                    <span className="text-[#64748b] ml-2">
                      ({fmtCurrency(project.total_expended)} of {fmtCurrency(project.total_distributed)})
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Extension Info */}
          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-6">
              <RefreshCw className="h-5 w-5 text-[#d4af37]" />
              <h2 className="text-lg font-semibold text-white">Extension Status</h2>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-[#64748b]">Extended</p>
                <p className={`font-medium mt-1 ${project.project_extended ? 'text-amber-400' : 'text-emerald-400'}`}>
                  {project.project_extended ? 'Yes' : 'No'}
                </p>
              </div>
              {project.extension_date && (
                <div>
                  <p className="text-[#64748b]">New Deadline</p>
                  <p className="text-white font-medium mt-1">{fmtDate(project.extension_date)}</p>
                </div>
              )}
              {project.extension_reason && (
                <div>
                  <p className="text-[#64748b]">Extension Reason</p>
                  <p className="text-[#94a3b8] mt-1 leading-relaxed">{project.extension_reason}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Remarks */}
      {project.remarks && (
        <div className="card-premium p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="h-5 w-5 text-[#d4af37]" />
            <h2 className="text-lg font-semibold text-white">Remarks</h2>
          </div>
          <p className="text-[#94a3b8] text-sm leading-relaxed whitespace-pre-wrap">{project.remarks}</p>
        </div>
      )}

      {/* Funding Distributions */}
      {funding.length > 0 && (
        <div className="card-premium p-6">
          <button
            onClick={() => setFundingOpen(!fundingOpen)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#d4af37]" />
              <h2 className="text-lg font-semibold text-white">
                Funding Distributions ({funding.length})
              </h2>
            </div>
            {fundingOpen
              ? <ChevronUp className="h-5 w-5 text-[#64748b]" />
              : <ChevronDown className="h-5 w-5 text-[#64748b]" />
            }
          </button>
          {fundingOpen && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2d3a52] text-[#64748b]">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Type</th>
                    <th className="text-right py-2 pr-4">Distributed</th>
                    <th className="text-right py-2 pr-4">Expended</th>
                    <th className="text-right py-2 pr-4">Balance</th>
                    <th className="text-left py-2">Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {funding.map((f: any, i: number) => (
                    <tr key={f.id || i} className="border-b border-[#2d3a52]/50 text-[#94a3b8]">
                      <td className="py-2 pr-4">{f.date_distributed ? fmtDate(f.date_distributed) : '-'}</td>
                      <td className="py-2 pr-4">{f.payment_type || '-'}</td>
                      <td className="py-2 pr-4 text-right text-white font-medium">{fmtCurrency(f.amount_distributed)}</td>
                      <td className="py-2 pr-4 text-right">{fmtCurrency(f.amount_expended)}</td>
                      <td className="py-2 pr-4 text-right">{fmtCurrency(f.distributed_balance)}</td>
                      <td className="py-2 font-mono text-xs">{f.contract_ref || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AI Summary */}
      <ProjectAISummary projectId={project.id} />

      {/* Activity Log */}
      <div className="card-premium p-6">
        <ProjectActivityLog projectId={project.id} />
      </div>

      {/* Metadata */}
      <div className="text-sm text-[#64748b] text-center">
        Last updated: {fmtDate(project.updated_at?.split('T')[0])}
      </div>
    </div>
  );
}
