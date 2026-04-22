// ── Today signal thresholds ──────────────────────────────────────────────────
//
// Every tunable number that controls what surfaces on the Today home page
// lives here. Everything else in lib/today/ and lib/tender/ imports from this
// file rather than hardcoding.
//
// Edit this file to tune Today's signal sensitivity. No DB migration needed.
// Changes apply on next deploy. Admin UI is a future possibility (see
// TODAY_V2_TODO.md — "Admin UI for Today thresholds").
//
// ── What each knob does ──────────────────────────────────────────────────────
//
// delayed_project — HIGH-risk delayed projects split by how long they've been
// past their end date. Only HIGH-risk or stalled projects reach this band
// (filter happens upstream in fetchDelayedProjectSignals). Tighten to elevate
// more projects to critical. Loosen to demote. Consumer:
// lib/today/severity.ts::severityForDelayedProject.
//
// tender_sla.stage_sla_days — days a tender can sit in each stage before it
// counts as over-SLA. `null` = that stage has no SLA (design before
// advertising; award is terminal). Consumer: lib/today/severity.ts::daysOverSla.
//
// tender_sla.{critical,high}_days_over_sla — severity split after over-SLA is
// computed. Tightening shifts the high-water mark. Loosening delays warnings.
// Consumer: lib/today/severity.ts::severityForTenderSla.
//
// stagnant_tender — weeks a tender goes unchanged across successive PSIP
// uploads. min_weeks gates whether a signal fires at all (both the
// individual card and the agency rollup query start here). high / critical
// split severity. Loosen min_weeks to flag stagnation faster; tighten to
// wait longer before raising the alarm. Consumers:
// lib/today/signals.ts::fetchStagnantTenderSignals (min gate) and
// lib/today/severity.ts::severityForStagnantTender (bands).
//
// agency_stagnant_rollup — when one agency has enough stagnant tenders, we
// collapse the individual cards into a single rollup per agency. min_count
// is the trigger and the suppression threshold together — below this, cards
// show individually. high / critical set rollup severity. Lower min_count to
// roll up sooner; raise it to keep more detail visible. Consumers:
// lib/today/signals.ts::fetchStagnantTenderSignals and
// lib/today/severity.ts::severityForAgencyStagnantRollup.
//
// meeting_action — days past due (positive) or days until due (negative)
// relative to today. critical_days_past_due is the upper threshold (14+ days
// past). high_days_past_due is the minimum "past-due at all" threshold (1+).
// medium_due_within_days: upcoming items this many days out also surface at
// medium. medium_no_due_age_days: no-due-date items this old surface at
// medium (older than this, never newer). Consumer:
// lib/today/severity.ts::severityForMeetingAction.
//
// incomplete_psip — one rollup signal per agency with tenders whose stage is
// SLA-eligible (advertised / evaluation / awaiting_award) but the required
// PSIP date column is blank, so days-in-stage cannot be computed and the
// tender is silently skipped by the SLA fetcher. min_count gates whether the
// rollup appears at all. high / critical set the internal severity used only
// for sort order (kind pill is MISSING, severity is not displayed).
// Consumers: lib/today/signals.ts::fetchIncompletePsipDataSignals and
// lib/today/severity.ts::severityForIncompletePsip.
//
// Note: all thresholds are inclusive-of-the-value (>= rather than >).

import type { TenderStage } from '@/lib/tender/types';

export const TODAY_THRESHOLDS = {
  delayed_project: {
    critical_days_overdue: 90,
    high_days_overdue: 30,
    // medium = any HIGH-risk project below 30d overdue, or stalled-only
  },
  tender_sla: {
    stage_sla_days: {
      design: null,           // no SLA before advertising
      advertised: 30,
      evaluation: 30,
      awaiting_award: 21,
      award: null,            // terminal stage
    } as Record<TenderStage, number | null>,
    critical_days_over_sla: 30,
    high_days_over_sla: 14,
    // medium = 1–13 days over SLA
  },
  stagnant_tender: {
    min_weeks: 3,
    high_weeks: 5,
    critical_weeks: 8,
    // medium = 3–4 weeks unchanged
  },
  agency_stagnant_rollup: {
    min_count: 3,
    high_count: 5,
    critical_count: 10,
    // medium = 3–4 stagnant tenders in one agency
  },
  meeting_action: {
    critical_days_past_due: 14,
    high_days_past_due: 1,
    medium_due_within_days: 7,
    medium_no_due_age_days: 30,
  },
  incomplete_psip: {
    min_count: 1,
    high_count: 5,
    critical_count: 10,
    // medium = 1–4 missing-date tenders in one agency
  },
} as const;
