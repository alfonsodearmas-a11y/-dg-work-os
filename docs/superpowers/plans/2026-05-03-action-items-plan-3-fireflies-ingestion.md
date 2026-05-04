# Action Items — Plan 3 (rev 2026-05-04): Fireflies Ingestion + meetings_seen + Daily Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Operational note (2026-05-04 deploy):** The `*/10 * * * *` poll cron lives in `.github/workflows/action-items-poll.yml`, not in `vercel.json`. Vercel Hobby plans cap cron frequency at once-per-day, so the poll schedule was moved to GitHub Actions (free, sub-daily allowed). The workflow does one thing: `curl POST` to `/api/action-items/poll-fireflies` with the bearer secret. If this project is ever upgraded to Vercel Pro, move the entry back into `vercel.json` (`{"path": "/api/action-items/poll-fireflies", "schedule": "*/10 * * * *"}`) and delete the workflow file. Both the route's CRON_SECRET check and the `polling_state` mutex are scheduler-agnostic. The daily digest cron (`5 11 * * *`) stayed in `vercel.json` — daily fits Hobby fine.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (rev 2026-05-03b — read the changelog first).
**Predecessors:**
- Plan 1 (shipped) — migration 102, constants, types, `canSeeTask`, review-queue shells.
- Plan 2 (in flight) — migration 102 amendment widening `tasks.source_meeting_id` to TEXT, lifecycle endpoints, validation module, verification surface.

**Goal:** Stand up the polling half of the pipeline. Every 10 minutes a Vercel Cron polls Fireflies and writes one row per observed meeting to `meetings_seen` with `pipeline_action='queued'` and **no auto-detection** — `detected_type` and `detected_modality` are written as `NULL`. The user classifies manually via inline override dropdowns on `/action-items/meetings`. At 7am Guyana time a separate cron pushes a daily digest summarizing yesterday's pipeline activity. Each row exposes a "Process manually" button that deep-links to the existing Add Task modal in War Room with meeting metadata pre-populated. Zero AI extraction is wired here — Plan 4 picks up `pipeline_action='queued'` rows that the user has classified as `internal+virtual`.

**Architecture:** A small Fireflies GraphQL client (`listRecentTranscripts`, `getTranscript`) with retry-with-backoff. The poll function takes a single-row mutex on a new `polling_state` table (no advisory locks, no RPC exposure), reads the watermark from `max(transcript_ready_at) FROM meetings_seen`, fetches transcripts since the watermark, upserts rows with all detection fields `NULL`, and stamps `pipeline_action='queued'`. The cron route handler is a thin wrapper that auth-guards via `CRON_SECRET` (matches the existing `app/api/notifications/generate/route.ts:11–22` pattern) and delegates. The digest is a separate cron with the same auth pattern. The meetings list page is a server component using DG/PS role gating; the inline override UI mutates `detected_type` and `detected_modality` only — agency lives per-task via `owner.agency`, not per-meeting.

**Tech Stack:** Next.js 16 App Router, Vercel Cron, Supabase JS (`supabaseAdmin`), Fireflies GraphQL via `fetch`, Zod, Vitest, existing notifications stack.

---

## Conventions for this plan

