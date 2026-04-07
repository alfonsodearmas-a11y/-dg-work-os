'use client';

import {
  Building2, Calendar, MapPin, Hash, FileText,
  ImageIcon, Clock, Briefcase,
} from 'lucide-react';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { fmtCurrency, fmtDate, fmtRegion, type OversightProject } from './types';
import { ProgressBar, OversightStatusBadge } from './shared';

function DetailRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 text-navy-600 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="text-xs text-navy-600 uppercase tracking-wider">{label}</p>
        <div className="text-sm text-white mt-0.5">{value || <span className="text-navy-600">-</span>}</div>
      </div>
    </div>
  );
}

export function MinistryProjectDetail({
  project,
  onClose,
}: {
  project: OversightProject | null;
  onClose: () => void;
}) {
  if (!project) return null;

  const lots = project.contract_lots || [];

  return (
    <SlidePanel
      isOpen={!!project}
      onClose={onClose}
      title={project.project_name}
      subtitle={`${project.sub_agency} · #${project.project_id}`}
      icon={Building2}
      accentColor="from-gold-500/30 to-amber-600/30"
    >
      <div className="space-y-5">
        {/* Status + Completion */}
        <div className="flex items-center gap-3 flex-wrap">
          <OversightStatusBadge status={project.project_status} />
          <div className="flex-1 min-w-[120px]">
            <ProgressBar pct={project.completion_percent} />
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-3">
            <p className="text-navy-600 text-xs uppercase tracking-wider">Contract Value</p>
            <p className="text-white text-lg font-bold mt-1">{fmtCurrency(project.contract_value_total)}</p>
          </div>
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-3">
            <p className="text-navy-600 text-xs uppercase tracking-wider">Completion</p>
            <p className="text-white text-lg font-bold mt-1">{project.completion_percent}%</p>
          </div>
        </div>

        {/* Project Details */}
        <div className="bg-navy-900 border border-navy-800 rounded-xl p-4 space-y-1">
          <h3 className="text-white text-sm font-semibold mb-2">Project Details</h3>
          <DetailRow label="Project ID" value={`#${project.project_id}`} icon={Hash} />
          {project.project_reference && (
            <DetailRow label="Reference" value={project.project_reference} icon={FileText} />
          )}
          <DetailRow label="Executing Agency" value={project.executing_agency} icon={Building2} />
          <DetailRow label="Sub Agency" value={project.sub_agency} icon={Briefcase} />
          <DetailRow label="Region" value={fmtRegion(project.region != null ? String(project.region) : null)} icon={MapPin} />
          <DetailRow label="End Date" value={fmtDate(project.project_end_date)} icon={Calendar} />
          {project.tender_board_type && (
            <DetailRow label="Tender Board" value={project.tender_board_type} />
          )}
          <DetailRow
            label="Images"
            value={project.has_images > 0 ? `${project.has_images} image${project.has_images !== 1 ? 's' : ''}` : 'None'}
            icon={ImageIcon}
          />
        </div>

        {/* Contract Lots */}
        {lots.length > 0 && (
          <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
            <h3 className="text-white text-sm font-semibold mb-3">
              {lots.length === 1 ? 'Contractor' : `Contractors (${lots.length} lots)`}
            </h3>
            <div className="space-y-2">
              {lots.map((lot, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 py-2 border-b border-navy-800/50 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{lot.contractor}</p>
                    {lots.length > 1 && <p className="text-xs text-navy-600">Lot {i + 1}</p>}
                  </div>
                  <span className="text-sm text-gold-500 font-medium shrink-0">
                    {fmtCurrency(lot.value)}
                  </span>
                </div>
              ))}
            </div>
            {lots.length > 1 && (
              <div className="mt-3 pt-2 border-t border-navy-800 flex items-center justify-between">
                <span className="text-xs text-navy-600 uppercase tracking-wider">Total</span>
                <span className="text-sm text-white font-bold">{fmtCurrency(project.contract_value_total)}</span>
              </div>
            )}
          </div>
        )}

        {/* Sync Info */}
        {project.last_synced_at && (
          <div className="flex items-center gap-2 text-xs text-navy-600">
            <Clock className="h-3 w-3" />
            Last synced: {new Date(project.last_synced_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </SlidePanel>
  );
}
