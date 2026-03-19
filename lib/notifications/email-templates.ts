// ---------------------------------------------------------------------------
// Notification email template renderers (instant + digest)
// These do NOT send email — they only produce { subject, html, text }.
// The calling code imports sendEmail from lib/email.ts separately.
// ---------------------------------------------------------------------------

export interface EmailNotification {
  title: string;
  body?: string;
  event_type: string;
  importance_tier: ImportanceTier;
  actor_name?: string;
  entity_type: string;
  entity_url?: string;
  created_at: string;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Re-export shared base URL helper
import { getAppBaseUrl } from './email-utils';
import type { ImportanceTier } from './classify-tier';

function baseUrl(): string {
  return getAppBaseUrl();
}

function tierColor(tier: EmailNotification['importance_tier']): string {
  switch (tier) {
    case 'critical':
      return '#E24B4A';
    case 'important':
      return '#d4af37';
    case 'informational':
    default:
      return '#2d3a52';
  }
}

function tierLabel(tier: EmailNotification['importance_tier']): string {
  switch (tier) {
    case 'critical':
      return '\u{1F534} Critical';
    case 'important':
      return '\u{1F7E1} Important';
    case 'informational':
    default:
      return '\u2139\uFE0F Updates';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ensure a URL is safe for use in email href attributes (no javascript: etc.) */
function safeUrl(url: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
  } catch {
    // Relative path (e.g. "/tasks") — safe to use as-is
    if (url.startsWith('/')) return url;
  }
  return '';
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function subjectForEvent(n: EmailNotification): string {
  switch (n.event_type) {
    case 'comment_mention':
      return `[DG Work OS] ${n.actor_name || 'Someone'} mentioned you in ${n.title}`;
    case 'task_assigned':
      return `[DG Work OS] Task assigned: ${n.title}`;
    case 'task_blocked':
      return `[DG Work OS] BLOCKED: ${n.title}`;
    case 'comment_reply':
      return `[DG Work OS] ${n.actor_name || 'Someone'} replied to your comment`;
    case 'task_completed':
      return `[DG Work OS] Task completed: ${n.title}`;
    default:
      return `[DG Work OS] ${n.title}`;
  }
}

// ---------------------------------------------------------------------------
// Shared HTML fragments
// ---------------------------------------------------------------------------

function htmlHeader(): string {
  return `
      <div style="background: linear-gradient(135deg, #1a2744, #0f1d32); padding: 32px 28px 24px; text-align: center;">
        <h1 style="color: #d4af37; font-size: 20px; margin: 0 0 4px;">DG Work OS</h1>
        <p style="color: #64748b; font-size: 13px; margin: 0;">Ministry of Public Utilities &amp; Aviation</p>
      </div>`;
}

function htmlFooter(): string {
  return `
        <p style="color: #4a5568; font-size: 12px; line-height: 1.5; margin: 0; border-top: 1px solid #2d3a52; padding-top: 16px;">
          You received this because of your notification preferences in DG Work OS.
        </p>`;
}

function htmlShell(bodyInner: string): string {
  return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0a1628; border: 1px solid #2d3a52; border-radius: 12px; overflow: hidden;">
      ${htmlHeader()}
      <div style="padding: 28px;">
        ${bodyInner}
        ${htmlFooter()}
      </div>
    </div>`;
}

/** Single notification row used by both instant and digest templates. */
function notificationRowHtml(n: EmailNotification, options?: { showTimestamp?: boolean }): string {
  const color = tierColor(n.importance_tier);
  const titleHtml = escapeHtml(n.title);
  const bodyHtml = n.body ? escapeHtml(n.body) : '';
  const timestamp = options?.showTimestamp ? relativeTime(n.created_at) : '';

  return `
        <div style="border-left: 3px solid ${color}; padding: 12px 16px; margin: 0 0 12px; background: #111d33; border-radius: 0 8px 8px 0;">
          <p style="color: #e2e8f0; font-size: 14px; font-weight: 600; margin: 0 0 ${bodyHtml || timestamp ? '4px' : '0'};">${titleHtml}</p>${
    bodyHtml
      ? `\n          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0 0 ${timestamp ? '4px' : '0'};">${bodyHtml}</p>`
      : ''
  }${
    timestamp
      ? `\n          <p style="color: #64748b; font-size: 12px; margin: 0;">${timestamp}</p>`
      : ''
  }
        </div>`;
}

// ---------------------------------------------------------------------------
// 1. Instant (single notification) email
// ---------------------------------------------------------------------------

export function renderInstantEmail(notification: EmailNotification): RenderedEmail {
  const subject = subjectForEvent(notification);
  const url = safeUrl(notification.entity_url || '') || baseUrl();

  const actorLine = notification.actor_name
    ? `<p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">${escapeHtml(notification.actor_name)} &middot; ${escapeHtml(notification.entity_type)}</p>`
    : '';

  const bodyInner = `
        ${actorLine}
        ${notificationRowHtml(notification)}
        <div style="text-align: center; margin: 24px 0 24px;">
          <a href="${url}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            View in DG Work OS
          </a>
        </div>`;

  const html = htmlShell(bodyInner);

  // Plain-text version
  const textLines: string[] = [
    subject,
    '',
  ];
  if (notification.actor_name) {
    textLines.push(`From: ${notification.actor_name}`);
  }
  textLines.push(notification.title);
  if (notification.body) {
    textLines.push(notification.body);
  }
  textLines.push('', `View: ${url}`);

  return { subject, html, text: textLines.join('\n') };
}

// ---------------------------------------------------------------------------
// 2. Digest email
// ---------------------------------------------------------------------------

export function renderDigestEmail(
  notifications: EmailNotification[],
  recipientName: string,
): RenderedEmail {
  const count = notifications.length;
  const subject = `[DG Work OS] Your daily briefing — ${count} update${count === 1 ? '' : 's'}`;

  // Group by tier in priority order
  const groups: { tier: EmailNotification['importance_tier']; items: EmailNotification[] }[] = [
    { tier: 'critical', items: [] },
    { tier: 'important', items: [] },
    { tier: 'informational', items: [] },
  ];

  for (const n of notifications) {
    const g = groups.find((g) => g.tier === n.importance_tier);
    if (g) g.items.push(n);
    else groups[2].items.push(n); // fallback to informational
  }

  let groupsHtml = '';
  let groupsText = '';

  for (const { tier, items } of groups) {
    if (items.length === 0) continue;

    groupsHtml += `
        <h2 style="color: #e2e8f0; font-size: 14px; font-weight: 600; margin: 24px 0 12px; text-transform: uppercase; letter-spacing: 0.5px;">${tierLabel(tier)} <span style="color: #64748b; font-weight: 400;">(${items.length})</span></h2>`;

    groupsText += `\n--- ${tierLabel(tier)} (${items.length}) ---\n`;

    for (const n of items) {
      groupsHtml += notificationRowHtml(n, { showTimestamp: true });

      groupsText += `\n- ${n.title}`;
      if (n.body) groupsText += `\n  ${n.body}`;
      groupsText += `\n  ${relativeTime(n.created_at)}`;
      if (n.entity_url) groupsText += `\n  ${n.entity_url}`;
      groupsText += '\n';
    }
  }

  const appUrl = baseUrl();

  const bodyInner = `
        <p style="color: #e2e8f0; font-size: 15px; margin: 0 0 4px;">Good morning, ${escapeHtml(recipientName)}</p>
        <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 8px;">
          Here${count === 1 ? "'s" : ' are'} your ${count} update${count === 1 ? '' : 's'} since yesterday.
        </p>
        ${groupsHtml}
        <div style="text-align: center; margin: 28px 0 24px;">
          <a href="${appUrl}" style="display: inline-block; padding: 12px 32px; background: #d4af37; color: #0a1628; font-weight: 600; font-size: 14px; text-decoration: none; border-radius: 8px;">
            View all in DG Work OS
          </a>
        </div>`;

  const html = htmlShell(bodyInner);

  const textLines: string[] = [
    subject,
    '',
    `Good morning, ${recipientName}`,
    `Here${count === 1 ? "'s" : ' are'} your ${count} update${count === 1 ? '' : 's'} since yesterday.`,
    groupsText,
    `View all: ${appUrl}`,
  ];

  return { subject, html, text: textLines.join('\n') };
}
