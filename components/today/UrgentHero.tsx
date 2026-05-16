'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { fmtGuyanaDate } from '@/lib/format';
import type { TodaySignal } from '@/lib/today/types';
import type { SlaSummary } from '@/lib/today/sla-summary';
import { SlaDonut } from './SlaDonut';
import { agencyColor } from './agency-colors';
import { EscalateModal } from './EscalateModal';
import type { ReferralSourceType } from '@/lib/referrals/types';

interface UrgentHeroProps {
  topSignal: TodaySignal | null;
  sla: SlaSummary;
  agencyBreaches: Map<string, number>;
}

function sourceTypeForSignal(kind: TodaySignal['kind']): ReferralSourceType {
  if (kind === 'tender_sla' || kind === 'stagnant_tender') return 'tender';
  if (kind === 'delayed_project') return 'project';
  return 'other';
}

export function UrgentHero({ topSignal, sla, agencyBreaches }: UrgentHeroProps) {
  const [escalateOpen, setEscalateOpen] = useState(false);
  if (!topSignal) {
    return (
      <article
        className="card-premium relative overflow-hidden p-6 lg:p-8 flex flex-col gap-4 min-h-[420px]"
        aria-label="All clear"
      >
        <HeroAmbience />
        <span className="inline-flex items-center gap-2 self-start px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase badge-success">
          <CheckCircle2 size={12} aria-hidden="true" />
          All clear
        </span>
        <h2 className="text-2xl lg:text-3xl font-bold text-white leading-tight">
          No critical breaches today.
        </h2>
        <p className="text-navy-600 text-sm leading-relaxed max-w-md">
          Every active tender is within its stage SLA. Donut shows SLA performance for the quarter.
        </p>
        <div className="mt-auto pt-4 border-t border-navy-800/40">
          <DonutAndStats sla={sla} />
        </div>
      </article>
    );
  }

  const agency = topSignal.agency ?? '';
  const otherInAgency = agency ? Math.max(0, (agencyBreaches.get(agency) ?? 0) - 1) : 0;

  const subtitle = otherInAgency > 0
    ? `${otherInAgency} other ${otherInAgency === 1 ? 'tender' : 'tenders'} from ${agency} ${otherInAgency === 1 ? 'is' : 'are'} also over SLA.`
    : null;

  const days = topSignal.ageDays ?? 0;

  return (
    <article
      className="card-premium relative overflow-hidden p-6 lg:p-8 flex flex-col gap-4 min-h-[420px]"
      aria-label="Most urgent signal"
    >
      <HeroAmbience />

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase badge-gold">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse-dot"
            aria-hidden="true"
          />
          Most urgent
        </span>
      </div>

      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-600">
        SLA breach
        {agency && (
          <>
            {' · '}
            <span style={{ color: agencyColor(agency) }}>{agency}</span>
          </>
        )}
      </p>

      <h2 className="text-2xl lg:text-3xl font-bold text-white leading-[1.15]">
        {topSignal.title} is{' '}
        <span style={{ color: 'var(--status-error)' }}>{days} {days === 1 ? 'day' : 'days'}</span>
        {' '}past SLA
      </h2>

      {subtitle && (
        <p className="text-navy-600 text-sm leading-relaxed max-w-md">{subtitle}</p>
      )}

      <div className="mt-auto pt-4 border-t border-navy-800/40 space-y-4">
        <DonutAndStats sla={sla} />

        <div className="pt-1 space-y-2">
          <p className="text-xs text-navy-500">
            Top urgency for {days} {days === 1 ? 'day' : 'days'}. Last escalation:{' '}
            {topSignal.lastEscalation
              ? (
                  <>
                    Referred to Minister, {fmtGuyanaDate(topSignal.lastEscalation.submitted_at)},{' '}
                    <span className="font-mono">{topSignal.lastEscalation.reference_number}</span>.
                  </>
                )
              : 'none.'}
          </p>
          <button
            type="button"
            onClick={() => setEscalateOpen(true)}
            className="btn-gold text-sm"
          >
            Escalate
          </button>
        </div>
      </div>

      <EscalateModal
        isOpen={escalateOpen}
        onClose={() => setEscalateOpen(false)}
        sourceType={sourceTypeForSignal(topSignal.kind)}
        sourceId={topSignal.sourceId}
        preFillTitle={topSignal.title}
        preFillAgency={topSignal.agency}
      />
    </article>
  );
}

function HeroAmbience() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'radial-gradient(420px 320px at 18% -10%, rgba(212,175,55,0.08), transparent 60%), radial-gradient(420px 380px at 105% 110%, rgba(0,200,117,0.04), transparent 60%)',
      }}
    />
  );
}

function DonutAndStats({ sla }: { sla: SlaSummary }) {
  return (
    <div className="flex items-center gap-5">
      <SlaDonut pct={sla.slaMetPct} />
      <dl className="flex-1 space-y-1.5 text-sm">
        <StatRow label="Tenders this quarter" value={sla.tendersThisQuarter} valueClass="text-white" />
        <StatRow label="On-time closures" value={sla.onTimeClosures} valueClass="text-emerald-400" />
        <StatRow label="Active breaches" value={sla.activeBreaches} valueClass="text-red-400" />
      </dl>
    </div>
  );
}

function StatRow({ label, value, valueClass }: { label: string; value: number; valueClass: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-navy-600">{label}</dt>
      <dd className={`font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  );
}
