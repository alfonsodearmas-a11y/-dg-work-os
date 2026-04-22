// ── Event-triggered nag email (new critical gap after a PSIP upload) ────────

import { MISSING_FIELD_LABEL, STAGE_LABEL, type MissingTenderRow } from '../missing';
import { AGENCY_LABEL } from '@/lib/tender/types';
import type { TenderAgency } from '@/lib/tender/types';

function agencyFullName(code: string): string {
  return (AGENCY_LABEL as Record<string, string>)[code as TenderAgency] ?? code;
}

export interface EventComposeInput {
  agency: string;
  focalPointName: string;
  newGaps: MissingTenderRow[];
  totalMissingAfterUpload: number;
  dgEmail: string;
}

export interface EventComposeOutput {
  subject: string;
  text: string;
  html: string;
}

export function composeEventNag(input: EventComposeInput): EventComposeOutput {
  const { agency, focalPointName, newGaps, totalMissingAfterUpload, dgEmail } = input;
  const n = newGaps.length;

  const subject = `NEW critical missing-date gap — ${agency}`;

  const greeting = focalPointName
    ? `Hello ${focalPointName},`
    : `Hello ${agencyFullName(agency)} team,`;

  const intro = `Today's PSIP upload added ${n} new ${n === 1 ? 'tender' : 'tenders'} at an SLA-eligible stage without the required date column filled in. ${agency} now has ${totalMissingAfterUpload} ${totalMissingAfterUpload === 1 ? 'tender' : 'tenders'} total in this state.`;

  const items = newGaps
    .map((t) => `  • ${t.description}\n      Stage: ${STAGE_LABEL[t.stage]}. Missing: ${MISSING_FIELD_LABEL[t.missing_field]}.`)
    .join('\n\n');

  const ask = 'Please update these rows in the PSIP spreadsheet at your earliest convenience.';
  const help = `Contact ${dgEmail} if you have questions or believe any of these are flagged in error.`;
  const signoff = '— Ministry of Public Utilities and Aviation, PSIP Tracking System';

  const text = [greeting, '', intro, '', items, '', ask, '', help, '', signoff].join('\n');

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlItems = newGaps
    .map((t) =>
      `<li style="margin-bottom:10px;"><div style="font-weight:600;">${escape(t.description)}</div>`
      + `<div style="font-size:13px;color:#555;">Stage: ${escape(STAGE_LABEL[t.stage])}. Missing: ${escape(MISSING_FIELD_LABEL[t.missing_field])}.</div></li>`,
    )
    .join('');

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222;">
<p>${escape(greeting)}</p>
<p>${escape(intro)}</p>
<ul style="padding-left:20px;">${htmlItems}</ul>
<p>${escape(ask)}</p>
<p style="color:#555;font-size:13px;">${escape(help)}</p>
<p style="color:#888;font-size:12px;">${escape(signoff)}</p>
</div>`;

  return { subject, text, html };
}