- **Tests live in** `lib/__tests__/`. The Fireflies client gets a smoke test against a `vi.mock`'d `fetch`. The poll function is exercised end-to-end in the verification task, not unit-tested.
- **Cron auth pattern**: every cron route accepts `GET` and authenticates via `Authorization: Bearer ${CRON_SECRET}` OR a fallback session — matches `app/api/notifications/generate/route.ts:11–22`.
- **Cron schedule**: poll every 10 minutes (`*/10 * * * *`); digest at 7am Guyana time (UTC-4, no DST → 11:00 UTC). Both registered in `vercel.json` alongside the existing eight cron entries — append, don't restructure.
- **Mutex**: a single-row `polling_state` table replaces the original advisory-lock approach. No RPC exposure, no fallback path. Stale-lock window is 5 minutes (any longer and the poll is presumed crashed).
- **No auto-detection**. The poll function does not import `lib/action-items/detection/*` (those modules don't exist in this revision). All `detected_*` fields written as `NULL`. Manual classification via the meetings-page dropdowns is the entire detection system.
- **Type safety**: Fireflies responses go through Zod at the client boundary; downstream code consumes inferred types.
- **Component placement**: `/action-items/meetings` is a server component with role gating. Inline override dropdowns live on each row (no separate detail page).
- **No AI, no Anthropic SDK** in this plan. Plan 4 owns extraction.
- **Commits**: small, frequent. `feat:`, `test:`, `refactor:`, `docs:`, `chore:`. `npx tsc --noEmit` clean before each commit.

---

## File map

**Created — schema/config:**

- `supabase/migrations/104_action_items_corrections.sql` — drops `meetings_seen.detected_agency_name`, drops `action_item_extractions.agency_name` (and its CHECK), creates `polling_state` table with one seeded row.
- `supabase/migrations/104_action_items_corrections.README.md` — execution + verification doc.
- `vercel.json` — append two cron entries.
- `.env.example` — append `FIREFLIES_API_KEY=`.

**Created — lib (Fireflies client + poll):**

- `lib/action-items/fireflies/types.ts` — `FirefliesTranscriptMeta`, `FirefliesTranscriptFull` interfaces + Zod schemas.
- `lib/action-items/fireflies/client.ts` — `listRecentTranscripts(since, opts?)`, `getTranscript(meetingId)`, internal `firefliesFetch` with 3-retry exponential backoff.
- `lib/action-items/fireflies/poll.ts` — `runFirefliesPoll()` orchestration with `polling_state` mutex.
- `lib/__tests__/action-items-fireflies-client.test.ts` — smoke tests against a mocked `fetch`.

**Created — lib (digest):**

- `lib/action-items/digest.ts` — `buildDailyDigest(asOf?)` + `formatDigestBody(s)`.

**Created — API routes:**

- `app/api/action-items/poll-fireflies/route.ts` — cron entry; delegates to `runFirefliesPoll`.
- `app/api/action-items/digest/route.ts` — cron entry; pushes digest notification.
- `app/api/action-items/meetings/[id]/override/route.ts` — DG/PS PATCH to override `detected_type` / `detected_modality`.

**Created — pages + components:**

- `app/action-items/meetings/page.tsx` — DG/PS-only server component; lists `meetings_seen` rows with filters; embeds `DailyDigestCard`.
- `components/action-items/MeetingsList.tsx` — client child with filter state.
- `components/action-items/MeetingDetectionRow.tsx` — single row with two override dropdowns (type, modality) + `ProcessManuallyButton`.
- `components/action-items/ProcessManuallyButton.tsx` — `<Link>` to `/tasks?action=add&...`.
- `components/action-items/DailyDigestCard.tsx` — renders the digest summary on demand.

**Modified — types/constants:**

- `lib/action-items/types.ts` — remove `agency_name` from `ActionItemExtractionRow`, remove `detected_agency_name` from `MeetingsSeenRow`. (Plan 1 created these types; this is a correction.)

**Modified — War Room (Add Task auto-open from meetings list):**

- `components/tasks/KanbanBoard.tsx` — read `?action=add&meeting_id=&meeting_title=&meeting_date=` from `useSearchParams`; if present, auto-open `NewTaskModal` with prefill, then `router.replace('/tasks')`.
- `components/tasks/NewTaskModal.tsx` — accept `prefillTitle`, `prefillDescription`, `prefillSourceMeetingId` props.

---

## Task 1: Migration 104 — drop per-meeting agency + add polling_state

**Files:**
- Create: `supabase/migrations/104_action_items_corrections.sql`
- Create: `supabase/migrations/104_action_items_corrections.README.md`

The user pastes this SQL via Supabase tools after the file lands. Plan 1's migration 102 and Plan 2's amendment to 102 must already be live; both columns being dropped here are confirmed empty in production.

- [ ] **Step 1: Write the migration file.**

```sql
-- ============================================================================
-- Migration 104: Action Items pipeline corrections (rev 2026-05-04)
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-3-fireflies-ingestion.md
--
-- 1. Drop meeting-level agency columns. Agency is per-action-item via the
--    owner's home agency; multi-agency meetings (mgmt calls, joint sessions)
--    can't be summarized by a single agency_name.
-- 2. Replace the advisory-lock approach for the Fireflies poller with a
--    single-row polling_state table. No RPC exposure, no fallback path.
--
-- Pre-flight: confirm meetings_seen and action_item_extractions are both
-- empty before running:
--   SELECT count(*) FROM meetings_seen;            -- expected: 0
--   SELECT count(*) FROM action_item_extractions;  -- expected: 0
-- If non-zero, stop and migrate data first.
-- ============================================================================

-- 1a) Drop detected_agency_name from meetings_seen (no constraint to drop).
ALTER TABLE meetings_seen DROP COLUMN IF EXISTS detected_agency_name;

-- 1b) Drop agency_name from action_item_extractions. The CHECK was unnamed
--     (inline anonymous), so drop it as part of the column drop.
ALTER TABLE action_item_extractions DROP COLUMN IF EXISTS agency_name;

-- 2) polling_state — single-row mutex for the Fireflies poller.
CREATE TABLE IF NOT EXISTS polling_state (
  id                      UUID PRIMARY KEY,
  locked_at               TIMESTAMPTZ,
  locked_by               TEXT,
  last_poll_completed_at  TIMESTAMPTZ
);

INSERT INTO polling_state (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE polling_state IS
  'Single-row mutex for cron pollers. action_items_poller uses id=...0001.
   Acquire: conditional UPDATE where (locked_at IS NULL OR locked_at < now()-5min).
   Release: UPDATE locked_at=NULL, last_poll_completed_at=now().';
```

- [ ] **Step 2: Write the README.**

`supabase/migrations/104_action_items_corrections.README.md`:

```markdown
# Migration 104 — Action Items pipeline corrections (rev 2026-05-04)

## Summary

- Drops `meetings_seen.detected_agency_name`. Agency is per-task via
  `tasks.owner_user_id → users.agency`, not per-meeting.
- Drops `action_item_extractions.agency_name` (and its CHECK constraint).
- Adds `polling_state` table — single-row mutex for the Fireflies poller.

## Pre-flight

Both dropped columns must be empty:

```sql
SELECT count(*) FROM meetings_seen;            -- expected: 0
SELECT count(*) FROM action_item_extractions;  -- expected: 0
```

If non-zero, do not run this migration without a data-migration step first.

## How to run

Same model as 102: paste the SQL into Supabase Dashboard → SQL Editor.
Idempotent (`IF EXISTS` / `IF NOT EXISTS` / `ON CONFLICT`).

## Verification

```sql
-- Columns dropped
SELECT column_name FROM information_schema.columns
WHERE table_name='meetings_seen' AND column_name='detected_agency_name';
-- expected: 0 rows
SELECT column_name FROM information_schema.columns
WHERE table_name='action_item_extractions' AND column_name='agency_name';
-- expected: 0 rows

-- polling_state seeded
SELECT id FROM polling_state WHERE id='00000000-0000-0000-0000-000000000001';
-- expected: 1 row, locked_at=NULL
```
```

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/104_action_items_corrections.sql supabase/migrations/104_action_items_corrections.README.md
git commit -m "feat(action-items): migration 104 — drop per-meeting agency + add polling_state"
```

---

## Task 2: Update lib types — remove dropped agency fields

**Files:**
- Modify: `lib/action-items/types.ts`

Plan 1 created two row types that referenced the now-dropped columns: `ActionItemExtractionRow.agency_name` and `MeetingsSeenRow.detected_agency_name`. Remove both fields. No other downstream code in Plan 1 referenced them (extraction pipeline isn't built yet); Plan 2 doesn't touch these types.

- [ ] **Step 1: Edit `lib/action-items/types.ts`.**

Remove the line `agency_name: Agency | null;` from `ActionItemExtractionRow`.
Remove the line `detected_agency_name: Agency | null;` from `MeetingsSeenRow`.

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/types.ts
git commit -m "refactor(action-items): drop per-meeting agency fields from row types"
```

---

## Task 3: Vercel Cron + env config

**Files:**
- Modify: `vercel.json`
- Modify: `.env.example`

- [ ] **Step 1: Append two cron entries to `vercel.json`.**

In the `crons` array, append:

```json
{ "path": "/api/action-items/poll-fireflies", "schedule": "*/10 * * * *" },
{ "path": "/api/action-items/digest",         "schedule": "0 11 * * *" }
```

- [ ] **Step 2: Add Fireflies env line to `.env.example`.**

Append:

```
# Fireflies (Action Items pipeline — Plan 3)
FIREFLIES_API_KEY=
```

- [ ] **Step 3: Commit.**

```bash
git add vercel.json .env.example
git commit -m "chore(action-items): register poll-fireflies + digest crons"
```

---

## Task 4: Fireflies types + Zod schema

**Files:**
- Create: `lib/action-items/fireflies/types.ts`

- [ ] **Step 1: Implement.**

```typescript
import { z } from 'zod';

export const FirefliesAttendeeZ = z.object({
  email: z.string().email().nullable().optional(),
  name: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});

export const FirefliesTranscriptMetaZ = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  date: z.union([z.string(), z.number()]),
  duration: z.number().nullable().optional(),
  transcript_url: z.string().url().nullable().optional(),
  meeting_link: z.string().nullable().optional(),
  organizer_email: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  transcript_status: z.string().nullable().optional(),
  attendees: z.array(FirefliesAttendeeZ).default([]),
  meeting_attendees: z.array(FirefliesAttendeeZ).optional(),
});

export type FirefliesTranscriptMeta = z.infer<typeof FirefliesTranscriptMetaZ>;

export const FirefliesTranscriptFullZ = FirefliesTranscriptMetaZ.extend({
  sentences: z.array(z.object({
    speaker_name: z.string().nullable().optional(),
    text: z.string(),
    start_time: z.number().nullable().optional(),
    end_time: z.number().nullable().optional(),
  })).default([]),
});

export type FirefliesTranscriptFull = z.infer<typeof FirefliesTranscriptFullZ>;
```

- [ ] **Step 2: Commit.**

```bash
git add lib/action-items/fireflies/types.ts
git commit -m "feat(action-items): Fireflies meta + transcript Zod schemas"
```

---

## Task 5: Fireflies client (with retry-with-backoff)

**Files:**
- Create: `lib/action-items/fireflies/client.ts`
- Create: `lib/__tests__/action-items-fireflies-client.test.ts`

- [ ] **Step 1: Implement the client.**

```typescript
import 'server-only';
import {
  FirefliesTranscriptMetaZ, FirefliesTranscriptFullZ,
  type FirefliesTranscriptMeta, type FirefliesTranscriptFull,
} from './types';
import { logger } from '@/lib/logger';

const FIREFLIES_GRAPHQL = 'https://api.fireflies.ai/graphql';
const RETRY_DELAYS_MS = [1000, 4000, 16000];

export class FirefliesError extends Error {
  status?: number;
  constructor(msg: string, status?: number) { super(msg); this.status = status; }
}

async function firefliesFetch<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new FirefliesError('FIREFLIES_API_KEY not set');

  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(FIREFLIES_GRAPHQL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ query, variables }),
      });
      if (res.status >= 500) throw new FirefliesError(`Fireflies ${res.status}`, res.status);
      const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors?.length) throw new FirefliesError(`Fireflies GraphQL: ${json.errors.map(e => e.message).join('; ')}`);
      if (!json.data) throw new FirefliesError('Fireflies returned no data');
      return json.data;
    } catch (err) {
      lastErr = err;
      const transient = err instanceof FirefliesError && (err.status === undefined || err.status >= 500);
      if (!transient || attempt === RETRY_DELAYS_MS.length) break;
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
    }
  }
  logger.error({ err: lastErr }, 'Fireflies fetch failed after retries');
  throw lastErr instanceof Error ? lastErr : new FirefliesError(String(lastErr));
}

const LIST_QUERY = `
  query ListTranscripts($fromDate: DateTime, $limit: Int) {
    transcripts(fromDate: $fromDate, limit: $limit) {
      id title date duration transcript_url meeting_link
      organizer_email source transcript_status
      meeting_attendees { email name displayName }
    }
  }
`;

const GET_QUERY = `
  query GetTranscript($id: String!) {
    transcript(id: $id) {
      id title date duration transcript_url meeting_link
      organizer_email source transcript_status
      meeting_attendees { email name displayName }
      sentences { speaker_name text start_time end_time }
    }
  }
`;

export async function listRecentTranscripts(since: Date, limit = 50): Promise<FirefliesTranscriptMeta[]> {
  const data = await firefliesFetch<{ transcripts: unknown[] }>(LIST_QUERY, {
    fromDate: since.toISOString(), limit,
  });
  const out: FirefliesTranscriptMeta[] = [];
  for (const raw of data.transcripts ?? []) {
    const parsed = FirefliesTranscriptMetaZ.safeParse(raw);
    if (parsed.success) {
      const t = parsed.data;
      if ((!t.attendees || t.attendees.length === 0) && t.meeting_attendees) {
        t.attendees = t.meeting_attendees;
      }
      out.push(t);
    } else {
      logger.warn({ err: parsed.error.flatten(), raw }, 'Fireflies transcript meta failed schema');
    }
  }
  return out;
}

export async function getTranscript(meetingId: string): Promise<FirefliesTranscriptFull | null> {
  const data = await firefliesFetch<{ transcript: unknown }>(GET_QUERY, { id: meetingId });
  if (!data.transcript) return null;
  const parsed = FirefliesTranscriptFullZ.safeParse(data.transcript);
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten() }, 'Fireflies transcript full failed schema');
    return null;
  }
  return parsed.data;
}
```

- [ ] **Step 2: Smoke-test against a mocked fetch.**

```typescript
// lib/__tests__/action-items-fireflies-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  process.env.FIREFLIES_API_KEY = 'test-key';
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((cb: () => void) => { cb(); return 0 as unknown as ReturnType<typeof setTimeout>; }) as typeof setTimeout);
});

describe('listRecentTranscripts', () => {
  it('returns parsed transcripts on success', async () => {
    mockFetch.mockResolvedValueOnce({
      status: 200,
      json: async () => ({ data: { transcripts: [
        { id: 't1', title: 'Mgmt Call', date: '2026-04-13T10:00:00Z',
          source: 'Google Meet', meeting_attendees: [{ email: 'a@mpua.gov.gy' }] },
      ] } }),
    });
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    const out = await listRecentTranscripts(new Date('2026-04-13'));
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t1');
  });

  it('retries 3x on 500 then succeeds', async () => {
    mockFetch
      .mockResolvedValueOnce({ status: 500, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 502, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 503, json: async () => ({}) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ data: { transcripts: [] } }) });
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    const out = await listRecentTranscripts(new Date());
    expect(out).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('throws after retries exhausted', async () => {
    mockFetch.mockResolvedValue({ status: 500, json: async () => ({}) });
    const { listRecentTranscripts, FirefliesError } = await import('@/lib/action-items/fireflies/client');
    await expect(listRecentTranscripts(new Date())).rejects.toBeInstanceOf(FirefliesError);
  });

  it('throws when API key missing', async () => {
    delete process.env.FIREFLIES_API_KEY;
    const { listRecentTranscripts } = await import('@/lib/action-items/fireflies/client');
    await expect(listRecentTranscripts(new Date())).rejects.toThrow(/API_KEY/);
  });
});
```

```bash
npx vitest run lib/__tests__/action-items-fireflies-client.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/fireflies/client.ts lib/__tests__/action-items-fireflies-client.test.ts
git commit -m "feat(action-items): Fireflies GraphQL client with retry-with-backoff"
```

---

## Task 6: Poll orchestration with `polling_state` mutex

**Files:**
- Create: `lib/action-items/fireflies/poll.ts`

- [ ] **Step 1: Implement.**

```typescript
import 'server-only';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db';
import { listRecentTranscripts } from './client';
import type { FirefliesTranscriptMeta } from './types';
import { logger } from '@/lib/logger';

const POLLER_ID = '00000000-0000-0000-0000-000000000001';
const STALE_LOCK_MS = 5 * 60 * 1000;
const COLD_START_DAYS = 7;

export interface PollResult {
  status: 'ok' | 'lock-not-acquired' | 'fireflies-error';
  observed: number;
  inserted: number;
  queued: number;
  failed: number;
  watermark_used: string | null;
  watermark_advanced_to: string | null;
}

function transcriptDateIso(d: FirefliesTranscriptMeta['date']): string {
  return typeof d === 'number' ? new Date(d).toISOString() : d;
}

function isTranscriptReady(t: FirefliesTranscriptMeta): boolean {
  if (t.transcript_status && t.transcript_status.toLowerCase() !== 'complete') return false;
  return true;
}

async function tryAcquireLock(instance: string): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString();
  const { data } = await supabaseAdmin
    .from('polling_state')
    .update({ locked_at: new Date().toISOString(), locked_by: instance })
    .eq('id', POLLER_ID)
    .or(`locked_at.is.null,locked_at.lt.${staleCutoff}`)
    .select('id');
  return Array.isArray(data) && data.length > 0;
}

async function releaseLock(): Promise<void> {
  await supabaseAdmin
    .from('polling_state')
    .update({ locked_at: null, locked_by: null, last_poll_completed_at: new Date().toISOString() })
    .eq('id', POLLER_ID);
}

export async function runFirefliesPoll(): Promise<PollResult> {
  const instance = randomUUID();
  const got = await tryAcquireLock(instance);
  if (!got) {
    logger.info('action_items_poller: lock not acquired (another run in flight)');
    return { status: 'lock-not-acquired', observed: 0, inserted: 0, queued: 0, failed: 0,
             watermark_used: null, watermark_advanced_to: null };
  }
  try {
    return await pollInner();
  } finally {
    await releaseLock();
  }
}

async function pollInner(): Promise<PollResult> {
  // Watermark: max(transcript_ready_at) from meetings_seen.
  const { data: watermarkRow } = await supabaseAdmin
    .from('meetings_seen')
    .select('transcript_ready_at')
    .order('transcript_ready_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const since = watermarkRow?.transcript_ready_at
    ? new Date(watermarkRow.transcript_ready_at)
    : new Date(Date.now() - COLD_START_DAYS * 24 * 60 * 60 * 1000);

  let metas: FirefliesTranscriptMeta[];
  try {
    metas = await listRecentTranscripts(since);
  } catch (err) {
    await supabaseAdmin.from('failed_extractions').insert({
      fireflies_meeting_id: '<batch>',
      failure_reason: 'other',
      failure_detail: `listTranscripts: ${err instanceof Error ? err.message : String(err)}`,
    });
    return { status: 'fireflies-error', observed: 0, inserted: 0, queued: 0, failed: 1,
             watermark_used: since.toISOString(), watermark_advanced_to: since.toISOString() };
  }

  let inserted = 0, queued = 0, failed = 0;
  let advancedTo = since.toISOString();

  for (const t of metas) {
    const ready = isTranscriptReady(t);
    const dateIso = transcriptDateIso(t.date);

    // No auto-detection. detected_type/detected_modality stay NULL until the
    // user sets them via the meetings list dropdowns.
    const row = {
      fireflies_meeting_id: t.id,
      meeting_title: t.title ?? null,
      meeting_date: dateIso,
      detected_type: null,
      detected_modality: null,
      attendee_emails: (t.attendees ?? []).map(a => a.email).filter((e): e is string => !!e),
      transcript_ready_at: ready ? dateIso : null,
      pipeline_action: 'queued' as const,
      skip_reason: ready ? null : 'transcript_not_ready',
    };

    const { data, error } = await supabaseAdmin
      .from('meetings_seen')
      .upsert(row, { onConflict: 'fireflies_meeting_id', ignoreDuplicates: true })
      .select('id');

    if (error) {
      logger.error({ err: error, meetingId: t.id }, 'meetings_seen upsert failed');
      failed++;
      continue;
    }
    if (data && data.length > 0) inserted++;
    queued++;
    if (ready && dateIso > advancedTo) advancedTo = dateIso;
  }

  return { status: 'ok', observed: metas.length, inserted, queued, failed,
           watermark_used: since.toISOString(), watermark_advanced_to: advancedTo };
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/fireflies/poll.ts
git commit -m "feat(action-items): runFirefliesPoll — polling_state mutex + queued classifier"
```

---

## Task 7: `/api/action-items/poll-fireflies` route

**Files:**
- Create: `app/api/action-items/poll-fireflies/route.ts`

- [ ] **Step 1: Implement.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runFirefliesPoll } from '@/lib/action-items/fireflies/poll';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let isAuthed = isCron;
  if (!isAuthed) {
    const session = await auth();
    isAuthed = !!session?.user?.id && ['dg', 'ps', 'parl_sec'].includes(session.user.role);
  }
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await runFirefliesPoll();
    return NextResponse.json(result);
  } catch (err) {
    logger.error({ err }, 'poll-fireflies failed');
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Poll failed' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit.**

```bash
git add app/api/action-items/poll-fireflies/route.ts
git commit -m "feat(action-items): poll-fireflies cron route"
```

---

## Task 8: Daily digest helper + cron + DailyDigestCard

**Files:**
- Create: `lib/action-items/digest.ts`
- Create: `app/api/action-items/digest/route.ts`
- Create: `components/action-items/DailyDigestCard.tsx`

- [ ] **Step 1: Helper.**

```typescript
// lib/action-items/digest.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';

export interface DigestSummary {
  date_range: { start: string; end: string };
  observed: number;
  extracted: number;
  queued: number;
  skipped: number;
  failed: number;
  by_type: Record<string, number>;        // null counts under 'unclassified'
  by_modality: Record<string, number>;
  failed_extraction_count: number;
}

export async function buildDailyDigest(asOf: Date = new Date()): Promise<DigestSummary> {
  const end = new Date(asOf); end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const { data: rows } = await supabaseAdmin
    .from('meetings_seen')
    .select('pipeline_action, detected_type, detected_modality')
    .gte('observed_at', start.toISOString())
    .lt('observed_at', end.toISOString());
  const observed = rows?.length ?? 0;

  const c = { extracted: 0, queued: 0, skipped: 0, failed: 0 };
  const by_type: Record<string, number> = {};
  const by_modality: Record<string, number> = {};
  for (const r of rows ?? []) {
    if (r.pipeline_action === 'extracted') c.extracted++;
    else if (r.pipeline_action === 'queued') c.queued++;
    else if (r.pipeline_action === 'skipped_out_of_scope') c.skipped++;
    else if (r.pipeline_action === 'failed') c.failed++;
    const t = r.detected_type ?? 'unclassified';
    const m = r.detected_modality ?? 'unclassified';
    by_type[t] = (by_type[t] ?? 0) + 1;
    by_modality[m] = (by_modality[m] ?? 0) + 1;
  }

  const { count: failedCount } = await supabaseAdmin
    .from('failed_extractions')
    .select('id', { count: 'exact', head: true })
    .gte('attempted_at', start.toISOString())
    .lt('attempted_at', end.toISOString());

  return {
    date_range: { start: start.toISOString(), end: end.toISOString() },
    observed,
    extracted: c.extracted, queued: c.queued, skipped: c.skipped, failed: c.failed,
    by_type, by_modality,
    failed_extraction_count: failedCount ?? 0,
  };
}

export function formatDigestBody(s: DigestSummary): string {
  const parts = [`${s.observed} meeting${s.observed === 1 ? '' : 's'} detected`];
  if (s.extracted > 0) parts.push(`${s.extracted} extracted`);
  if (s.queued > 0)    parts.push(`${s.queued} queued`);
  if (s.skipped > 0)   parts.push(`${s.skipped} skipped`);
  if (s.failed > 0)    parts.push(`${s.failed} failed`);
  return parts.join(' · ');
}
```

- [ ] **Step 2: Cron route.**

```typescript
// app/api/action-items/digest/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { buildDailyDigest, formatDigestBody } from '@/lib/action-items/digest';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export { handler as GET, handler as POST };

async function handler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let isAuthed = isCron;
  if (!isAuthed) {
    const session = await auth();
    isAuthed = !!session?.user?.id && session.user.role === 'dg';
  }
  if (!isAuthed) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const summary = await buildDailyDigest();
  const body = formatDigestBody(summary);

  const { data: recipients } = await supabaseAdmin
    .from('users').select('id').eq('role', 'dg').eq('is_active', true);

  const now = new Date().toISOString();
  let pushed = 0;
  for (const r of recipients ?? []) {
    try {
      await insertNotification({
        user_id: r.id as string,
        type: 'action_items_daily_digest',
        title: `Action Items — yesterday's pipeline`,
        body,
        icon: null,
        priority: 'low',
        reference_type: 'system',
        reference_id: null,
        reference_url: '/action-items/meetings',
        scheduled_for: now,
        category: 'system',
        source_module: 'action-items',
        action_required: false,
      });
      pushed++;
    } catch (err) {
      logger.error({ err, userId: r.id }, 'digest notification failed (non-fatal)');
    }
  }

  return NextResponse.json({ summary, pushed });
}
```

- [ ] **Step 3: Card component.**

```tsx
// components/action-items/DailyDigestCard.tsx
import type { DigestSummary } from '@/lib/action-items/digest';

