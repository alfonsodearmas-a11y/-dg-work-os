import { listTenders } from '@/lib/tender/queries';
import { TODAY_THRESHOLDS } from './thresholds';
import type { Role } from '@/lib/auth-helpers';

export interface SlaSummary {
  tendersThisQuarter: number;
  closuresThisQuarter: number;
  onTimeClosures: number;
  activeBreaches: number;
  slaMetPct: number;
  asOf: string;
}

function quarterStartUTC(now: Date): Date {
  const qm = Math.floor(now.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(now.getUTCFullYear(), qm, 1));
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO).getTime();
  const b = new Date(bISO).getTime();
  return Math.floor((b - a) / 86_400_000);
}

const STAGE_SLA = TODAY_THRESHOLDS.tender_sla.stage_sla_days;
const END_TO_END_SLA_DAYS =
  (STAGE_SLA.advertised ?? 0) + (STAGE_SLA.evaluation ?? 0) + (STAGE_SLA.awaiting_award ?? 0);

function scopedAgency(role: Role, agency: string | null): string | undefined {
  return (role) === 'superadmin' ? undefined : agency ?? undefined;
}

export async function getSlaSummary(
  role: Role,
  agency: string | null,
  now: Date = new Date(),
): Promise<SlaSummary> {
  const tenders = await listTenders({ agency: scopedAgency(role, agency), skipReferrals: true });
  const qStart = quarterStartUTC(now).toISOString();

  let tendersThisQuarter = 0;
  let closuresThisQuarter = 0;
  let onTimeClosures = 0;
  let activeBreaches = 0;

  for (const t of tenders) {
    if (t.archived_at) continue;

    if (t.date_advertised && t.date_advertised >= qStart) tendersThisQuarter++;

    if (t.date_of_award && t.date_of_award >= qStart) {
      closuresThisQuarter++;
      if (t.date_advertised) {
        const span = daysBetween(t.date_advertised, t.date_of_award);
        if (span <= END_TO_END_SLA_DAYS) onTimeClosures++;
      }
    }

    if (t.is_rollover || t.has_exception) continue;
    const slaForStage = STAGE_SLA[t.stage];
    if (slaForStage == null) continue;
    if (t.days_at_current_stage != null && t.days_at_current_stage > slaForStage) {
      activeBreaches++;
    }
  }

  const slaMetPct = closuresThisQuarter > 0
    ? Math.round((onTimeClosures / closuresThisQuarter) * 100)
    : 0;

  return {
    tendersThisQuarter,
    closuresThisQuarter,
    onTimeClosures,
    activeBreaches,
    slaMetPct,
    asOf: now.toISOString(),
  };
}
