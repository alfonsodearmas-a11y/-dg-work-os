// OP Direct outbox bridge — posts pending DG-OS Direct Outreach outbox rows to
// OP Direct as case comments (plus a status change when op_status_target is
// set; OP's Update form requires a comment, so status+comment save together).
//
// Session-bound by design: a PERSISTENT Chromium profile you log in to manually
// ONCE (~/.opdirect-bridge-profile). No credentials are ever stored, typed, or
// automated by this script. See scripts/opdirect-outbox-bridge.README.md.
//
// Usage:
//   npm run bridge:opdirect                 (= npx tsx scripts/opdirect-outbox-bridge.ts)
//   npx tsx scripts/opdirect-outbox-bridge.ts --dry-run
//   npx tsx scripts/opdirect-outbox-bridge.ts --limit 5
//
// Env (.env.local or shell; shell wins): DG_OS_BASE_URL, BRIDGE_TOKEN,
// OPDIRECT_BASE_URL (default https://opdirect.dakeung.com),
// BRIDGE_PROFILE_DIR (default ~/.opdirect-bridge-profile).
//
// Rules: idempotent + resumable (the [DGOS-…] history marker is checked before
// every post); comments always carry officer attribution; only 'Resolved' is
// ever set as an OP status; Category is NEVER touched; missing selectors fail
// LOUDLY (the row is marked failed — nothing is silently skipped).

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import {
  buildOpComment,
  currentOpStatus,
  findMarkerEntry,
  formatSummary,
  planForRow,
  type BridgeResultRow,
  type OpHistoryEntry,
  type OutboxExportRow,
} from './opdirect-bridge-core';

// Load .env.local BEFORE reading config (existing env wins — repo idiom, see
// scripts/backfill-direct-outreach-region.ts).
if (existsSync('.env.local')) {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v.trim();
  }
}

const DG_OS_BASE_URL = (process.env.DG_OS_BASE_URL || '').replace(/\/+$/, '');
const OPDIRECT_BASE_URL = (process.env.OPDIRECT_BASE_URL || 'https://opdirect.dakeung.com').replace(/\/+$/, '');
const BRIDGE_TOKEN = (process.env.BRIDGE_TOKEN || '').trim();
const PROFILE_DIR = process.env.BRIDGE_PROFILE_DIR || join(homedir(), '.opdirect-bridge-profile');

const ROW_DELAY_MS = 1500;
const VERIFY_ATTEMPTS = 8;
const VERIFY_DELAY_MS = 1500;

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? Number(args[limitIdx + 1]) : null;
if (limitIdx !== -1 && (!Number.isInteger(LIMIT) || (LIMIT as number) <= 0)) {
  console.error('--limit requires a positive integer');
  process.exit(2);
}

// ── DG OS queue API (BRIDGE_TOKEN header) ────────────────────────────────────

async function dgFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${DG_OS_BASE_URL}${path}`, {
    ...init,
    headers: {
      'x-bridge-token': BRIDGE_TOKEN,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DG OS ${init?.method || 'GET'} ${path} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchPending(): Promise<OutboxExportRow[]> {
  const data = (await dgFetch('/api/direct-outreach/outbox/export')) as { pending?: OutboxExportRow[] };
  return data.pending ?? [];
}

async function ackRow(id: string, opdirectCommentId: string | null): Promise<void> {
  await dgFetch('/api/direct-outreach/outbox/ack', {
    method: 'POST',
    body: JSON.stringify([{ id, opdirect_comment_id: opdirectCommentId }]),
  });
}

async function failRow(id: string, lastError: string): Promise<void> {
  await dgFetch(`/api/direct-outreach/outbox/${id}/fail`, {
    method: 'POST',
    body: JSON.stringify({ last_error: lastError.slice(0, 2000) }),
  });
}

// ── OP Direct (authenticated browser session) ────────────────────────────────

async function fetchHistory(context: BrowserContext, caseId: number): Promise<OpHistoryEntry[]> {
  const res = await context.request.get(`${OPDIRECT_BASE_URL}/api/cases/${caseId}/history`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok()) throw new Error(`OP Direct history fetch for case ${caseId} failed: HTTP ${res.status()}`);
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as OpHistoryEntry[]) : [];
}

/** Search box → row → slide-over Update form. Throws (loudly) on any missing piece. */
async function openCase(page: Page, caseId: number): Promise<void> {
  const search = page.locator('input[type="search"][aria-controls="tblCases"]');
  if ((await search.count()) === 0) {
    throw new Error('OP Direct search box not found (input[type=search][aria-controls=tblCases]) — the /ministry UI may have changed');
  }
  await search.fill('');
  await search.fill(String(caseId));

  const row = page
    .locator('#tblCases tbody tr')
    .filter({ has: page.locator('td:first-child', { hasText: new RegExp(`^\\s*${caseId}\\s*$`) }) })
    .first();
  try {
    await row.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    throw new Error(`case ${caseId} not found in OP Direct search results`);
  }
  await row.click();

  try {
    await page.locator('#updateComment').waitFor({ state: 'visible', timeout: 15_000 });
  } catch {
    throw new Error(`Update form (#updateComment) did not open for case ${caseId}`);
  }
  // Belt-and-braces: the slide-over must be for THIS case.
  try {
    await page.getByText(`Case #${caseId}`).first().waitFor({ timeout: 10_000 });
  } catch {
    throw new Error(`opened panel does not show "Case #${caseId}" — refusing to post into the wrong case`);
  }
}

