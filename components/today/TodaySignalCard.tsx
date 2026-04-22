'use client';

import Link from 'next/link';
import { AlertTriangle, FileText, CheckSquare, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { TodaySignal, TodaySeverity, TodaySignalKind } from '@/lib/today/types';

const SEVERITY_VARIANT: Record<TodaySeverity, 'danger' | 'warning' | 'info'> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
};

const SEVERITY_LABEL: Record<TodaySeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
};

const KIND_LABEL: Record<TodaySignalKind, string> = {
  delayed_project: 'Project',
  tender_sla: 'Procurement',
  meeting_action: 'Action',
};

const KIND_ICON: Record<TodaySignalKind, typeof AlertTriangle> = {
  delayed_project: AlertTriangle,
  tender_sla: FileText,
  meeting_action: CheckSquare,
};

export function TodaySignalCard({ signal }: { signal: TodaySignal }) {
  const Icon = KIND_ICON[signal.kind];
  return (
    <Link
      href={signal.href}
      className="card-premium group flex items-start gap-4 p-4 transition-colors hover:border-gold-500/40"
    >
      <div className="mt-0.5 text-navy-600 group-hover:text-gold-400">
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={SEVERITY_VARIANT[signal.severity]}>{SEVERITY_LABEL[signal.severity]}</Badge>
          <span className="text-xs uppercase tracking-wide text-navy-600">{KIND_LABEL[signal.kind]}</span>
          {signal.agency && (
            <span className="text-xs font-medium text-slate-400">{signal.agency}</span>
          )}
        </div>
        <h3 className="truncate text-sm font-medium text-white">{signal.title}</h3>
        {signal.subtitle && (
          <p className="truncate text-xs text-navy-600">{signal.subtitle}</p>
        )}
        <p className="mt-1 font-mono text-xs text-slate-400">{signal.metric}</p>
      </div>

      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-navy-600 group-hover:text-gold-400" />
    </Link>
  );
}
