// Direct Outreach — OP Direct sync. Server-only: pulls the full case load from
// the Presidential Direct Outreach API, imports each open case's comment
// history, derives rollups (latest substantive update, first auto-detected
// commitment date, activity, counts) and upserts the local mirror idempotently.

import { query } from '@/lib/db-pg';
import { logger } from '@/lib/logger';
import { classifyTheme, extractTargetDate, isSubstantive, priorityFlag } from './compute';
import type { OpDirectCase, OpDirectHistoryEntry, OutreachSyncResult } from './types';

const DEFAULT_BASE_URL = 'https://opdirect.dakeung.com';
const FETCH_TIMEOUT_MS = 30_000;
const HISTORY_CONCURRENCY = 5;

export function isOutreachConfigured(): boolean {
  return Boolean(process.env.OPDIRECT_API_TOKEN);
}

function baseUrl(): string {
  return (process.env.OPDIRECT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

async function opdirectFetch<T>(path: string): Promise<T> {
  const token = process.env.OPDIRECT_API_TOKEN;
  if (!token) throw new Error('OPDIRECT_API_TOKEN is not configured');

  const res = await fetch(`${baseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`OP Direct ${path} responded ${res.status}`);
  }
  return (await res.json()) as T;
}

const CASES_PAGE_SIZE = 5000;
const CASES_MAX_PAGES = 20; // 100k-case backstop against a server that ignores `start`

async function fetchAllCases(): Promise<OpDirectCase[]> {
  const all: OpDirectCase[] = [];
  for (let page = 0; page < CASES_MAX_PAGES; page++) {
    const data = await opdirectFetch<{ aaData?: OpDirectCase[] }>(
      `/api/cases?draw=${page + 1}&start=${page * CASES_PAGE_SIZE}&length=${CASES_PAGE_SIZE}` +
        '&order[0][column]=0&order[0][dir]=asc&search[value]=&status_ids=1,2,3,4,5,6,7',
    );
    const rows = data.aaData ?? [];
    all.push(...rows);
    if (rows.length < CASES_PAGE_SIZE) break;
    if (page === CASES_MAX_PAGES - 1) {
      logger.warn({ fetched: all.length }, '[direct-outreach] case fetch hit page cap — list may be truncated');
    }
  }
  // Rows can shift between page fetches; the case_id-ordered pages make dupes
  // (not gaps) the failure mode, so dedupe on the primary key.
  const seen = new Set<number>();
  return all.filter((c) => {
    if (c.case_id == null || seen.has(c.case_id)) return false;
    seen.add(c.case_id);
    return true;
  });
}

async function fetchHistory(caseId: number): Promise<OpDirectHistoryEntry[]> {
  const data = await opdirectFetch<OpDirectHistoryEntry[]>(`/api/cases/${caseId}/history`);
  return Array.isArray(data) ? data : [];
}

// ── Rollups ──────────────────────────────────────────────────────────────────

interface CaseRollups {
  latest_update: string | null;
  latest_update_date: string | null;
  latest_update_by: string | null;
  comment_count: number;
  last_activity_at: string | null;
  committed_date: string | null;
  committed_source: string | null;
  committed_by: string | null;
}

function entryTime(entry: OpDirectHistoryEntry): number {
  const t = entry.created_at ? new Date(entry.created_at).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

function computeRollups(history: OpDirectHistoryEntry[]): CaseRollups {
  // The API returns newest first; sort defensively so the contract can't drift.
  const sorted = [...history].sort((a, b) => entryTime(b) - entryTime(a));
  const substantive = sorted.filter((e) => isSubstantive(e.comment));
  const latest = substantive[0] ?? null;

  // First commitment scanning newest → oldest, i.e. the most recent promise.
  let committed: { date: string; source: string; by: string | null } | null = null;
  for (const entry of substantive) {
    const hit = extractTargetDate(entry.comment);
    if (hit) {
      committed = { date: hit.date, source: entry.comment ?? '', by: entry.username };
      break;
    }
  }

  return {
    latest_update: latest?.comment ?? null,
    latest_update_date: latest?.created_at ?? null,
    latest_update_by: latest?.username ?? null,
    comment_count: substantive.length,
    last_activity_at: sorted[0]?.created_at ?? null,
    committed_date: committed?.date ?? null,
    committed_source: committed?.source ?? null,
    committed_by: committed?.by ?? null,
  };
}

// ── Upserts ──────────────────────────────────────────────────────────────────

function baseValues(c: OpDirectCase): unknown[] {
  return [
    c.case_id,
    c.client_id,
    c.client_name,
    c.client_phone,
    c.client_address,
    c.public_servant,
    c.agency_id,
    c.agency,
    c.status_id,
    c.status_name,
    c.description,
    c.priority,
    priorityFlag(c.priority),
    classifyTheme(c.description, c.category_name, c.agency),
    c.outreach_id,
    c.outreach_location,
    c.outreach_date,
    c.category_name,
    c.unclassified_category,
    c.latitude,
    c.longitude,
    c.creator,
    c.created_at,
  ];
}

/** Upsert the OP Direct case fields, preserving any existing history rollups. */
async function upsertCaseBase(c: OpDirectCase): Promise<void> {
  await query(
    `INSERT INTO direct_outreach_cases (
       case_id, client_id, client_name, client_phone, client_address, public_servant,
       agency_id, agency, status_id, status, description, priority, priority_flag, theme,
       outreach_id, outreach_location, outreach_date, category_name, unclassified_category,
       latitude, longitude, creator, created_at, synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23, now())
     ON CONFLICT (case_id) DO UPDATE SET
       client_id = EXCLUDED.client_id, client_name = EXCLUDED.client_name,
       client_phone = EXCLUDED.client_phone, client_address = EXCLUDED.client_address,
       public_servant = EXCLUDED.public_servant, agency_id = EXCLUDED.agency_id,
       agency = EXCLUDED.agency, status_id = EXCLUDED.status_id, status = EXCLUDED.status,
       description = EXCLUDED.description, priority = EXCLUDED.priority,
       priority_flag = EXCLUDED.priority_flag, theme = EXCLUDED.theme,
       outreach_id = EXCLUDED.outreach_id, outreach_location = EXCLUDED.outreach_location,
       outreach_date = EXCLUDED.outreach_date, category_name = EXCLUDED.category_name,
       unclassified_category = EXCLUDED.unclassified_category, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, creator = EXCLUDED.creator,
       created_at = EXCLUDED.created_at, synced_at = now()`,
    baseValues(c),
  );
}

/** Upsert the case fields AND the freshly computed history rollups. */
async function upsertCaseWithRollups(c: OpDirectCase, r: CaseRollups): Promise<void> {
  await query(
    `INSERT INTO direct_outreach_cases (
       case_id, client_id, client_name, client_phone, client_address, public_servant,
       agency_id, agency, status_id, status, description, priority, priority_flag, theme,
       outreach_id, outreach_location, outreach_date, category_name, unclassified_category,
       latitude, longitude, creator, created_at,
       latest_update, latest_update_date, latest_update_by, comment_count, last_activity_at,
       committed_date, committed_source, committed_by, synced_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
               $24,$25,$26,$27,$28,$29,$30,$31, now())
     ON CONFLICT (case_id) DO UPDATE SET
       client_id = EXCLUDED.client_id, client_name = EXCLUDED.client_name,
       client_phone = EXCLUDED.client_phone, client_address = EXCLUDED.client_address,
       public_servant = EXCLUDED.public_servant, agency_id = EXCLUDED.agency_id,
       agency = EXCLUDED.agency, status_id = EXCLUDED.status_id, status = EXCLUDED.status,
       description = EXCLUDED.description, priority = EXCLUDED.priority,
       priority_flag = EXCLUDED.priority_flag, theme = EXCLUDED.theme,
       outreach_id = EXCLUDED.outreach_id, outreach_location = EXCLUDED.outreach_location,
       outreach_date = EXCLUDED.outreach_date, category_name = EXCLUDED.category_name,
       unclassified_category = EXCLUDED.unclassified_category, latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude, creator = EXCLUDED.creator,
       created_at = EXCLUDED.created_at,
       latest_update = EXCLUDED.latest_update, latest_update_date = EXCLUDED.latest_update_date,
       latest_update_by = EXCLUDED.latest_update_by, comment_count = EXCLUDED.comment_count,
       last_activity_at = EXCLUDED.last_activity_at, committed_date = EXCLUDED.committed_date,
       committed_source = EXCLUDED.committed_source, committed_by = EXCLUDED.committed_by,
       synced_at = now()`,
    [
      ...baseValues(c),
      r.latest_update,
      r.latest_update_date,
      r.latest_update_by,
      r.comment_count,
      r.last_activity_at,
      r.committed_date,
      r.committed_source,
      r.committed_by,
    ],
  );
}

/** Multi-row upsert of history entries, idempotent on OP Direct case_detail_id. */
async function upsertUpdates(caseId: number, history: OpDirectHistoryEntry[]): Promise<number> {
  const entries = history.filter((e) => e.case_detail_id != null);
  if (entries.length === 0) return 0;

  const params: unknown[] = [];
  const rows = entries.map((e) => {
    params.push(e.case_detail_id, caseId, e.agency, e.creator_agency_name, e.status_name, e.comment, e.username, e.created_at);
    const n = params.length;
    return `($${n - 7},$${n - 6},$${n - 5},$${n - 4},$${n - 3},$${n - 2},$${n - 1},$${n})`;
  });

  await query(
    `INSERT INTO direct_outreach_updates (
       entry_ref, case_id, agency, creator_agency, status, comment, username, created_at
     ) VALUES ${rows.join(',')}
     ON CONFLICT (entry_ref) DO UPDATE SET
       agency = EXCLUDED.agency, creator_agency = EXCLUDED.creator_agency,
       status = EXCLUDED.status, comment = EXCLUDED.comment,
       username = EXCLUDED.username, created_at = EXCLUDED.created_at`,
    params,
  );
  return entries.length;
}

// ── Concurrency-limited map ──────────────────────────────────────────────────

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

// ── Sync entry point ─────────────────────────────────────────────────────────

/**
 * Full sync: fetch every case (all 7 statuses), import history + rollups for
 * non-Resolved cases (Resolved ones get a base upsert only — they leave the
 * open view, so stale rollups are harmless), and stamp the sync state.
 * Per-case failures are logged and skipped so one bad case can't kill the run.
 */
export async function syncOutreach(): Promise<OutreachSyncResult> {
  const started = Date.now();
  const cases = await fetchAllCases();
  let updatesSeen = 0;
  let historyFailures = 0;

  await mapLimit(cases, HISTORY_CONCURRENCY, async (c) => {
    try {
      if (c.status_name === 'Resolved') {
        await upsertCaseBase(c);
        return;
      }

      let history: OpDirectHistoryEntry[] | null = null;
      try {
        history = await fetchHistory(c.case_id);
      } catch (err) {
        historyFailures += 1;
        logger.warn({ err, caseId: c.case_id }, '[direct-outreach] history fetch failed — keeping previous rollups');
      }

      if (history === null) {
        await upsertCaseBase(c);
        return;
      }

      await upsertCaseWithRollups(c, computeRollups(history));
      // Await BEFORE the compound assignment — `x += await f()` reads x pre-await,
      // so concurrent workers would clobber each other's increments.
      const upserted = await upsertUpdates(c.case_id, history);
      updatesSeen += upserted;
    } catch (err) {
      logger.warn({ err, caseId: c.case_id }, '[direct-outreach] case sync failed — skipped');
    }
  });

  await query(
    `UPDATE direct_outreach_sync_state
        SET last_synced_at = now(), cases_seen = $1, updates_seen = $2
      WHERE id = 1`,
    [cases.length, updatesSeen],
  );

  const result: OutreachSyncResult = {
    cases_seen: cases.length,
    updates_seen: updatesSeen,
    history_failures: historyFailures,
    duration_ms: Date.now() - started,
  };
  logger.info(result, '[direct-outreach] sync complete');
  return result;
}
