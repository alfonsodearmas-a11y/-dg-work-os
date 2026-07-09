// ── Nag send orchestrator ────────────────────────────────────────────────────
//
// One function per trigger type. Each:
//   1. Composes the email body from templates + missing-tender rows.
//   2. Writes a psip_nag_preview row (always — dry-run or real).
//   3. If emails_enabled, attempts SMTP via lib/email and records
//      sent_at / sent_error on the same preview row.
//   4. Upserts psip_nag_record entries for the weekly trigger only
//      (event triggers are orthogonal and do not bump weekly streaks).

import { supabaseAdmin } from '@/lib/db-admin';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { composeWeeklyNag } from './templates/weekly';
import { composeEventNag } from './templates/event';
import type { MissingTenderRow } from './missing';

export interface NagSettings {
  emails_enabled: boolean;
  bcc_to_dg: boolean;
  dg_email: string;
}

export interface FocalPoint {
  agency: string;
  focal_point_name: string;
  focal_point_email: string;
  agency_head_name: string | null;
  agency_head_email: string | null;
}

export async function loadSettings(): Promise<NagSettings> {
  const { data } = await supabaseAdmin
    .from('psip_nag_settings')
    .select('emails_enabled, bcc_to_dg')
    .eq('id', 1)
    .single();
  return {
    emails_enabled: Boolean(data?.emails_enabled),
    bcc_to_dg: Boolean(data?.bcc_to_dg),
    dg_email: process.env.DG_EMAIL ?? 'alfonso.dearmas@mpua.gov.gy',
  };
}

export async function loadFocalPoints(): Promise<Map<string, FocalPoint>> {
  const { data } = await supabaseAdmin
    .from('agency_psip_focal_point')
    .select('agency, focal_point_name, focal_point_email, agency_head_name, agency_head_email');
  const map = new Map<string, FocalPoint>();
  for (const r of data || []) map.set(r.agency as string, r as FocalPoint);
  return map;
}

// ── Weekly ───────────────────────────────────────────────────────────────────

export interface WeeklyOutcome {
  agency: string;
  skipped?: 'no_focal_point_email' | 'no_missing_tenders';
  preview_id?: string;
  attempted_send?: boolean;
  sent_success?: boolean;
  sent_error?: string;
  escalated?: boolean;
  tender_count?: number;
}

export async function runWeeklyForAgency(args: {
  agency: string;
  tenders: MissingTenderRow[];
  focal: FocalPoint | undefined;
  settings: NagSettings;
  now: Date;
}): Promise<WeeklyOutcome> {
  const { agency, tenders, focal, settings, now } = args;

  if (tenders.length === 0) return { agency, skipped: 'no_missing_tenders' };
  if (!focal || !focal.focal_point_email) return { agency, skipped: 'no_focal_point_email' };

  // Upsert nag records and bump consecutive_weekly_count per tender.
  // A tender hits escalation threshold when its count, AFTER this bump, is >= 3.
  let escalation = false;
  for (const t of tenders) {
    const { data: existing } = await supabaseAdmin
      .from('psip_nag_record')
      .select('id, consecutive_weekly_count, resolved_at')
      .eq('agency', agency)
      .eq('tender_id', t.id)
      .maybeSingle();

    // If previously resolved, start a fresh streak at 1.
    const nextCount = existing?.resolved_at
      ? 1
      : (existing?.consecutive_weekly_count ?? 0) + 1;
    const triggerKind = nextCount >= 3 ? 'escalation' : 'weekly';
    if (nextCount >= 3) escalation = true;

    if (existing) {
      await supabaseAdmin
        .from('psip_nag_record')
        .update({
          consecutive_weekly_count: nextCount,
          last_nagged_at: now.toISOString(),
          trigger_kind: triggerKind,
          resolved_at: null,
        })
        .eq('id', existing.id as string);
    } else {
      await supabaseAdmin.from('psip_nag_record').insert({
        agency,
        tender_id: t.id,
        trigger_kind: triggerKind,
        consecutive_weekly_count: nextCount,
        first_nagged_at: now.toISOString(),
        last_nagged_at: now.toISOString(),
      });
    }
  }

  const { subject, text, html } = composeWeeklyNag({
    agency,
    focalPointName: focal.focal_point_name,
    tenders,
    escalation,
    dgEmail: settings.dg_email,
    now,
  });

  // Escalation: add agency head to TO (not CC) when ANY tender is at 3+ weekly.
  // Documented decision: we add the head ONCE (when the agency first escalates
  // this week) via the TO header; we do not re-alert in weeks 4, 5, 6 by
  // separate channels — the head stays on TO as long as any tender in the
  // current digest is at 3+ weekly, which is the same threshold they already
  // know about. Compose step handles this uniformly.
  const toList = [focal.focal_point_email];
  if (escalation && focal.agency_head_email) toList.push(focal.agency_head_email);
  const to = toList.join(',');
  const bcc = settings.bcc_to_dg && settings.dg_email ? settings.dg_email : null;

  const { data: previewRow, error: previewErr } = await supabaseAdmin
    .from('psip_nag_preview')
    .insert({
      trigger_kind: escalation ? 'escalation' : 'weekly',
      agency,
      recipient_to: to,
      recipient_bcc: bcc,
      subject,
      body: text,
      would_have_sent_at: now.toISOString(),
      actually_sent: false,
    })
    .select('id')
    .single();
  if (previewErr || !previewRow) {
    logger.error({ err: previewErr, agency }, 'runWeeklyForAgency: preview insert failed');
    return { agency, escalated: escalation, tender_count: tenders.length };
  }

  const result: WeeklyOutcome = {
    agency,
    preview_id: previewRow.id as string,
    escalated: escalation,
    tender_count: tenders.length,
  };

  if (!settings.emails_enabled) return result;

  // Real send path.
  const toArr = [...toList, ...(bcc ? [bcc] : [])];
  const send = await sendEmail({ to: toArr, subject, html, text });
  await supabaseAdmin
    .from('psip_nag_preview')
    .update({
      actually_sent: true,
      sent_at: new Date().toISOString(),
      sent_error: send.success ? null : send.error ?? 'unknown error',
    })
    .eq('id', previewRow.id as string);

  return { ...result, attempted_send: true, sent_success: send.success, sent_error: send.error };
}

