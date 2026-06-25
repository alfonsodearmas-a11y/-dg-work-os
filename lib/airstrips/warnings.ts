// Hinterland Airstrips — maintenance warning engine.
//
// Pure and client-safe: takes plain inputs, returns plain serializable objects.
// Used by the list route, the detail route, and the PDF report; the same shape is
// what a future scheduled job / push digest would read and send (nothing sends here).
//
// Overdue is derived from last maintenance + cadence interval, computed with the
// TZ-safe Guyana date helpers — replacing the old ad-hoc 6-month inspection check.

import { addDays, daysBetween, guyanaToday } from '@/lib/airstrip-types';

export type AirstripWarningType = 'overdue' | 'upcoming' | 'verification_stale';
export type AirstripWarningSeverity = 'critical' | 'warning' | 'info';
export type AttentionLevel = 'overdue' | 'upcoming' | 'stale' | 'ok';

export interface AirstripWarning {
  type: AirstripWarningType;
  severity: AirstripWarningSeverity;
  /** YYYY-MM-DD (Guyana) the strip is/was next due, or null when no cadence can be established. */
  nextDueOn: string | null;
  daysOverdue?: number;   // present on 'overdue'
  daysUntilDue?: number;  // present on 'upcoming'
  /** Core, surface-agnostic sentence (e.g. "Kato is 22 days overdue"). UIs append the names. */
  message: string;
  contractorName: string | null;
  managerName: string | null;
  /** True when no responsible contractor OR manager is assigned — "a warning without a name is incomplete". */
  responsibilityIncomplete: boolean;
}

export interface AirstripWarningInput {
  name: string;
  lastMaintenanceOn: string | null;   // YYYY-MM-DD
  lastVerifiedOn: string | null;       // YYYY-MM-DD
  intervalDays: number;                // resolved: target ?? global default
  upcomingWindowDays: number;
  verificationStaleAfterDays: number;
  contractorName: string | null;
  managerName: string | null;
  today?: string;                      // defaults to guyanaToday()
}

export interface AirstripResponsibility {
  contractorId: string | null;
  contractorName: string | null;
  managerId: string | null;
  managerName: string | null;
}

export interface AirstripCadence {
  nextDueOn: string | null;
  /** >0 overdue, <=0 not yet due, null when no maintenance on record. */
  daysOverdue: number | null;
  warnings: AirstripWarning[];
  /** Highest-priority bucket, for "Needs Attention" sorting/filtering. */
  attentionLevel: AttentionLevel;
}

/** Resolve the effective interval for a strip: per-strip override, else global default. */
export function resolveIntervalDays(
  targetIntervalDays: number | null | undefined,
  defaultIntervalDays: number,
): number {
  return targetIntervalDays && targetIntervalDays > 0 ? targetIntervalDays : defaultIntervalDays;
}

export function computeAirstripWarnings(input: AirstripWarningInput): AirstripCadence {
  const today = input.today ?? guyanaToday();
  const contractorName = input.contractorName ?? null;
  const managerName = input.managerName ?? null;
  const responsibilityIncomplete = !contractorName || !managerName;
  const base = { contractorName, managerName, responsibilityIncomplete };

  const warnings: AirstripWarning[] = [];
  let nextDueOn: string | null = null;
  let daysOverdue: number | null = null;

  if (!input.lastMaintenanceOn) {
    // No maintenance on record → cadence can't be established; treat as overdue.
    warnings.push({
      type: 'overdue', severity: 'critical', nextDueOn: null,
      message: `${input.name} has no maintenance on record`, ...base,
    });
  } else {
    nextDueOn = addDays(input.lastMaintenanceOn, input.intervalDays);
    const daysUntilDue = daysBetween(today, nextDueOn); // >0 = ahead, <0 = past due
    if (daysUntilDue < 0) {
      daysOverdue = -daysUntilDue;
      warnings.push({
        type: 'overdue', severity: 'critical', nextDueOn, daysOverdue,
        message: `${input.name} is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`, ...base,
      });
    } else {
      daysOverdue = -daysUntilDue; // <= 0
      if (daysUntilDue <= input.upcomingWindowDays) {
        warnings.push({
          type: 'upcoming', severity: 'warning', nextDueOn, daysUntilDue,
          message: daysUntilDue === 0
            ? `${input.name} maintenance is due today`
            : `${input.name} maintenance due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`,
          ...base,
        });
      }
    }
  }

  // Verification staleness is independent of the maintenance cadence.
  const staleByMissing = !input.lastVerifiedOn;
  const staleByAge =
    !!input.lastVerifiedOn && daysBetween(input.lastVerifiedOn, today) > input.verificationStaleAfterDays;
  if (staleByMissing || staleByAge) {
    warnings.push({
      type: 'verification_stale', severity: 'info', nextDueOn,
      message: staleByMissing
        ? `${input.name} has no verified maintenance`
        : `${input.name} verification is stale (over ${input.verificationStaleAfterDays} days)`,
      ...base,
    });
  }

  const attentionLevel: AttentionLevel =
    warnings.some(w => w.type === 'overdue') ? 'overdue'
    : warnings.some(w => w.type === 'upcoming') ? 'upcoming'
    : warnings.some(w => w.type === 'verification_stale') ? 'stale'
    : 'ok';

  return { nextDueOn, daysOverdue, warnings, attentionLevel };
}
