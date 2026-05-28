// Shared render core for the Agency Intel Report. Every consumer (POST
// one-off send, GET on-screen page, GET PDF download, scheduled cron) calls
// this so their output cannot drift.
//
// The recipient name and resolved DG user id are embedded into the PDF
// buffer and HTML element here. Callers attribute their own audit rows; the
// scheduled-reports cron handler does its own DG re-resolution when a
// schedule has lost its creator.

import * as React from 'react';

import { getAgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import type { AgencyIntelData } from '@/lib/intel/get-agency-intel-data';
import { renderIntelReportPDF } from '@/lib/pdf/intel-report-render';
import { renderIntelBriefPDF } from '@/lib/pdf/intel-brief-render';
import { IntelReportView } from '@/lib/intel/intel-report-view';
import { resolveActiveDG } from '@/lib/intel/resolve-active-dg';
import { escapeHtml } from '@/lib/notifications/email-templates';

export type ReportTemplate = 'plain' | 'editorial';

export type PreparedReport = {
  data: AgencyIntelData;
  pdfBuffer: Buffer;
  htmlElement: React.ReactElement;
  subject: string;
  filename: string;
  emailHtml: string;
  emailText: string;
  agencyDisplayName: string;
  generatedAt: Date;
};

const AGENCY_DISPLAY_NAMES: Record<string, string> = {
  GPL: 'Guyana Power and Light',
  GWI: 'Guyana Water Inc.',
  CJIA: 'Cheddi Jagan International Airport',
  GCAA: 'Guyana Civil Aviation Authority',
  HECI: 'Hinterland Electrification Company Inc.',
  MARAD: 'Maritime Administration Department',
  HAS: 'Hinterland Airstrips Service',
};

function displayName(agencyUpper: string): string {
  return AGENCY_DISPLAY_NAMES[agencyUpper] ?? agencyUpper;
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function buildEmailBodies(args: {
  agencyDisplayName: string;
  agencyCode: string;
  recipientName: string;
  generatedAt: Date;
  coverMessage: string | null;
  senderName: string;
  senderEmail: string | null;
}): { emailHtml: string; emailText: string } {
  const generated = args.generatedAt.toLocaleDateString('en-GY', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const cover = (args.coverMessage ?? '').trim();

  const htmlCover = cover
    ? `<p style="color:#cbd5e1;font-size:14px;margin:16px 0;border-left:3px solid #d4af37;padding-left:12px;">${escapeHtml(cover)}</p>`
    : '';
  const replyToLine = args.senderEmail
    ? `<p style="color:#64748b;font-size:12px;margin-top:24px;">Reply-to: ${escapeHtml(args.senderEmail)}<br/>See the attached PDF for the full snapshot.</p>`
    : `<p style="color:#64748b;font-size:12px;margin-top:24px;">See the attached PDF for the full snapshot.</p>`;

  const emailHtml = `<!DOCTYPE html><html><body style="margin:0;background:#0a1628;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0a1628;border:1px solid #2d3a52;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#1a2744,#0f1d32);padding:28px;text-align:center;">
        <h1 style="color:#d4af37;margin:0 0 4px;font-size:20px;">${escapeHtml(args.agencyDisplayName)} Intel Report</h1>
        <p style="color:#64748b;margin:0;font-size:13px;">Ministry of Public Utilities and Aviation</p>
      </div>
      <div style="padding:24px;color:#e2e8f0;font-size:14px;">
        <p>Good day${args.recipientName ? `, ${escapeHtml(args.recipientName)}` : ''}.</p>
        <p>${escapeHtml(args.senderName)} has shared the ${escapeHtml(args.agencyDisplayName)} Intel Report for ${generated}.</p>
        ${htmlCover}
        ${replyToLine}
      </div>
    </div>
  </body></html>`;

  const lines = [
    `${args.agencyDisplayName} Intel Report. ${generated}.`,
    `Ministry of Public Utilities and Aviation`,
    '',
    `${args.senderName} has shared the ${args.agencyDisplayName} Intel Report.`,
  ];
  if (cover) lines.push('', cover);
  if (args.senderEmail) {
    lines.push('', `Reply-to: ${args.senderEmail}`);
  }
  lines.push('See the attached PDF for the full snapshot.');
  const emailText = lines.join('\n');

  return { emailHtml, emailText };
}

export async function prepareReport(args: {
  agency: string;
  template?: ReportTemplate;
  coverMessage?: string | null;
  senderName: string;
  senderEmail: string | null;
}): Promise<PreparedReport> {
  const template: ReportTemplate = args.template ?? 'plain';
  const agencyLower = args.agency.toLowerCase();
  const agencyUpper = args.agency.toUpperCase();
  const agencyDisplayName = displayName(agencyUpper);

  const [data, dg] = await Promise.all([
    getAgencyIntelData(agencyLower),
    resolveActiveDG(),
  ]);

  const generatedAt = new Date();

  let pdfBuffer: Buffer;
  if (template === 'editorial') {
    pdfBuffer = await renderIntelBriefPDF({
      data,
      generatedBy: args.senderName,
      recipientName: dg.name,
    });
  } else {
    pdfBuffer = await renderIntelReportPDF({
      agencyDisplayName,
      recipientName: dg.name,
      generatedAt,
      data,
    });
  }

  const htmlElement = React.createElement(IntelReportView, {
    agencyDisplayName,
    recipientName: dg.name,
    generatedAt,
    data,
  });

  const dateStamp = isoDate(generatedAt);
  const subject = `[DG Work OS] ${agencyUpper} Intel Report: ${dateStamp}`;
  const filename = `${agencyLower}-intel-${dateStamp}.pdf`;
  const { emailHtml, emailText } = buildEmailBodies({
    agencyDisplayName,
    agencyCode: agencyUpper,
    recipientName: dg.name,
    generatedAt,
    coverMessage: args.coverMessage ?? null,
    senderName: args.senderName,
    senderEmail: args.senderEmail,
  });

  return {
    data,
    pdfBuffer,
    htmlElement,
    subject,
    filename,
    emailHtml,
    emailText,
    agencyDisplayName,
    generatedAt,
  };
}