// ── Event trigger ────────────────────────────────────────────────────────────

export interface EventOutcome {
  agency: string;
  skipped?: 'no_focal_point_email' | 'not_critical' | 'no_new_gaps';
  preview_id?: string;
  attempted_send?: boolean;
  sent_success?: boolean;
  sent_error?: string;
}

export async function runEventForAgency(args: {
  agency: string;
  newGaps: MissingTenderRow[];
  totalMissingAfterUpload: number;
  criticalThreshold: number;
  focal: FocalPoint | undefined;
  settings: NagSettings;
  now: Date;
}): Promise<EventOutcome> {
  const { agency, newGaps, totalMissingAfterUpload, criticalThreshold, focal, settings, now } = args;

  if (newGaps.length === 0) return { agency, skipped: 'no_new_gaps' };
  if (totalMissingAfterUpload < criticalThreshold) return { agency, skipped: 'not_critical' };
  if (!focal || !focal.focal_point_email) return { agency, skipped: 'no_focal_point_email' };

  const { subject, text, html } = composeEventNag({
    agency,
    focalPointName: focal.focal_point_name,
    newGaps,
    totalMissingAfterUpload,
    dgEmail: settings.dg_email,
  });

  const to = focal.focal_point_email;
  const bcc = settings.bcc_to_dg && settings.dg_email ? settings.dg_email : null;

  const { data: previewRow, error: previewErr } = await supabaseAdmin
    .from('psip_nag_preview')
    .insert({
      trigger_kind: 'event_new_critical',
      agency,
      recipient_to: to,
      recipient_bcc: bcc,
      subject,
      body: text,
      would_have_sent_at: now.toISOString(),
      actually_sent: false,
    })
    .select('id')
    .single();
  if (previewErr || !previewRow) {
    logger.error({ err: previewErr, agency }, 'runEventForAgency: preview insert failed');
    return { agency };
  }

  const result: EventOutcome = { agency, preview_id: previewRow.id as string };

  if (!settings.emails_enabled) return result;

  const toArr = [to, ...(bcc ? [bcc] : [])];
  const send = await sendEmail({ to: toArr, subject, html, text });
  await supabaseAdmin
    .from('psip_nag_preview')
    .update({
      actually_sent: true,
      sent_at: new Date().toISOString(),
      sent_error: send.success ? null : send.error ?? 'unknown error',
    })
    .eq('id', previewRow.id as string);

  return { ...result, attempted_send: true, sent_success: send.success, sent_error: send.error };
}

// ── Resolution (called from applyPsipUpload / post-upload) ──────────────────

export async function markResolvedForAgency(agency: string, stillMissingTenderIds: Set<string>): Promise<number> {
  const { data: records } = await supabaseAdmin
    .from('psip_nag_record')
    .select('id, tender_id, resolved_at')
    .eq('agency', agency)
    .is('resolved_at', null);
  const nowIso = new Date().toISOString();
  const toResolve = (records ?? []).filter((r) => !stillMissingTenderIds.has(r.tender_id as string)).map((r) => r.id as string);
  if (toResolve.length === 0) return 0;
  await supabaseAdmin
    .from('psip_nag_record')
    .update({ resolved_at: nowIso })
    .in('id', toResolve);
  return toResolve.length;
}