async function closeCasePanel(page: Page): Promise<void> {
  const close = page.locator('.btn-close');
  if ((await close.count()) > 0 && (await close.first().isVisible())) {
    await close.first().click();
  }
}

/** Post comment (+status) via the Update form, verify via the history marker. */
async function postRow(
  page: Page,
  context: BrowserContext,
  row: OutboxExportRow,
  comment: string,
): Promise<string | null> {
  await openCase(page, row.case_id);

  if (row.op_status_target) {
    const dropdown = page.locator('#updateStatus');
    if ((await dropdown.count()) === 0) {
      throw new Error('Status dropdown (#updateStatus) not found — the Update form may have changed');
    }
    // selectOption throws if the label is absent — exactly the loud failure we want.
    await dropdown.selectOption({ label: row.op_status_target });
  }
  // Category (#updateCategory) is deliberately never touched.

  const commentBox = page.locator('#updateComment');
  await commentBox.fill(comment);

  const saveBtn = page.getByRole('button', { name: 'Save', exact: true });
  if ((await saveBtn.count()) === 0) {
    throw new Error('Save button not found in the Update form');
  }
  await saveBtn.click();

  // Verify by re-fetching history until the marker (and status, when set) shows.
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
    await page.waitForTimeout(VERIFY_DELAY_MS);
    const history = await fetchHistory(context, row.case_id);
    const entry = findMarkerEntry(history, row.dgos_ref);
    if (entry && (!row.op_status_target || currentOpStatus(history) === row.op_status_target)) {
      await closeCasePanel(page);
      return entry.case_detail_id != null ? String(entry.case_detail_id) : null;
    }
  }
  throw new Error(
    `Save clicked but "[${row.dgos_ref}]" never appeared in case ${row.case_id} history` +
      (row.op_status_target ? ` with status ${row.op_status_target}` : '') +
      ' — verify manually before retrying',
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!DG_OS_BASE_URL) throw new Error('DG_OS_BASE_URL is required (e.g. https://dashboard.mpua.gov.gy)');
  if (!BRIDGE_TOKEN) throw new Error('BRIDGE_TOKEN is required (same value as the Vercel prod env var)');

  const pending = await fetchPending();
  if (pending.length === 0) {
    // Contract: with an empty queue the bridge never opens OP Direct at all.
    console.log('0 pending');
    return;
  }

  const rows = LIMIT ? pending.slice(0, LIMIT) : pending;
  console.log(
    `${pending.length} pending${LIMIT ? `, processing ${rows.length} (--limit ${LIMIT})` : ''}` +
      (DRY_RUN ? ' [dry-run: no Save, no ack]' : ''),
  );

  const { chromium } = await import('@playwright/test');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
  });

  const results: BridgeResultRow[] = [];
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(`${OPDIRECT_BASE_URL}/ministry`, { waitUntil: 'domcontentloaded' });

    if (page.url().includes('/auth/login')) {
      console.log('OP Direct login required — log in manually in the opened window (waiting up to 5 minutes)…');
      await page.waitForURL('**/ministry**', { timeout: 300_000 });
    }
    try {
      await page.locator('#tblCases').waitFor({ timeout: 30_000 });
    } catch {
      throw new Error('OP Direct /ministry did not render the cases table (#tblCases) — cannot continue');
    }

    for (const row of rows) {
      try {
        const history = await fetchHistory(context, row.case_id);
        const plan = planForRow(row, history);

        if (plan.action === 'ack') {
          if (DRY_RUN) {
            console.log(`[dry-run] case ${row.case_id} [${row.dgos_ref}]: already in OP history — would ack`);
            results.push({ caseId: row.case_id, dgosRef: row.dgos_ref, outcome: 'dry-run' });
          } else {
            await ackRow(row.id, plan.opdirectCommentId);
            console.log(`case ${row.case_id} [${row.dgos_ref}]: already in OP history — acked`);
            results.push({ caseId: row.case_id, dgosRef: row.dgos_ref, outcome: 'already-posted' });
          }
        } else {
          const comment = buildOpComment(row);
          if (DRY_RUN) {
            console.log(
              `[dry-run] case ${row.case_id}: would post comment: ${comment}` +
                (row.op_status_target ? ` — and set Status -> ${row.op_status_target}` : ''),
            );
            results.push({ caseId: row.case_id, dgosRef: row.dgos_ref, outcome: 'dry-run' });
          } else {
            const commentId = await postRow(page, context, row, comment);
            await ackRow(row.id, commentId);
            console.log(
              `case ${row.case_id} [${row.dgos_ref}]: posted` +
                (row.op_status_target ? ` + status ${row.op_status_target}` : '') +
                (commentId ? ` (comment ${commentId})` : ''),
            );
            results.push({ caseId: row.case_id, dgosRef: row.dgos_ref, outcome: 'posted' });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`case ${row.case_id} [${row.dgos_ref}]: FAILED — ${message}`);
        results.push({ caseId: row.case_id, dgosRef: row.dgos_ref, outcome: 'failed', error: message });
        if (!DRY_RUN) {
          await failRow(row.id, message).catch((reportErr) =>
            console.error(`  (could not record failure in DG OS: ${String(reportErr)})`),
          );
        }
        await closeCasePanel(page).catch(() => {});
      }
      await page.waitForTimeout(ROW_DELAY_MS);
    }
  } finally {
    await context.close();
  }

  console.log('\n— summary —');
  console.log(formatSummary(results));
  if (results.some((r) => r.outcome === 'failed')) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Bridge run failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
