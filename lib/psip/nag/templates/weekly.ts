// ── Weekly nag email template ────────────────────────────────────────────────
// Plain text first; minimal HTML wrapper preserves line breaks and adds a
// light monospace list. No colors, no buttons — this is a work email, not a
// marketing pitch. Tone rule: read it aloud. If it sounds curt or robotic,
// rewrite before shipping.

import { MISSING_FIELD_LABEL, STAGE_LABEL, type MissingTenderRow } from '../missing';
import { AGENCY_LABEL } from '@/lib/tender/types';
import type { TenderAgency } from '@/lib/tender/types';

function nextMonday(now: Date): string {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat; Monday is 1
  const daysAhead = day === 1 ? 7 : (1 - day + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function agencyFullName(code: string): string {
  return (AGENCY_LABEL as Record<string, string>)[code as TenderAgency] ?? code;
}

export interface ComposeInput {
  agency: string;
  focalPointName: string;
  tenders: MissingTenderRow[];
  escalation: boolean;
  dgEmail: string;
  now: Date;
}

export interface ComposeOutput {
  subject: string;
  text: string;
  html: string;
}

export function composeWeeklyNag(input: ComposeInput): ComposeOutput {
  const { agency, focalPointName, tenders, escalation, dgEmail, now } = input;
  const n = tenders.length;
  const weekOf = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const monday = nextMonday(now);

  const prefix = escalation ? 'ESCALATION — ' : '';
  const subject = `${prefix}PSIP data missing — ${n} ${n === 1 ? 'tender' : 'tenders'}, week of ${weekOf}`;

  const greeting = focalPointName
    ? `Hello ${focalPointName},`
    : `Hello ${agencyFullName(agency)} team,`;

  const intro = 'The following tenders are tracked in the PSIP but do not yet have the dates required to compute SLA status. Without these, the pipeline cannot tell whether each tender is on time or running long.';

  const items = tenders
    .map((t) => `  • ${t.description}\n      Stage: ${STAGE_LABEL[t.stage]}. Missing: ${MISSING_FIELD_LABEL[t.missing_field]}.`)
    .join('\n\n');

  const ask = `Please update the PSIP spreadsheet for these tenders before ${monday}.`;
  const help = `Contact ${dgEmail} if you need help or believe any of these are flagged in error.`;
  const signoff = '— Ministry of Public Utilities and Aviation, PSIP Tracking System';

  const text = [greeting, '', intro, '', items, '', ask, '', help, '', signoff].join('\n');

  // Minimal HTML: preserve structure, degrade cleanly if HTML is stripped.
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const htmlItems = tenders
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
