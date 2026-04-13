'use client';

import { useState, useEffect } from 'react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Eye } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { CHART_TOOLTIP_STYLE } from '@/lib/chart-styles';
import type { ProjectDetail } from '@/lib/delayed-projects/types';
import { fmtCurrency, fmtDate, fmtRegion } from '@/components/oversight/types';
import {
  RiskTierBadge, AgencyBadge, DaysOverdueBadge,
  CompletionBar, InterventionTypeBadge, InterventionStatusBadge,
} from './shared';
import { Spinner } from '@/components/ui/Spinner';

interface ProjectDetailPanelProps {
  projectId: string | null;
  onClose: () => void;
}

export function ProjectDetailPanel({ projectId, onClose }: ProjectDetailPanelProps) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    fetch(`/api/delayed-projects/${projectId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDetail(d))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <SlidePanel
      isOpen={!!projectId}
      onClose={onClose}
      title={detail?.project_name || 'Project Details'}
      subtitle={detail ? `${detail.sub_agency} · ${detail.project_reference}` : undefined}
      icon={Eye}
      accentColor="gold"
    >
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="md" />
        </div>
      ) : !detail ? (
        <div className="text-center py-12 text-navy-600 text-sm">Project not found</div>
      ) : (
        <div className="space-y-5">
          {/* Risk & Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <RiskTierBadge tier={detail.risk_tier} />
            <AgencyBadge agency={detail.sub_agency} />
            <DaysOverdueBadge days={detail.days_overdue} />
          </div>

          {/* Completion */}
          <div className="card-premium p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-navy-600 uppercase tracking-wider">Completion</span>
              <span className="text-lg font-bold text-white">{detail.completion_percent}%</span>
            </div>
            <div className="w-full h-3 bg-navy-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full progress-gold"
                style={{ width: `${Math.min(detail.completion_percent, 100)}%` }}
              />
            </div>
          </div>

          {/* Key Details */}
          <div className="grid grid-cols-2 gap-3">
            <DetailItem label="Contract Value" value={fmtCurrency(detail.contract_value / 100)} />
            <DetailItem label="Financial Exposure" value={fmtCurrency(detail.remaining_value / 100)} />
            <DetailItem label="Region" value={fmtRegion(detail.region)} />
            <DetailItem label="End Date" value={fmtDate(detail.project_end_date)} />
            <DetailItem label="Contractor(s)" value={detail.contractors || '-'} span2 />
            <DetailItem label="Tender Board" value={detail.tender_board_type || '-'} />
            <DetailItem label="Status" value={detail.status} />
          </div>

          {/* Snapshot History Sparkline */}
          {detail.snapshots.length > 1 && (
            <div className="card-premium p-4">
              <p className="text-xs text-navy-600 uppercase tracking-wider mb-3">Completion History</p>
              <div className="h-20">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={detail.snapshots.map((s) => ({
                    date: s.snapshot_date,
                    pct: s.completion_percent ?? 0,
                  }))}>
                    <defs>
                      <linearGradient id="sparkGold" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d4af37" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#d4af37" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Tooltip
                      {...CHART_TOOLTIP_STYLE}
                      formatter={(value: number) => [`${value}%`, 'Completion']}
                      labelFormatter={(label: string) => fmtDate(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="pct"
                      stroke="#d4af37"
                      fill="url(#sparkGold)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Interventions */}
          <div>
            <p className="text-xs text-navy-600 uppercase tracking-wider mb-3">
              Interventions ({detail.interventions.length})
            </p>
            {detail.interventions.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No interventions logged yet.</p>
            ) : (
              <div className="space-y-2">
                {detail.interventions.map((inv) => (
                  <div key={inv.id} className="p-3 bg-navy-950/60 rounded-lg border border-navy-800 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <InterventionTypeBadge type={inv.intervention_type} />
                      <InterventionStatusBadge status={inv.status} />
                    </div>
                    <p className="text-xs text-white">{inv.description}</p>
                    <div className="flex items-center gap-3 text-[10px] text-navy-600">
                      {inv.assigned_to && <span>Assigned: {inv.assigned_to}</span>}
                      {inv.due_date && <span>Due: {fmtDate(inv.due_date)}</span>}
                      <span>{new Date(inv.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </SlidePanel>
  );
}

function DetailItem({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <p className="text-[10px] text-navy-600 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}
