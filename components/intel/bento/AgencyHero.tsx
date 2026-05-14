import Link from 'next/link';
import {
  ArrowLeft,
  Anchor,
  Droplets,
  FileSpreadsheet,
  Lightbulb,
  Plane,
  PlaneLanding,
  Shield,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { GenerateReportButton } from '../GenerateReportModal';
import { INTEL_AGENCY_META, type IntelAgency } from '@/lib/agencies';
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';

const ICON_BY_NAME: Record<string, LucideIcon> = {
  Zap,
  Droplets,
  Plane,
  PlaneLanding,
  Shield,
  Lightbulb,
  Anchor,
};

interface AgencyHeroProps {
  slug: IntelAgency;
  data: AgencyIntelData;
}

export function AgencyHero({ slug, data }: AgencyHeroProps) {
  const meta = INTEL_AGENCY_META[slug];
  if (!meta) return null;
  const Icon = ICON_BY_NAME[meta.iconName] ?? Zap;

  const openTasks = data.open_tasks.length;
  const overdueTasks = data.open_tasks.filter((t) => t.is_overdue).length;
  const delayedProjects = data.delayed_projects.length;
  const criticalTenders = data.critical_procurement.length;
  const evalTenders = data.evaluation_tenders.length;
  const generated = new Date(data.generated_at);
  const generatedLabel = generated.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <header className="space-y-4">
      <div className="flex items-center gap-3 md:gap-4 flex-wrap">
        <Link
          href="/intel"
          className="inline-flex items-center gap-1.5 p-2 pr-3 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 transition-colors text-slate-400 hover:text-white text-xs uppercase tracking-wider shrink-0"
          aria-label="Back to Agency Intel"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Intel</span>
        </Link>
        <div className="flex items-center gap-3 md:gap-4 min-w-0 flex-1">
          <div
            className={`h-12 w-12 rounded-2xl bg-gradient-to-br ${meta.iconGradient} flex items-center justify-center shrink-0 shadow-lg shadow-black/20 ring-1 ring-white/10`}
          >
            <Icon className="text-white" size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.2em] text-gold-500/80">
              Agency Deep Dive
            </p>
            <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight leading-tight truncate">
              {meta.display}
            </h1>
            <p className="text-navy-600 text-sm truncate">{meta.subtitle}</p>
          </div>
        </div>
        {slug === 'gpl' ? (
          <Link
            href="/intel/gpl/dbis"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-900 border border-navy-800 hover:border-gold-500 text-slate-300 hover:text-white text-sm transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Daily DBIS upload
          </Link>
        ) : null}
        <GenerateReportButton agency={slug} agencyDisplay={meta.display} />
      </div>

      <dl className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <MetaPill
          label="Tasks"
          value={openTasks}
          qualifier={overdueTasks > 0 ? `${overdueTasks} overdue` : null}
        />
        <MetaPill label="Projects" value={delayedProjects} />
        <MetaPill label="Procurement" value={criticalTenders} />
        <MetaPill label="Tenders" value={evalTenders} />
        <span className="text-navy-600 ml-auto whitespace-nowrap">Synced {generatedLabel}</span>
      </dl>

      <div className="h-px bg-gradient-to-r from-transparent via-navy-800 to-transparent" />
    </header>
  );
}

// Mirrors the card-header right-slot pattern: small uppercase label, white
// semibold count, muted "· qualifier" trailing. Single visual pattern across
// the page for the same shape of information.
function MetaPill({
  label,
  value,
  qualifier,
}: {
  label: string;
  value: number;
  qualifier?: string | null;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-navy-600">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-white">{value}</dd>
      {qualifier ? (
        <span className="text-[11px] text-navy-600">· {qualifier}</span>
      ) : null}
    </span>
  );
}