export function DailyDigestCard({ summary }: { summary: DigestSummary }) {
  const stats = [
    { label: 'observed',  value: summary.observed },
    { label: 'extracted', value: summary.extracted },
    { label: 'queued',    value: summary.queued },
    { label: 'skipped',   value: summary.skipped },
    { label: 'failed',    value: summary.failed },
  ];
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-sm uppercase text-navy-600">Yesterday's pipeline</h2>
        <span className="text-xs text-navy-600">
          {new Date(summary.date_range.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-3">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <div className="text-xl text-white font-semibold">{s.value}</div>
            <div className="text-[10px] uppercase text-navy-600">{s.label}</div>
          </div>
        ))}
      </div>
      {summary.failed_extraction_count > 0 && (
        <div className="mt-3 text-xs text-red-500">
          {summary.failed_extraction_count} failed extraction{summary.failed_extraction_count === 1 ? '' : 's'} need attention.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/digest.ts app/api/action-items/digest/route.ts components/action-items/DailyDigestCard.tsx
git commit -m "feat(action-items): daily digest cron + DailyDigestCard"
```

---

## Task 9: Meetings list page + override route + Process manually CTA

**Files:**
- Create: `app/api/action-items/meetings/[id]/override/route.ts`
- Create: `components/action-items/ProcessManuallyButton.tsx`
- Create: `components/action-items/MeetingDetectionRow.tsx`
- Create: `components/action-items/MeetingsList.tsx`
- Create: `app/action-items/meetings/page.tsx`

- [ ] **Step 1: PATCH route for inline override (type/modality only — no agency).**

```typescript
// app/api/action-items/meetings/[id]/override/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { MeetingTypeZ, ModalityZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({
  detected_type: MeetingTypeZ.nullable().optional(),
  detected_modality: ModalityZ.nullable().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { error } = await supabaseAdmin.from('meetings_seen').update(parsed.data).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Process manually button.**

```tsx
// components/action-items/ProcessManuallyButton.tsx
import Link from 'next/link';

export function ProcessManuallyButton({
  meetingId, meetingTitle, meetingDate,
}: {
  meetingId: string; meetingTitle: string | null; meetingDate: string | null;
}) {
  const params = new URLSearchParams();
  params.set('action', 'add');
  params.set('meeting_id', meetingId);
  if (meetingTitle) params.set('meeting_title', meetingTitle);
  if (meetingDate)  params.set('meeting_date', meetingDate);
  return (
    <Link href={`/tasks?${params.toString()}`}
      className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded">
      Process manually
    </Link>
  );
}
```

- [ ] **Step 3: Detection row (two dropdowns: type, modality).**

```tsx
// components/action-items/MeetingDetectionRow.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MEETING_TYPES, MODALITIES, type MeetingType, type Modality } from '@/lib/action-items/constants';
import { ProcessManuallyButton } from './ProcessManuallyButton';

export interface MeetingRow {
  id: string;
  fireflies_meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  pipeline_action: 'extracted' | 'skipped_out_of_scope' | 'queued' | 'failed' | 'manually_processed';
  skip_reason: string | null;
}

export function MeetingDetectionRow({ row }: { row: MeetingRow }) {
  const router = useRouter();
  const [t, setT] = useState<MeetingType | null>(row.detected_type);
  const [m, setM] = useState<Modality | null>(row.detected_modality);
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/action-items/meetings/${row.id}/override`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-navy-800">
      <td className="px-2 py-2 text-xs">
        <div className="text-white">{row.meeting_title ?? '(untitled)'}</div>
        <div className="text-navy-600">{row.meeting_date ? new Date(row.meeting_date).toLocaleString() : ''}</div>
      </td>
      <td className="px-2 py-2">
        <select value={t ?? ''} disabled={busy}
          onChange={e => { const v = (e.target.value || null) as MeetingType | null; setT(v); patch({ detected_type: v }); }}
          className="bg-navy-900 border border-navy-800 rounded px-1 py-0.5 text-xs">
          <option value="">—</option>
          {MEETING_TYPES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <select value={m ?? ''} disabled={busy}
          onChange={e => { const v = (e.target.value || null) as Modality | null; setM(v); patch({ detected_modality: v }); }}
          className="bg-navy-900 border border-navy-800 rounded px-1 py-0.5 text-xs">
          <option value="">—</option>
          {MODALITIES.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
      </td>
      <td className="px-2 py-2 text-xs">
        <span className={`uppercase ${row.pipeline_action === 'failed' ? 'text-red-500' : 'text-navy-600'}`}>
          {row.pipeline_action.replace(/_/g, ' ')}
        </span>
        {row.skip_reason && <div className="text-[10px] text-navy-600">{row.skip_reason}</div>}
      </td>
      <td className="px-2 py-2 text-right">
        <ProcessManuallyButton
          meetingId={row.fireflies_meeting_id}
          meetingTitle={row.meeting_title}
          meetingDate={row.meeting_date}
        />
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: List + page.**

```tsx
// components/action-items/MeetingsList.tsx
'use client';
import { useMemo, useState } from 'react';
import { MeetingDetectionRow, type MeetingRow } from './MeetingDetectionRow';
import { MEETING_TYPES, PIPELINE_ACTIONS, type MeetingType, type PipelineAction } from '@/lib/action-items/constants';

export function MeetingsList({ rows }: { rows: MeetingRow[] }) {
  const [actionFilter, setActionFilter] = useState<PipelineAction | ''>('');
  const [typeFilter, setTypeFilter] = useState<MeetingType | 'unclassified' | ''>('');

  const filtered = useMemo(() => rows.filter(r =>
    (!actionFilter || r.pipeline_action === actionFilter)
    && (!typeFilter ||
        (typeFilter === 'unclassified' ? r.detected_type === null : r.detected_type === typeFilter))
  ), [rows, actionFilter, typeFilter]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 text-xs">
        <label>Action:
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value as PipelineAction | '')}
            className="ml-2 bg-navy-900 border border-navy-800 rounded px-2 py-1">
            <option value="">all</option>
            {PIPELINE_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label>Type:
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as MeetingType | 'unclassified' | '')}
            className="ml-2 bg-navy-900 border border-navy-800 rounded px-2 py-1">
            <option value="">all</option>
            <option value="unclassified">unclassified</option>
            {MEETING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="text-navy-600 ml-auto">{filtered.length} of {rows.length}</span>
      </div>
      <div className="border border-navy-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-900 text-navy-600 text-xs uppercase">
            <tr>
              <th className="px-2 py-2 text-left">Meeting</th>
              <th className="px-2 py-2 text-left">Type</th>
              <th className="px-2 py-2 text-left">Modality</th>
              <th className="px-2 py-2 text-left">Status</th>
              <th className="px-2 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>{filtered.map(r => <MeetingDetectionRow key={r.id} row={r} />)}</tbody>
        </table>
      </div>
    </div>
  );
}
```

```tsx
// app/action-items/meetings/page.tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { MeetingsList } from '@/components/action-items/MeetingsList';
import { DailyDigestCard } from '@/components/action-items/DailyDigestCard';
import { buildDailyDigest } from '@/lib/action-items/digest';
import type { MeetingRow } from '@/components/action-items/MeetingDetectionRow';

const ALLOWED = new Set(['dg', 'ps', 'parl_sec']);
export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED.has(session.user.role)) {
    return <div className="card-premium p-12 text-center">Restricted to DG and Permanent Secretary.</div>;
  }

  const [{ data: rows }, summary] = await Promise.all([
    supabaseAdmin
      .from('meetings_seen')
      .select('id, fireflies_meeting_id, meeting_title, meeting_date, detected_type, detected_modality, pipeline_action, skip_reason')
      .order('meeting_date', { ascending: false })
      .limit(200),
    buildDailyDigest(),
  ]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="stat-number text-2xl">Meetings (Action Items pipeline)</h1>
          <p className="text-sm text-navy-600">
            Every Fireflies meeting the poller observed. Classify type + modality manually; Plan 4 extracts internal+virtual rows.
          </p>
        </div>
        <Link href="/action-items/review" className="text-xs underline text-navy-600">Review queue →</Link>
      </div>
      <DailyDigestCard summary={summary} />
      <MeetingsList rows={(rows ?? []) as unknown as MeetingRow[]} />
    </div>
  );
}
```

- [ ] **Step 5: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/action-items/meetings/page.tsx app/api/action-items/meetings components/action-items/MeetingsList.tsx components/action-items/MeetingDetectionRow.tsx components/action-items/ProcessManuallyButton.tsx
git commit -m "feat(action-items): meetings list with manual classification dropdowns"
```

---

## Task 10: War Room Add Task auto-open from meetings list

**Files:**
- Modify: `components/tasks/KanbanBoard.tsx`
- Modify: `components/tasks/NewTaskModal.tsx`

The deep link from `ProcessManuallyButton` is `/tasks?action=add&meeting_id=<id>&meeting_title=<t>&meeting_date=<d>`. The Kanban reads these and auto-opens `NewTaskModal` with prefilled metadata, then strips the params from the URL.

- [ ] **Step 1: Inspect the existing modal API.**

```bash
grep -n "NewTaskModal\|isOpen\|onClose\|initialValues" components/tasks/NewTaskModal.tsx components/tasks/KanbanBoard.tsx | head -20
```

Identify how the modal is currently opened and what initial-value props it accepts.

- [ ] **Step 2: Extend `NewTaskModal.tsx` with three optional prefill props.**

If `initialValues` already exists, reuse. Otherwise add at the top of the props interface:

```typescript
prefillTitle?: string;
prefillDescription?: string;
prefillSourceMeetingId?: string;
```

Respect them in `useState` initializers; default to `''`/`undefined`.

- [ ] **Step 3: Wire `KanbanBoard.tsx`.**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
// ...
const router = useRouter();
const params = useSearchParams();
const [meetingPrefill, setMeetingPrefill] = useState<null | {
  meeting_id: string; meeting_title: string; meeting_date: string;
}>(null);

useEffect(() => {
  if (params.get('action') !== 'add') return;
  const meeting_id = params.get('meeting_id') ?? '';
  if (!meeting_id) return;
  setMeetingPrefill({
    meeting_id,
    meeting_title: params.get('meeting_title') ?? '',
    meeting_date: params.get('meeting_date') ?? '',
  });
  setNewTaskModalOpen(true);  // adjust to actual state name in the file
  router.replace('/tasks');
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

Pass to the modal:

```tsx
<NewTaskModal
  isOpen={newTaskModalOpen}
  onClose={() => { setNewTaskModalOpen(false); setMeetingPrefill(null); }}
  prefillTitle={meetingPrefill ? `From: ${meetingPrefill.meeting_title || meetingPrefill.meeting_id}` : undefined}
  prefillDescription={meetingPrefill ?
    `From meeting: ${meetingPrefill.meeting_title || meetingPrefill.meeting_id}${meetingPrefill.meeting_date ? ` (${new Date(meetingPrefill.meeting_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}` :
    undefined}
  prefillSourceMeetingId={meetingPrefill?.meeting_id}
  /* ...existing props */
/>
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/tasks/KanbanBoard.tsx components/tasks/NewTaskModal.tsx
git commit -m "feat(action-items): War Room auto-opens Add Task with meeting prefill"
```

---

## Task 11: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Test suite + type-check + build.**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean. Build output should include `/api/action-items/poll-fireflies`, `/api/action-items/digest`, `/api/action-items/meetings/[id]/override`, `/action-items/meetings`.

- [ ] **Step 2: Manual smoke.**

Pre-conditions: `FIREFLIES_API_KEY` and `CRON_SECRET` set locally; migration 104 already applied.

```bash
npm run dev
```

1. Sign in as DG. Hit `/api/action-items/poll-fireflies`. Expected: JSON `{ status: 'ok', observed, inserted, queued, failed, watermark_used, watermark_advanced_to }`. If `FIREFLIES_API_KEY` is invalid, expect a `failed_extractions` row with `fireflies_meeting_id='<batch>'`.
2. Visit `/action-items/meetings`. Rows appear with `detected_type=null` and `detected_modality=null` (dropdowns blank).
3. Set type→`internal` and modality→`virtual` on one row via dropdowns. Refresh; persists.
4. Click **Process manually** on any row. War Room opens with the Add Task modal pre-populated. Submit. Confirm `tasks.source_meeting_id` is the Fireflies ID.
5. Re-trigger the poll. `inserted=0` (idempotent via `meetings_seen.fireflies_meeting_id` UNIQUE).
6. Run two polls in fast succession (e.g., open two browser tabs). One returns `status: 'lock-not-acquired'`.
7. Hit `/api/action-items/digest`. Notification appears in DG's notification panel.

- [ ] **Step 3: Production-readiness handoff.**

Surface to user:

> Before enabling the production crons:
> 1. Verify Fireflies GraphQL field names (`source`, `meeting_attendees`, `transcript_status`) against the live tenant. The Zod schema is permissive but the client expects these key names.
> 2. Confirm `FIREFLIES_API_KEY` and `CRON_SECRET` are set in Vercel project env (not just locally).
> 3. Apply migration 104 if not already applied.

---

## Self-review

**Spec coverage** (against rev 2026-05-03b):

- §3.5 `meetings_seen` (population) → Task 6.
- §3.6 `failed_extractions` (Fireflies-side failures) → Task 6.
- §12.1 cron schedule → Task 3.
- §12.2 poll algorithm — mutex, watermark, ON CONFLICT idempotency → Tasks 1, 6, 7. (Advisory lock replaced with `polling_state` table.)
- §12.4 daily digest → Task 8.
- Manual classification (replaces auto-detection) → Task 9.

**Not in this plan (correctly deferred):**

- Plan 4: extraction itself, `tasks` insert with `source='extraction'`, three-bucket review UI, prompt files, validation hook for extraction-specific fields, political-risk gate, supersession suggestion display, manual extraction trigger, eval data capture. Plan 4 picks up `pipeline_action='queued'` rows that the user has classified as `internal+virtual`.
- Plan 5: supersession matcher, drift detector, trust tracker, eval dashboard, stale-meeting auto-archive.

**Placeholder scan:** every step has concrete code or a concrete command. No "TBD".

**Type consistency:**

- `pipeline_action` literal union matches `PIPELINE_ACTIONS` in constants.ts.
- `detected_type` / `detected_modality` are nullable everywhere (DB CHECK already allows NULL; types reflect it).
- Cron auth pattern matches `app/api/notifications/generate/route.ts:11–22`.
- `FirefliesTranscriptMeta` shape is consistent across types.ts, client.ts, poll.ts.

---

## Decisions I made on your behalf

1. **Stale-lock window: 5 minutes.** A poll that hasn't released its lock in 5 minutes is presumed crashed. Long enough that a slow Fireflies fetch doesn't spuriously break the lock; short enough that a real crash recovers within one cron tick.
2. **Cold-start watermark window: 7 days.** When `meetings_seen` is empty, the watermark falls back to `now() - 7 days`. Spec doesn't specify; 7 days is a reasonable balance between catching missed meetings and not overwhelming the first poll.
3. **Single sidebar entry → `/action-items/review`** stays as Plan 1 set it. Meetings page reachable from a bidirectional in-page link. No second top-level entry.
4. **Per-row inline override dropdowns** (type + modality only, no agency) instead of a separate detail page.
5. **Digest recipients: active DGs only** in v1 (typically one user). PS reads the same data via the on-demand card.
6. **Daily digest payload structure** lives in `lib/action-items/digest.ts`. The route reads the same module the card reads — push channel and in-app card cannot diverge.
7. **Override PATCH does not log to `action_item_events`.** Spec doesn't model `meetings_seen` events. If an audit trail of overrides is needed later, add a separate table or reuse `action_item_events` with a new `event_type` (out of v1 scope).
8. **War Room query-param prefill carries `meeting_id`, `meeting_title`, `meeting_date` only.** No `meeting_type` / `modality` / `agency` — the existing tasks schema doesn't store them at the row level (agency comes per-task via owner). The description string carries the human-readable provenance.
9. **`runFirefliesPoll` is end-to-end-only** — not unit-tested. Pure client and (in Plan 4) detection-free poll path are simple enough that mocking Supabase + Fireflies for unit tests is more code than the orchestration itself.
10. **Migration 104 is a separate file** rather than appending to 102. Plan 1 corrected 102 in place because that migration hadn't run yet; 102 is now considered shipped (or imminently shipping with Plan 2's amendment), so 104 lands as a new migration.

---

## End of Plan 3
