'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Calendar, DollarSign, Clock,
  MapPin, User, FileText, AlertTriangle, TrendingUp,
  CheckCircle, Camera, Banknote, MessageSquare, RefreshCw,
  ChevronDown, ChevronUp, ChevronRight,
} from 'lucide-react';
import { EscalationControls } from '@/components/projects/EscalationControls';
import { ProjectAISummary } from '@/components/projects/ProjectAISummary';
import { ProjectActivityLog } from '@/components/projects/ProjectActivityLog';
import { fmtCurrency, fmtDate } from '@/lib/format';
import { AGENCY_NAMES, PROJECT_STATUS_STYLES as STATUS_STYLES, HEALTH_DOT_LABELED as HEALTH_DOT } from '@/lib/constants/agencies';
import { Spinner } from '@/components/ui/Spinner';

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                               */
/* ------------------------------------------------------------------ */
function CollapsibleSection({
  title,
  icon,
  open,
  onToggle,
  children,
  /** Extra classes on the outer wrapper (e.g. grid layouts) */
  className = '',
  /** When true the section header sits inside a card-premium wrapper that also wraps the children */
  insideCard = false,
}: {
  title: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
  insideCard?: boolean;
}) {
  const header = (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 group w-full text-left"
      aria-expanded={open}
    >
      {open
        ? <ChevronDown className="h-4 w-4 text-navy-600 transition-transform" />
        : <ChevronRight className="h-4 w-4 text-navy-600 transition-transform" />
      }
      {icon}
      <span className="text-navy-600 text-xs font-semibold uppercase tracking-wider">
        {title}
      </span>
    </button>
  );

  if (insideCard) {
    return (
      <div className={`card-premium p-6 ${className}`}>
        {header}
        {open && <div className="mt-4">{children}</div>}
      </div>
    );
  }

  return (
    <div className={className}>
      {header}
      {open && <div className="mt-4">{children}</div>}
    </div>
  );
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

  // Collapsible section states — all open by default
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);
  const [oversightOpen, setOversightOpen] = useState(true);
  const [remarksOpen, setRemarksOpen] = useState(true);
  const [fundingOpen, setFundingOpen] = useState(true);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);

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
        <Spinner />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-24">
        <h2 className="text-xl font-semibold text-white">Project not found</h2>
        <Link href="/projects" className="text-gold-500 hover:underline mt-2 inline-block">
          Back to projects
        </Link>
      </div>
    );
  }

  const ss = STATUS_STYLES[project.status] || STATUS_STYLES['Unknown'];
  const isDelayed = project.status === 'Delayed';
  const pct = project.completion_pct || 0;
  const progressColor = pct >= 80 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : pct > 0 ? 'bg-red-500' : 'bg-navy-800';
  const healthInfo = HEALTH_DOT[project.health] || HEALTH_DOT.green;

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/projects"
          className="p-2 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors mt-1"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-slate-400" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-3">
            <span className="px-3 py-1.5 rounded-lg text-sm font-bold bg-gradient-to-r from-[#d4af37] to-[#b8860b] text-navy-950">
              {project.sub_agency || 'MOPUA'}
            </span>
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${ss.bg} ${ss.text}`}>
              {project.status}
            </span>
            {/* Health dot */}
            <span className="inline-flex items-center gap-1.5" title={healthInfo.label}>
              <span className={`w-2.5 h-2.5 rounded-full ${healthInfo.color}`} />
              <span className="text-xs text-slate-400">{healthInfo.label}</span>
            </span>
            {isDelayed && project.days_overdue > 0 && (
              <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                {project.days_overdue} days overdue
              </span>
            )}
            {project.has_images > 0 && (
              <span className="px-2 py-1 rounded-lg text-xs text-navy-600 flex items-center gap-1">
                <Camera className="h-3.5 w-3.5" /> {project.has_images} images
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold text-white">{project.project_name}</h1>
          <p className="text-navy-600 font-mono text-sm mt-1">{project.project_id}</p>
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
      <CollapsibleSection
        title="Key Metrics"
        icon={<TrendingUp className="h-4 w-4 text-gold-500" />}
        open={metricsOpen}
        onToggle={() => setMetricsOpen(o => !o)}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-premium p-3 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-gold-500" />
              </div>
              <span className="text-navy-600 text-sm">Completion</span>
            </div>
            <p className="stat-number-lg">{pct}%</p>
            <div className="mt-3 w-full bg-navy-800 rounded-full h-3">
              <div className={`h-3 rounded-full ${progressColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>

          <div className="card-premium p-3 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-gold-500" />
              </div>
              <span className="text-navy-600 text-sm">Contract Value</span>
            </div>
            <p className="stat-number-lg text-gold-500">{fmtCurrency(project.contract_value)}</p>
          </div>

          <div className="card-premium p-3 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-gold-500" />
              </div>
              <span className="text-navy-600 text-sm">Region</span>
            </div>
            <p className="stat-number">{fmtRegion(project.region)}</p>
          </div>

          <div className="card-premium p-3 md:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDelayed ? 'bg-red-500/20' : 'bg-gold-500/20'}`}>
                <Calendar className={`h-5 w-5 ${isDelayed ? 'text-red-400' : 'text-gold-500'}`} />
              </div>
              <span className="text-navy-600 text-sm">{isDelayed ? 'Overdue' : 'End Date'}</span>
            </div>
            {isDelayed && project.days_overdue > 0 ? (
              <>
                <p className="stat-number text-red-400">{project.days_overdue}</p>
                <p className="text-navy-600 text-sm">days overdue</p>
              </>
            ) : (
              <p className="stat-number">{fmtDate(project.project_end_date)}</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Project Details */}
      <CollapsibleSection
        title="Project Details"
        icon={<FileText className="h-4 w-4 text-gold-500" />}
        open={infoOpen}
        onToggle={() => setInfoOpen(o => !o)}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="h-5 w-5 text-gold-500" />
              <h2 className="text-lg font-semibold text-white">Project Information</h2>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-navy-600">Project Name</p>
                <p className="text-white font-medium mt-1">{project.project_name}</p>
              </div>
              <div>
                <p className="text-navy-600">Project ID</p>
                <p className="text-white font-mono mt-1">{project.project_id}</p>
              </div>
              <div>
                <p className="text-navy-600">Agency</p>
                <p className="text-white font-medium mt-1">{AGENCY_NAMES[project.sub_agency] || project.sub_agency || 'MOPUA'}</p>
              </div>
              <div>
                <p className="text-navy-600">Region</p>
                <p className="text-white font-medium mt-1">{fmtRegion(project.region)}</p>
              </div>
              <div>
                <p className="text-navy-600">Start Date</p>
                <p className="text-white font-medium mt-1">{fmtDate(project.start_date)}</p>
                {project.revised_start_date && project.revised_start_date !== project.start_date && (
                  <p className="text-gold-500 text-xs mt-0.5">Revised: {fmtDate(project.revised_start_date)}</p>
                )}
              </div>
              <div>
                <p className="text-navy-600">End Date</p>
                <p className={`font-medium mt-1 ${isDelayed ? 'text-red-400' : 'text-white'}`}>
                  {fmtDate(project.project_end_date)}
                  {isDelayed && ' (Overdue)'}
                </p>
              </div>
            </div>
          </div>

          <div className="card-premium p-6">
            <div className="flex items-center gap-2 mb-6">
              <User className="h-5 w-5 text-gold-500" />
              <h2 className="text-lg font-semibold text-white">Contractor</h2>
            </div>
            <p className="text-white text-xl font-semibold">{project.contractor || 'Not assigned'}</p>
            {project.tender_board_type && (
              <p className="text-navy-600 text-sm mt-2">Tender Board: {project.tender_board_type}</p>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Oversight Detail Fields */}
      {(project.balance_remaining != null || project.total_distributed != null || project.total_expended != null || project.remarks || project.project_extended) && (
        <CollapsibleSection
          title="Oversight Details"
          icon={<Banknote className="h-4 w-4 text-gold-500" />}
          open={oversightOpen}
          onToggle={() => setOversightOpen(o => !o)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Financial Details */}
            <div className="card-premium p-6">
              <div className="flex items-center gap-2 mb-6">
                <Banknote className="h-5 w-5 text-gold-500" />
                <h2 className="text-lg font-semibold text-white">Financial Details</h2>
              </div>
              <div className="space-y-4 text-sm">
                {project.balance_remaining != null && (
                  <div>
                    <p className="text-navy-600">Balance Remaining</p>
                    <p className="text-white font-medium mt-1">{fmtCurrency(project.balance_remaining)}</p>
                  </div>
                )}
                {project.contract_value != null && project.balance_remaining != null && (
                  <div>
                    <p className="text-navy-600">Amount Spent</p>
                    <p className="text-white font-medium mt-1">
                      {fmtCurrency(project.contract_value - project.balance_remaining)}
                      <span className="text-navy-600 ml-2">
                        ({Math.round(((project.contract_value - project.balance_remaining) / project.contract_value) * 100)}% of contract)
                      </span>
                    </p>
                  </div>
                )}
                {project.total_distributed != null && (
                  <div>
                    <p className="text-navy-600">Total Distributed</p>
                    <p className="text-white font-medium mt-1">{fmtCurrency(project.total_distributed)}</p>
                  </div>
                )}
                {project.total_expended != null && (
                  <div>
                    <p className="text-navy-600">Total Expended</p>
                    <p className="text-white font-medium mt-1">{fmtCurrency(project.total_expended)}</p>
                  </div>
                )}
                {project.total_distributed != null && project.total_expended != null && project.total_distributed > 0 && (
                  <div>
                    <p className="text-navy-600">Funding Utilization</p>
                    <p className="text-white font-medium mt-1">
                      {Math.round((project.total_expended / project.total_distributed) * 100)}%
                      <span className="text-navy-600 ml-2">
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
                <RefreshCw className="h-5 w-5 text-gold-500" />
                <h2 className="text-lg font-semibold text-white">Extension Status</h2>
              </div>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="text-navy-600">Extended</p>
                  <p className={`font-medium mt-1 ${project.project_extended ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {project.project_extended ? 'Yes' : 'No'}
                  </p>
                </div>
                {project.extension_date && (
                  <div>
                    <p className="text-navy-600">New Deadline</p>
                    <p className="text-white font-medium mt-1">{fmtDate(project.extension_date)}</p>
                  </div>
                )}
                {project.extension_reason && (
                  <div>
                    <p className="text-navy-600">Extension Reason</p>
                    <p className="text-slate-400 mt-1 leading-relaxed">{project.extension_reason}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CollapsibleSection>
      )}

      {/* Remarks */}
      {project.remarks && (
        <CollapsibleSection
          title="Remarks"
          icon={<MessageSquare className="h-4 w-4 text-gold-500" />}
          open={remarksOpen}
          onToggle={() => setRemarksOpen(o => !o)}
          insideCard
        >
          <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-wrap">{project.remarks}</p>
        </CollapsibleSection>
      )}

      {/* Funding Distributions */}
      {funding.length > 0 && (
        <CollapsibleSection
          title={`Funding Distributions (${funding.length})`}
          icon={<DollarSign className="h-4 w-4 text-gold-500" />}
          open={fundingOpen}
          onToggle={() => setFundingOpen(o => !o)}
          insideCard
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Funding distributions">
              <thead>
                <tr className="border-b border-navy-800 text-navy-600">
                  <th scope="col" className="text-left py-2 pr-4">Date</th>
                  <th scope="col" className="text-left py-2 pr-4">Type</th>
                  <th scope="col" className="text-right py-2 pr-4">Distributed</th>
                  <th scope="col" className="text-right py-2 pr-4">Expended</th>
                  <th scope="col" className="text-right py-2 pr-4">Balance</th>
                  <th scope="col" className="text-left py-2">Ref</th>
                </tr>
              </thead>
              <tbody>
                {funding.map((f: any, i: number) => (
                  <tr key={f.id || i} className="border-b border-navy-800/50 text-slate-400">
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
        </CollapsibleSection>
      )}

      {/* AI Summary */}
      <CollapsibleSection
        title="AI Summary"
        icon={<FileText className="h-4 w-4 text-gold-500" />}
        open={aiSummaryOpen}
        onToggle={() => setAiSummaryOpen(o => !o)}
      >
        <ProjectAISummary projectId={project.id} />
      </CollapsibleSection>

      {/* Activity Log */}
      <CollapsibleSection
        title="Activity Log"
        icon={<Clock className="h-4 w-4 text-gold-500" />}
        open={activityOpen}
        onToggle={() => setActivityOpen(o => !o)}
        insideCard
      >
        <ProjectActivityLog projectId={project.id} />
      </CollapsibleSection>

      {/* Metadata */}
      <div className="text-sm text-navy-600 text-center">
        Last updated: {fmtDate(project.updated_at?.split('T')[0])}
      </div>
    </div>
  );
}
