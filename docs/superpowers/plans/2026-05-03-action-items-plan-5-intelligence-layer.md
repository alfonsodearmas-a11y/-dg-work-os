# Action Items — Plan 5: Supersession + Trust Tracker + Eval + Stale-Meeting Auto-Archive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (rev 2026-05-03b — read the changelog first).
**Predecessors:**
- Plan 1 (shipped) — schema, types, visibility, review shells.
- Plan 2 (in flight) — `tasks` widened with provenance + `task_embedding` column, lifecycle + verification surface, `validateTaskDraft`.
- Plan 3 (corrected) — Fireflies poll + `meetings_seen` + `pipeline_action='queued'` rows + manual classification + daily digest.
- Plan 4 — extraction pipeline + three-bucket review + political-risk gate + `runExtraction` + batch submit endpoint + `SupersessionSuggestion` slot.

**Goal:** Add the intelligence layer on top of the working pipeline. (1) **Supersession matcher** — reviewer-confirmed only, never auto-link, generates suggestions during review *and* runs a weekly drift job that flags missed supersessions; sets `tasks.status='superseded'` (not `cancelled`) on confirm. (2) **Earned-trust tracker** — built but **disabled** in v1 per spec §11.6, never bypasses the political-risk gate. Enables an auto-accepted bucket only after 8+ meetings reviewed with ≥95% accepted-unedited, zero attribution-error flags, and a 30-day calendar window; activation is a manual flag flip after the eval period concludes. (3) **Eval dashboard** at `/action-items/eval` — DG-only, computes recall / precision / owner-accuracy / overconfidence-rate against the 95/90/90/3% thresholds from spec §13, on-the-fly from `action_item_extractions` counters and `tasks.confidence_overall`. (4) **Stale-meeting auto-archive** — meetings unreviewed for 14 days have their mandatory + quick-scan items dropped (counted as `items_rejected` for telemetry; never auto-accepted).

**Architecture:** No new schema unless absolutely necessary. Embeddings populate via OpenAI's `text-embedding-3-small` (1536-dim) called from a background worker triggered by `runExtraction` after each successful insert into `tasks`. The matcher is a single function `findSupersessionCandidates(task)` used in two places: real-time during review (Plan 4's `<SupersessionSuggestion>` slot is wired to it here) and the weekly Sunday cron (`/api/action-items/drift`). The trust tracker is a pure function `evaluateTrust(meetingType, modality)` that returns `{ activated, accepted_unedited_pct, meetings_reviewed, ... }` reading from `action_item_extractions` and `action_item_events`; the auto-accepted bucket in Plan 4's review page reads its return value but only honors `activated=true` when an env-flag `EARNED_TRUST_ENABLED=true` is set (v1 ships unset). The eval dashboard is a DG-only server component computing metrics from extraction counters and a labeled-ground-truth file (or, in the absence of labels, from the review-decision history). Stale-meeting auto-archive is a daily cron that finds extractions older than 14 days with `review_status='pending'` and stamps them `'skipped'` while incrementing `items_rejected` to record the dropped items.

**Tech Stack:** Next.js 16 App Router, Supabase JS, pgvector (already enabled by Plan 1), OpenAI SDK (`openai` npm package) for embeddings, existing notifications stack for digest extension.

---

## Conventions for this plan

- **Tests live in** `lib/__tests__/`. Pure-logic modules (matcher scoring, trust tuple, eval metrics, drift detector) are TDD. Cron handlers + dashboard pages are exercised end-to-end.
- **No new tables or columns** unless absolutely necessary. The `tasks.task_embedding VECTOR(1536)` column was added by Plan 1 migration 102; that's our only embedding storage.
- **Embeddings**: generated via OpenAI `text-embedding-3-small` for the task title only (concise, stable, cheap). Generated on extraction-time accept; manual tasks are *not* embedded in v1 (matcher only operates on extracted-source items).
- **Auth on every route**: `requireRole(['dg'])` for the eval dashboard and the manual drift trigger; `CRON_SECRET` for cron entries (matches Plan 3's pattern).
- **Cron schedule**: drift detector at Sunday 02:00 UTC (`0 2 * * 0`); stale-meeting auto-archive at 03:00 UTC daily (`0 3 * * *`). Both append to `vercel.json`.
- **Trust tuple shape**: `(meeting_type, modality)` only. Per correction 2, agency is per-task not per-meeting; trust gates are meeting-scoped, so dropping agency from the tuple matches reality.
- **Trust never bypasses the political-risk gate** (spec §7). The gate is the floor; trust only fills the auto-accepted bucket *for items that already pass the gate*.
- **Supersession status is `'superseded'`** on the prior task (added to `tasks_status_check` by Plan 1 migration 102). Never `'cancelled'`.
- **Commits**: small, frequent. `feat:`, `test:`, `refactor:`, `docs:`, `chore:`. `npx tsc --noEmit` clean before each commit.

---

## File map

**Created — embeddings:**

- `lib/action-items/embeddings/openai.ts` — `embedText(text)` thin wrapper; retry-with-backoff.
- `lib/action-items/embeddings/backfill.ts` — `embedTask(taskId)` reads task title, embeds, writes `task_embedding`.
- `lib/__tests__/action-items-embeddings.test.ts` — mocked-fetch smoke test.

**Created — supersession matcher:**

- `lib/action-items/matcher/supersession.ts` — `findSupersessionCandidates(task, opts?)`.
- `lib/__tests__/action-items-matcher.test.ts` — TDD coverage for noun extraction + scoring.

**Created — drift detector:**

- `lib/action-items/matcher/drift.ts` — `runDriftDetector()` weekly job.

**Created — trust tracker:**

- `lib/action-items/trust/tracker.ts` — `evaluateTrust(meetingType, modality)` pure function.
- `lib/__tests__/action-items-trust.test.ts` — TDD coverage.

**Created — eval:**

- `lib/action-items/eval/metrics.ts` — `computeEvalMetrics()` reads extraction counters + tasks.confidence_overall.
- `lib/__tests__/action-items-eval-metrics.test.ts` — TDD coverage.

**Created — API routes:**

- `app/api/action-items/embed/route.ts` — internal `POST` to embed a single task; called from Plan 4's batch-submit on accept (modify Plan 4 file slightly to call this).
- `app/api/action-items/drift/route.ts` — cron entry for weekly drift detector.
- `app/api/action-items/auto-archive/route.ts` — cron entry for daily stale-meeting auto-archive.

**Created — pages + components:**

- `app/action-items/eval/page.tsx` — DG-only dashboard.
- `components/action-items/EvalCard.tsx` — single metric card (recall / precision / owner-accuracy / overconfidence).
- `components/action-items/DriftReportCard.tsx` — extends Plan 3's daily digest with a "drift report" section when items need a second look.

**Modified:**

- `vercel.json` — append two new cron entries.
- `components/action-items/SupersessionSuggestion.tsx` (Plan 4 stub) — wire to `findSupersessionCandidates`.
- `app/api/action-items/review/[extractionId]/route.ts` (Plan 4) — after each accepted insert, fire-and-forget POST to `/api/action-items/embed?task_id=...`.
- `lib/action-items/digest.ts` (Plan 3) — extend `DigestSummary` with `drift_count` and `failed_extraction_count` already there; the daily digest cron in Plan 3 emits the existing fields plus a new `drift_count` from this plan when present.
- `package.json` — add `openai`.

---

## Task 1: OpenAI embeddings client

**Files:**
- Modify: `package.json`
- Create: `lib/action-items/embeddings/openai.ts`
- Create: `lib/__tests__/action-items-embeddings.test.ts`

- [ ] **Step 1: Install OpenAI SDK.**

```bash
npm install openai
```

- [ ] **Step 2: Failing test (mock fetch).**

```typescript
// lib/__tests__/action-items-embeddings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('openai', () => {
  const create = vi.fn(async () => ({ data: [{ embedding: Array.from({ length: 1536 }, (_, i) => i / 1536) }] }));
  return { default: vi.fn().mockImplementation(() => ({ embeddings: { create } })), __mocks: { create } };
});

beforeEach(() => { process.env.OPENAI_API_KEY = 'k'; });

describe('embedText', () => {
  it('returns a 1536-dim vector', async () => {
    const { embedText } = await import('@/lib/action-items/embeddings/openai');
    const v = await embedText('approve the contract');
    expect(v).toHaveLength(1536);
  });
  it('throws when OPENAI_API_KEY missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { embedText } = await import('@/lib/action-items/embeddings/openai');
    await expect(embedText('x')).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
```

- [ ] **Step 3: Implement.**

```typescript
// lib/action-items/embeddings/openai.ts
import 'server-only';
import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';
const DIMS = 1536;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set');
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

export async function embedText(text: string): Promise<number[]> {
  const c = client();
  const res = await c.embeddings.create({ model: MODEL, input: text, dimensions: DIMS });
  const vec = res.data[0]?.embedding;
  if (!vec || vec.length !== DIMS) throw new Error(`Embedding dim mismatch: got ${vec?.length}`);
  return vec;
}
```

Run; expect PASS.

- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json lib/action-items/embeddings/openai.ts lib/__tests__/action-items-embeddings.test.ts
git commit -m "feat(action-items): OpenAI embeddings client (1536-dim text-embedding-3-small)"
```

---

## Task 2: Embed-task endpoint + Plan 4 hook

**Files:**
- Create: `lib/action-items/embeddings/backfill.ts`
- Create: `app/api/action-items/embed/route.ts`
- Modify: `app/api/action-items/review/[extractionId]/route.ts` (fire-and-forget call after each accepted insert)

- [ ] **Step 1: Backfill helper.**

```typescript
// lib/action-items/embeddings/backfill.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { embedText } from './openai';
import { logger } from '@/lib/logger';

export async function embedTask(taskId: string): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, title, source').eq('id', taskId).maybeSingle();
  if (!task || task.source !== 'extraction') return;
  try {
    const vec = await embedText(task.title as string);
    await supabaseAdmin.from('tasks').update({ task_embedding: vec }).eq('id', taskId);
  } catch (err) {
    logger.warn({ err, taskId }, 'embedTask failed (non-fatal)');
  }
}
```

- [ ] **Step 2: Endpoint.**

```typescript
// app/api/action-items/embed/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { embedTask } from '@/lib/action-items/embeddings/backfill';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({ task_id: z.string().uuid() });

export async function POST(req: NextRequest) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  await embedTask(parsed.data.task_id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Wire from Plan 4's batch endpoint.**

In `app/api/action-items/review/[extractionId]/route.ts`, after each successful `tasks` insert (inside the loop), add a fire-and-forget:

```typescript
// Fire-and-forget; embedding failure must not block accept.
fetch(`${process.env.NEXTAUTH_URL ?? ''}/api/action-items/embed`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cookie': req.headers.get('cookie') ?? '' },
  body: JSON.stringify({ task_id: task.id }),
}).catch(() => undefined);
```

(If a stable internal-call helper exists, use it instead of `fetch(self)`. The fire-and-forget pattern is acceptable because failures are recovered by Plan 5's drift detector.)

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/embeddings/backfill.ts app/api/action-items/embed/route.ts app/api/action-items/review/[extractionId]/route.ts
git commit -m "feat(action-items): embed-on-accept hook + endpoint"
```

---

## Task 3: Supersession matcher (TDD)

**Files:**
- Create: `lib/action-items/matcher/supersession.ts`
- Create: `lib/__tests__/action-items-matcher.test.ts`

The score is `0.5 × cosine + 0.3 × Jaccard(noun_phrases) + 0.2 × verb_match`. Cosine relies on pgvector's `<=>` operator (cosine distance). Noun-phrase Jaccard is computed in JS over the candidate task titles.

- [ ] **Step 1: Failing test (noun extraction + score combination, no DB).**

```typescript
import { describe, it, expect } from 'vitest';
import { extractNounPhrases, scoreCombined } from '@/lib/action-items/matcher/supersession';

describe('extractNounPhrases', () => {
  it('extracts capitalized 1–3 word sequences excluding sentence-initial', () => {
    const phrases = extractNounPhrases('Issue notification of termination to InterEnergy and notify GPL Board');
    // Skipped: sentence-initial "Issue".
    expect(phrases).toContain('InterEnergy');
    expect(phrases).toContain('GPL Board');
    expect(phrases).not.toContain('Issue');
  });
  it('returns lowercased phrases for comparison', () => {
    const phrases = extractNounPhrases('Talk to InterEnergy');
    expect(phrases).toEqual(['interenergy']);
  });
});

describe('scoreCombined', () => {
  it('weights cosine 0.5, jaccard 0.3, verb match 0.2', () => {
    const r = scoreCombined({ cosine: 1, jaccard: 1, verbMatch: true });
    expect(r).toBeCloseTo(1.0);
  });
  it('verb mismatch gives 0 in that term', () => {
    const r = scoreCombined({ cosine: 1, jaccard: 0, verbMatch: false });
    expect(r).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/matcher/supersession.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';

export interface SupersessionCandidate {
  task_id: string;
  title: string;
  created_at: string;
  score: number;
}

export function extractNounPhrases(text: string): string[] {
  // Capitalized 1–3 word sequences. Drop sentence-initial first word.
  const words = text.split(/\s+/);
  const out: string[] = [];
  let buf: string[] = [];
  let firstSkipped = false;
  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[^A-Za-z'-]/g, '');
    const isCap = /^[A-Z]/.test(w);
    if (isCap) {
      if (!firstSkipped && i === 0) { firstSkipped = true; continue; }
      buf.push(w);
      if (buf.length === 3) { out.push(buf.join(' ').toLowerCase()); buf = []; }
    } else {
      if (buf.length > 0) { out.push(buf.join(' ').toLowerCase()); buf = []; }
    }
  }
  if (buf.length > 0) out.push(buf.join(' ').toLowerCase());
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersect = 0;
  for (const x of a) if (b.has(x)) intersect++;
  return intersect / (a.size + b.size - intersect);
}

export function scoreCombined({ cosine, jaccard: j, verbMatch }: { cosine: number; jaccard: number; verbMatch: boolean }): number {
  return 0.5 * cosine + 0.3 * j + 0.2 * (verbMatch ? 1 : 0);
}

export interface FindOpts {
  limit?: number;
  threshold?: number;       // default 0.75
  windowDays?: number;      // default 60
}

export async function findSupersessionCandidates(
  task: { id: string; owner_user_id: string; title: string; verb_category: string | null; task_embedding: number[] | null },
  opts: FindOpts = {},
): Promise<SupersessionCandidate[]> {
  const limit = opts.limit ?? 3;
  const threshold = opts.threshold ?? 0.75;
  const windowDays = opts.windowDays ?? 60;
  if (!task.task_embedding) return [];

  // Query candidates from same owner within the window. Use ivfflat <=> for cosine distance.
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  // pgvector helper: cosine distance via the <=> operator. supabase-js doesn't expose it
  // directly; pass an RPC or use the SQL string. v1 uses a raw SQL via supabase's query builder
  // approximation: we fetch a candidate set by metadata then score in JS.
  const { data: rows } = await supabaseAdmin
    .from('tasks')
    .select('id, title, verb_category, task_embedding, created_at')
    .eq('owner_user_id', task.owner_user_id)
    .neq('id', task.id)
    .in('status', ['new', 'active', 'blocked', 'awaiting_verification'])
    .gte('created_at', cutoff)
    .not('task_embedding', 'is', null)
    .limit(50);

  const ourPhrases = new Set(extractNounPhrases(task.title));
  const ourEmbed = task.task_embedding;

  const out: SupersessionCandidate[] = [];
  for (const r of rows ?? []) {
    const cand = r.task_embedding as unknown as number[] | null;
    if (!cand) continue;
    const cos = cosineSim(ourEmbed, cand);
    const j = jaccard(ourPhrases, new Set(extractNounPhrases(r.title as string)));
    const verbMatch = task.verb_category != null && task.verb_category === r.verb_category;
    const score = scoreCombined({ cosine: cos, jaccard: j, verbMatch });
    if (score >= threshold) {
      out.push({ task_id: r.id as string, title: r.title as string, created_at: r.created_at as string, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

- [ ] **Step 3: Wire SupersessionSuggestion.**

In `components/action-items/SupersessionSuggestion.tsx` (Plan 4 stub), the component already receives `candidates: SupersessionCandidate[]`. Plan 4's review page passes an empty array; this plan changes the page to call `findSupersessionCandidates` per item server-side and pass the result.

In Plan 4's `app/action-items/review/[extractionId]/page.tsx`, after `const reviewables = ...`, add:

```typescript
import { findSupersessionCandidates } from '@/lib/action-items/matcher/supersession';
// ...
const supersessionByIndex = new Map<number, SupersessionCandidate[]>();
for (const r of reviewables) {
  if (!r.item.owner_id) continue;
  // Items haven't been embedded yet (they're not in tasks). Skip real-time matching for now.
  // Real-time matching kicks in when the user clicks 'preview' (deferred to Plan 5.1).
  supersessionByIndex.set(r.index, []);
}
```

The simplest v1 wiring: skip real-time matching at extraction-review time (items haven't been embedded yet) and rely on the **drift detector** (Task 5) to flag missed supersessions weekly. Real-time matching becomes meaningful once embeddings are stored — i.e., after the item is accepted. Surface this trade-off in autonomous decisions.

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/matcher/supersession.ts lib/__tests__/action-items-matcher.test.ts
git commit -m "feat(action-items): supersession matcher (cosine + jaccard + verb match)"
```

---

## Task 4: "Confirm supersession" link endpoint

**Files:**
- Create: `app/api/action-items/[id]/supersedes/route.ts`

When a reviewer clicks "Link as supersession" on a candidate, this endpoint stamps `tasks.supersedes_id` on the new task and flips the prior task's status to `'superseded'`.

- [ ] **Step 1: Implement.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

export const dynamic = 'force-dynamic';

const BodyZ = z.object({ supersedes_id: z.string().uuid() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const priorId = parsed.data.supersedes_id;

  const now = new Date().toISOString();
  const { error: e1 } = await supabaseAdmin.from('tasks')
    .update({ supersedes_id: priorId, updated_at: now }).eq('id', id);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const { error: e2 } = await supabaseAdmin.from('tasks')
    .update({ status: 'superseded', updated_at: now }).eq('id', priorId);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });

  await logEvent({ taskId: id, eventType: 'supersedes', actorId: a.session.user.id, payload: { prior_id: priorId } });
  await logEvent({ taskId: priorId, eventType: 'superseded_by', actorId: a.session.user.id, payload: { successor_id: id } });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit.**

```bash
git add app/api/action-items/[id]/supersedes/route.ts
git commit -m "feat(action-items): confirm-supersession endpoint (status='superseded' on prior)"
```

---

## Task 5: Drift detector (weekly cron)

**Files:**
- Create: `lib/action-items/matcher/drift.ts`
- Create: `app/api/action-items/drift/route.ts`
- Create: `components/action-items/DriftReportCard.tsx`
- Modify: `lib/action-items/digest.ts` (extend `DigestSummary` with `drift_count`)
- Modify: `vercel.json` (add Sunday cron)

The drift detector samples 10% of accepted items from the past 7 days, runs the matcher against each, and writes a small `drift_report` record. v1 surfaces it inline in the daily digest card on Mondays.

- [ ] **Step 1: Implement the detector.**

```typescript
// lib/action-items/matcher/drift.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { findSupersessionCandidates } from './supersession';

export interface DriftFinding {
  task_id: string;
  task_title: string;
  candidates: Array<{ task_id: string; title: string; score: number }>;
}

export async function runDriftDetector(): Promise<{ inspected: number; findings: DriftFinding[] }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from('tasks')
    .select('id, title, owner_user_id, verb_category, task_embedding, supersedes_id')
    .eq('source', 'extraction')
    .gte('created_at', since)
    .is('supersedes_id', null)
    .not('task_embedding', 'is', null)
    .limit(200);
  const sample = (recent ?? []).filter((_, i) => i % 10 === 0);   // 10% sample
  const findings: DriftFinding[] = [];
  for (const t of sample) {
    const cands = await findSupersessionCandidates({
      id: t.id as string,
      owner_user_id: t.owner_user_id as string,
      title: t.title as string,
      verb_category: t.verb_category as string | null,
      task_embedding: t.task_embedding as unknown as number[] | null,
    });
    if (cands.length > 0) {
      findings.push({
        task_id: t.id as string, task_title: t.title as string,
        candidates: cands.map(c => ({ task_id: c.task_id, title: c.title, score: c.score })),
      });
    }
  }
  return { inspected: sample.length, findings };
}
```

- [ ] **Step 2: Cron entry.**

```typescript
// app/api/action-items/drift/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { runDriftDetector } from '@/lib/action-items/matcher/drift';

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
  const result = await runDriftDetector();
  return NextResponse.json(result);
}
```

- [ ] **Step 3: Drift report card.**

```tsx
// components/action-items/DriftReportCard.tsx
import type { DriftFinding } from '@/lib/action-items/matcher/drift';
import Link from 'next/link';

export function DriftReportCard({ findings }: { findings: DriftFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="bg-navy-900 border border-gold-500/40 rounded-xl p-4">
      <h2 className="text-sm uppercase text-gold-500 mb-2">Drift report — possible supersessions</h2>
      <ul className="space-y-2 text-xs">
        {findings.map(f => (
          <li key={f.task_id} className="border-l-2 border-gold-500 pl-2">
            <Link href={`/tasks?focus=${f.task_id}`} className="underline">{f.task_title}</Link>
            <ul className="mt-1 space-y-0.5">
              {f.candidates.map(c => (
                <li key={c.task_id}>
                  may supersede{' '}
                  <Link href={`/tasks?focus=${c.task_id}`} className="underline">{c.title}</Link>
                  <span className="text-navy-600"> ({(c.score * 100).toFixed(0)}%)</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Daily digest extension.**

In `lib/action-items/digest.ts` (Plan 3), extend `DigestSummary` with `drift_findings: DriftFinding[]` (default `[]`). The Plan 3 cron does not call the drift detector itself; the meetings page can fetch and render the card on demand. v1 ships drift inspection as a separate user-triggered button on the meetings page (or weekly cron output viewable via the cron endpoint).

```typescript
// lib/action-items/digest.ts (modify)
import type { DriftFinding } from './matcher/drift';
// ...
export interface DigestSummary {
  /* existing fields */
  drift_findings?: DriftFinding[];
}
```

The meetings page (Plan 3) renders `<DriftReportCard findings={summary.drift_findings ?? []} />` underneath the existing `DailyDigestCard`. Wire by importing both components in the meetings page and passing the same summary.

- [ ] **Step 5: Cron schedule.**

In `vercel.json`, append:

```json
{ "path": "/api/action-items/drift", "schedule": "0 2 * * 0" }
```

- [ ] **Step 6: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/matcher/drift.ts app/api/action-items/drift/route.ts components/action-items/DriftReportCard.tsx lib/action-items/digest.ts vercel.json
git commit -m "feat(action-items): weekly drift detector + DriftReportCard"
```

---

## Task 6: Trust tracker (TDD)

**Files:**
- Create: `lib/action-items/trust/tracker.ts`
- Create: `lib/__tests__/action-items-trust.test.ts`

The function returns `{ activated, ... }` based on the rolling 20-meeting window. Activation requires:

- ≥8 meetings reviewed in the window
- ≥95% items accepted-unedited (`items_accepted - items_edited >= 0.95 * items_extracted`)
- Zero `attribution_error_flagged` events in the window
- ≥30 calendar days since the first reviewed meeting in the window
- The env flag `EARNED_TRUST_ENABLED=true`

The function is consumed by Plan 4's review page to populate the auto-accepted bucket — but only when `activated=true`. v1 ships with `EARNED_TRUST_ENABLED` unset, so the bucket stays empty.

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => {
  const mock = {
    extractions: [] as Array<{ meeting_type: string; modality: string; review_status: string;
      items_extracted: number; items_accepted: number; items_edited: number;
      reviewed_at: string }>,
    flags: [] as Array<{ task_id: string; occurred_at: string }>,
  };
  return {
    supabaseAdmin: {
      from(table: string) {
        return {
          select() { return this; }, eq() { return this; }, in() { return this; },
          gte() { return this; }, order() { return this; }, limit() { return this; },
          then(resolve: (v: { data: unknown[]; error: null }) => void) {
            if (table === 'action_item_extractions') resolve({ data: mock.extractions, error: null });
            else if (table === 'action_item_events') resolve({ data: mock.flags, error: null });
            else resolve({ data: [], error: null });
          },
        };
      },
    },
    __mock: mock,
  };
});

beforeEach(() => { process.env.EARNED_TRUST_ENABLED = 'true'; });

describe('evaluateTrust', () => {
  it('not activated when fewer than 8 meetings reviewed', async () => {
    const { evaluateTrust } = await import('@/lib/action-items/trust/tracker');
    const r = await evaluateTrust('internal', 'virtual');
    expect(r.activated).toBe(false);
    expect(r.reason).toMatch(/8 meetings/);
  });
  // ... additional tests for the other criteria
});
```

(Mock-shape note: the supabase-js fluent API is awkward to mock; the agent may simplify by exposing a `getCounters()` and `getAttributionFlags()` pair from `tracker.ts` and mocking only those. Tests will exercise the pure pieces.)

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/trust/tracker.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';

export interface TrustResult {
  activated: boolean;
  meeting_type: 'internal' | 'agency' | 'external';
  modality: 'virtual' | 'in_person' | 'mixed';
  meetings_reviewed: number;
  accepted_unedited_pct: number;
  attribution_errors_in_window: number;
  earliest_review: string | null;
  reason: string;
}

const WINDOW_SIZE = 20;

export async function evaluateTrust(
  meetingType: TrustResult['meeting_type'],
  modality: TrustResult['modality'],
): Promise<TrustResult> {
  const flagOn = process.env.EARNED_TRUST_ENABLED === 'true';

  const { data: ex } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, meeting_date, review_status, items_extracted, items_accepted, items_edited, reviewed_at')
    .eq('meeting_type', meetingType)
    .eq('modality', modality)
    .eq('review_status', 'complete')
    .order('reviewed_at', { ascending: false })
    .limit(WINDOW_SIZE);

  const window = ex ?? [];
  const meetings_reviewed = window.length;
  const totalExtracted = window.reduce((s, e) => s + (e.items_extracted as number), 0);
  const totalAccepted   = window.reduce((s, e) => s + (e.items_accepted as number), 0);
  const totalEdited     = window.reduce((s, e) => s + (e.items_edited as number), 0);
  const acceptedUnedited = totalAccepted - totalEdited;
  const acceptedUneditedPct = totalExtracted > 0 ? acceptedUnedited / totalExtracted : 0;

  const earliestReview = window.length > 0 ? (window[window.length - 1].reviewed_at as string) : null;

  let attributionErrors = 0;
  if (window.length > 0) {
    const earliest = earliestReview ?? new Date().toISOString();
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('id')
      .eq('event_type', 'attribution_error_flagged')
      .gte('occurred_at', earliest);
    attributionErrors = events?.length ?? 0;
  }

  let reason = '';
  let activated = true;
  if (!flagOn) { activated = false; reason = 'EARNED_TRUST_ENABLED not set'; }
  else if (meetings_reviewed < 8) { activated = false; reason = `Need 8 meetings, have ${meetings_reviewed}`; }
  else if (acceptedUneditedPct < 0.95) { activated = false; reason = `accepted-unedited ${(acceptedUneditedPct * 100).toFixed(1)}% < 95%`; }
  else if (attributionErrors > 0) { activated = false; reason = `attribution errors in window: ${attributionErrors}`; }
  else if (earliestReview) {
    const daysOpen = (Date.now() - new Date(earliestReview).getTime()) / (24 * 60 * 60 * 1000);
    if (daysOpen < 30) { activated = false; reason = `Window only ${daysOpen.toFixed(1)} days old (need 30)`; }
    else reason = 'all criteria met';
  } else {
    activated = false; reason = 'no reviews yet';
  }

  return {
    activated, meeting_type: meetingType, modality,
    meetings_reviewed,
    accepted_unedited_pct: acceptedUneditedPct,
    attribution_errors_in_window: attributionErrors,
    earliest_review: earliestReview,
    reason,
  };
}
```

- [ ] **Step 3: Wire into Plan 4 review page.**

In Plan 4's `app/action-items/review/[extractionId]/page.tsx`, after computing `meeting`, evaluate trust:

```typescript
import { evaluateTrust } from '@/lib/action-items/trust/tracker';
const trust = (meeting.detected_type && meeting.detected_modality)
  ? await evaluateTrust(meeting.detected_type, meeting.detected_modality)
  : { activated: false } as { activated: boolean };
```

When bucketing, items that pass the political-risk gate go to `quickScan` if `!trust.activated`, else to `autoAccepted` if also `confidence_overall >= 0.9`.

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/trust/tracker.ts lib/__tests__/action-items-trust.test.ts app/action-items/review/[extractionId]/page.tsx
git commit -m "feat(action-items): trust tracker (disabled by default; env-flag activated)"
```

---

## Task 7: Eval metrics (TDD)

**Files:**
- Create: `lib/action-items/eval/metrics.ts`
- Create: `lib/__tests__/action-items-eval-metrics.test.ts`

In v1, ground-truth labeling files don't exist yet, so eval metrics are computed directly from review-decision history:

- **Recall** = `items_accepted / items_extracted` (lower bound: items the extractor produced AND a reviewer kept).
- **Precision** = `(items_accepted - items_edited) / items_accepted` (items kept without edits — proxy for "extractor got it right").
- **Owner accuracy** = ratio of accepted items where the *resolved* owner was kept by the reviewer (computed from `action_item_events` where `event_type='accepted'` AND payload doesn't include `owner_user_id` in `fields_changed`).
- **Overconfidence rate** = ratio of items with `confidence_overall ≥ 0.9` that were rejected or had owner edited (precision proxy at high confidence).

All four are computed per `(meeting_type, modality)` tuple over the past N reviewed meetings (default 20).

- [ ] **Step 1: Failing test.**

```typescript
import { describe, it, expect } from 'vitest';
import { computeMetricsFromCounters } from '@/lib/action-items/eval/metrics';

describe('computeMetricsFromCounters', () => {
  it('recall = accepted / extracted', () => {
    const m = computeMetricsFromCounters({ extracted: 100, accepted: 95, edited: 10, rejected: 5, accepted_owner_kept: 90, hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80 });
    expect(m.recall).toBeCloseTo(0.95);
  });
  it('precision = (accepted - edited) / accepted', () => {
    const m = computeMetricsFromCounters({ extracted: 100, accepted: 95, edited: 10, rejected: 5, accepted_owner_kept: 90, hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80 });
    expect(m.precision).toBeCloseTo(85 / 95);
  });
  it('owner_accuracy = accepted_owner_kept / accepted', () => {
    const m = computeMetricsFromCounters({ extracted: 100, accepted: 95, edited: 10, rejected: 5, accepted_owner_kept: 90, hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80 });
    expect(m.owner_accuracy).toBeCloseTo(90 / 95);
  });
  it('overconfidence_rate = hi_conf_rejected_or_owner_edited / hi_conf_total', () => {
    const m = computeMetricsFromCounters({ extracted: 100, accepted: 95, edited: 10, rejected: 5, accepted_owner_kept: 90, hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80 });
    expect(m.overconfidence_rate).toBeCloseTo(2 / 80);
  });
  it('thresholds: 95/90/90/3%', () => {
    const m = computeMetricsFromCounters({ extracted: 100, accepted: 95, edited: 5, rejected: 5, accepted_owner_kept: 90, hi_conf_rejected_or_owner_edited: 2, hi_conf_total: 80 });
    expect(m.passes_thresholds).toBe(true);
  });
});
```

- [ ] **Step 2: Implement.**

```typescript
// lib/action-items/eval/metrics.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import type { MeetingType, Modality } from '@/lib/action-items/constants';

export interface CounterInput {
  extracted: number;
  accepted: number;
  edited: number;
  rejected: number;
  accepted_owner_kept: number;
  hi_conf_rejected_or_owner_edited: number;
  hi_conf_total: number;
}
export interface EvalMetrics extends CounterInput {
  recall: number;
  precision: number;
  owner_accuracy: number;
  overconfidence_rate: number;
  passes_thresholds: boolean;
}

const THRESHOLDS = { recall: 0.95, precision: 0.90, owner_accuracy: 0.90, overconfidence_rate: 0.03 };

export function computeMetricsFromCounters(c: CounterInput): EvalMetrics {
  const recall    = c.extracted > 0 ? c.accepted / c.extracted : 0;
  const precision = c.accepted > 0 ? (c.accepted - c.edited) / c.accepted : 0;
  const owner_accuracy = c.accepted > 0 ? c.accepted_owner_kept / c.accepted : 0;
  const overconfidence_rate = c.hi_conf_total > 0 ? c.hi_conf_rejected_or_owner_edited / c.hi_conf_total : 0;
  const passes_thresholds =
    recall >= THRESHOLDS.recall &&
    precision >= THRESHOLDS.precision &&
    owner_accuracy >= THRESHOLDS.owner_accuracy &&
    overconfidence_rate <= THRESHOLDS.overconfidence_rate;
  return { ...c, recall, precision, owner_accuracy, overconfidence_rate, passes_thresholds };
}

export async function computeEvalMetrics(
  meetingType: MeetingType, modality: Modality, windowSize = 20,
): Promise<EvalMetrics> {
  const { data: ex } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, items_extracted, items_accepted, items_edited, items_rejected')
    .eq('meeting_type', meetingType)
    .eq('modality', modality)
    .eq('review_status', 'complete')
    .order('reviewed_at', { ascending: false })
    .limit(windowSize);
  const window = ex ?? [];
  const ids = window.map(e => e.id as string);

  const counters: CounterInput = {
    extracted: window.reduce((s, e) => s + (e.items_extracted as number), 0),
    accepted:  window.reduce((s, e) => s + (e.items_accepted as number), 0),
    edited:    window.reduce((s, e) => s + (e.items_edited as number), 0),
    rejected:  window.reduce((s, e) => s + (e.items_rejected as number), 0),
    accepted_owner_kept: 0,
    hi_conf_rejected_or_owner_edited: 0,
    hi_conf_total: 0,
  };

  // accepted_owner_kept: from action_item_events of type 'accepted' / 'edited' with payload.fields_changed
  if (ids.length > 0) {
    const { data: tasks } = await supabaseAdmin
      .from('tasks')
      .select('id, extraction_id, confidence_overall')
      .in('extraction_id', ids);
    for (const t of tasks ?? []) {
      const conf = (t.confidence_overall as number | null) ?? 0;
      if (conf >= 0.9) counters.hi_conf_total++;
    }
    const taskIds = (tasks ?? []).map(t => t.id as string);
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('task_id, event_type, payload')
      .in('task_id', taskIds.length ? taskIds : ['00000000-0000-0000-0000-000000000000']);
    const editedOwners = new Set<string>();
    for (const e of (events ?? []) as Array<{ task_id: string; event_type: string; payload: { fields_changed?: string[] } }>) {
      if (e.event_type === 'edited' && (e.payload?.fields_changed ?? []).includes('owner_user_id')) {
        editedOwners.add(e.task_id);
      }
    }
    for (const t of tasks ?? []) {
      if (!editedOwners.has(t.id as string)) counters.accepted_owner_kept++;
      const conf = (t.confidence_overall as number | null) ?? 0;
      if (conf >= 0.9 && editedOwners.has(t.id as string)) counters.hi_conf_rejected_or_owner_edited++;
    }
  }
  return computeMetricsFromCounters(counters);
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/eval/metrics.ts lib/__tests__/action-items-eval-metrics.test.ts
git commit -m "feat(action-items): eval metrics (recall, precision, owner accuracy, overconfidence)"
```

---

## Task 8: Eval dashboard

**Files:**
- Create: `app/action-items/eval/page.tsx`
- Create: `components/action-items/EvalCard.tsx`

- [ ] **Step 1: Card.**

```tsx
// components/action-items/EvalCard.tsx
import type { EvalMetrics } from '@/lib/action-items/eval/metrics';

const FORMATS: Array<{ key: keyof EvalMetrics; label: string; threshold: number; comparator: '>=' | '<=' }> = [
  { key: 'recall',              label: 'Recall',              threshold: 0.95, comparator: '>=' },
  { key: 'precision',           label: 'Precision',           threshold: 0.90, comparator: '>=' },
  { key: 'owner_accuracy',      label: 'Owner accuracy',      threshold: 0.90, comparator: '>=' },
  { key: 'overconfidence_rate', label: 'Overconfidence rate', threshold: 0.03, comparator: '<=' },
];

export function EvalCard({ title, metrics }: { title: string; metrics: EvalMetrics }) {
  return (
    <div className="bg-navy-900 border border-navy-800 rounded-xl p-4">
      <h3 className="text-sm uppercase text-navy-600 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3">
        {FORMATS.map(f => {
          const v = metrics[f.key] as number;
          const ok = f.comparator === '>=' ? v >= f.threshold : v <= f.threshold;
          return (
            <div key={f.key} className="text-center">
              <div className={`text-lg font-semibold ${ok ? 'text-white' : 'text-red-500'}`}>
                {(v * 100).toFixed(1)}%
              </div>
              <div className="text-[10px] uppercase text-navy-600">
                {f.label} (target {f.comparator} {f.threshold * 100}%)
              </div>
            </div>
          );
        })}
      </div>
      <div className={`mt-3 text-xs ${metrics.passes_thresholds ? 'text-gold-500' : 'text-navy-600'}`}>
        {metrics.passes_thresholds ? '✓ all thresholds met — eligible for trust activation' : '✗ thresholds not met'}
      </div>
      <div className="mt-1 text-[10px] text-navy-600">
        n_extracted={metrics.extracted} n_accepted={metrics.accepted} n_edited={metrics.edited} n_rejected={metrics.rejected}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page.**

```tsx
// app/action-items/eval/page.tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { computeEvalMetrics } from '@/lib/action-items/eval/metrics';
import { evaluateTrust } from '@/lib/action-items/trust/tracker';
import { EvalCard } from '@/components/action-items/EvalCard';
import { MEETING_TYPES, MODALITIES } from '@/lib/action-items/constants';

export const dynamic = 'force-dynamic';

export default async function EvalPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'dg') redirect('/login');

  const tuples: Array<[typeof MEETING_TYPES[number], typeof MODALITIES[number]]> =
    MEETING_TYPES.flatMap(t => MODALITIES.map(m => [t, m] as [typeof MEETING_TYPES[number], typeof MODALITIES[number]]));

  const data = await Promise.all(tuples.map(async ([t, m]) => {
    const metrics = await computeEvalMetrics(t, m);
    const trust = await evaluateTrust(t, m);
    return { t, m, metrics, trust };
  }));

  // Show only tuples with actual data
  const withData = data.filter(d => d.metrics.extracted > 0);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="stat-number text-2xl">Action Items — eval dashboard</h1>
      <p className="text-sm text-navy-600">
        Per-(type, modality) metrics over the last 20 reviewed meetings. Trust activation requires
        ≥8 meetings, ≥95% accepted-unedited, zero attribution errors, and a 30-day window —
        AND the env flag <code>EARNED_TRUST_ENABLED=true</code>.
      </p>
      {withData.length === 0 && <div className="text-navy-600">No reviewed meetings yet.</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {withData.map(d => (
          <div key={`${d.t}-${d.m}`} className="space-y-2">
            <EvalCard title={`${d.t} · ${d.m}`} metrics={d.metrics} />
            <div className={`text-xs ${d.trust.activated ? 'text-gold-500' : 'text-navy-600'}`}>
              Trust: {d.trust.activated ? 'ACTIVE' : `inactive (${d.trust.reason})`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/action-items/eval/page.tsx components/action-items/EvalCard.tsx
git commit -m "feat(action-items): eval dashboard at /action-items/eval (DG-only)"
```

---

## Task 9: Stale-meeting auto-archive (daily cron)

**Files:**
- Create: `app/api/action-items/auto-archive/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Implement.**

```typescript
// app/api/action-items/auto-archive/route.ts
//
// Daily cron. Finds extractions older than 14 days with review_status='pending'
// and stamps 'skipped'. Mandatory and quick-scan items in those extractions are
// counted as rejected (telemetry only; nothing is auto-accepted).
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';

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

  const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: stale } = await supabaseAdmin
    .from('action_item_extractions')
    .select('id, items_extracted')
    .eq('review_status', 'pending')
    .lt('created_at', cutoff);

  let archived = 0;
  for (const r of stale ?? []) {
    const dropped = r.items_extracted as number;
    await supabaseAdmin
      .from('action_item_extractions')
      .update({
        review_status: 'skipped',
        items_rejected: dropped,    // telemetry: dropped items count as rejected
      })
      .eq('id', r.id);
    archived++;
  }
  return NextResponse.json({ archived });
}
```

- [ ] **Step 2: Cron schedule.**

In `vercel.json`, append:

```json
{ "path": "/api/action-items/auto-archive", "schedule": "0 3 * * *" }
```

- [ ] **Step 3: Commit.**

```bash
git add app/api/action-items/auto-archive/route.ts vercel.json
git commit -m "feat(action-items): stale-meeting auto-archive (14-day cutoff, drop not auto-accept)"
```

---

## Task 10: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Tests + type-check + build.**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

- [ ] **Step 2: Manual smoke.**

Pre-conditions: at least one extracted task in `tasks` (from Plan 4); `OPENAI_API_KEY` set.

1. Hit `/api/action-items/embed` with a `task_id` of an existing extraction-source task. Confirm `tasks.task_embedding` is populated.
2. Run `runDriftDetector` via `/api/action-items/drift` (as DG). Inspect the JSON for `findings`.
3. Visit `/action-items/eval` as DG. Tuples with reviewed data show metrics + trust status.
4. Manually create a stale extraction (set its `created_at` 15 days ago) and hit `/api/action-items/auto-archive`. Confirm `review_status='skipped'` and `items_rejected` matches `items_extracted`.
5. Confirm trust stays `inactive` because `EARNED_TRUST_ENABLED` is unset (v1 default).

---

## Self-review

**Spec coverage:**

- §9 supersession matcher (real-time + weekly drift, reviewer-confirmed) → Tasks 3, 4, 5. Real-time at extraction-review-time is deferred (items aren't embedded yet); drift detector covers post-acceptance.
- §11.6 / earned trust (8 meetings + ≥95% + zero attribution errors + 30-day window, never bypasses gate) → Task 6. Disabled by default (env flag).
- §13 eval rubric (recall / precision / owner / overconfidence at 95/90/90/3%) → Tasks 7–8.
- Stale-meeting auto-archive (14 days, drop not auto-accept) → Task 9.
- Status `'superseded'` (not `'cancelled'`) → Task 4.

**Not in this plan:**

- Real-time supersession matching at extraction-review-time. Items aren't embedded until after accept. v1 surfaces drift weekly; if real-time matching becomes important, embed the *raw extracted item* on extraction (not on accept) — that's a Plan 5.1 change.
- Anti-mocking for the trust tracker test — the supabase-js fluent API is fiddly. Tests for `tracker.ts` exercise the pure pieces; the route is e2e-only.
- Ground-truth labeled eval files (per spec §13). v1 substitutes review-decision history for ground truth. If you want true labels, add a `extraction_ground_truth` table later.

**Type consistency:**

- `SupersessionCandidate` shape consistent across matcher, drift detector, and `<SupersessionSuggestion>` slot.
- `EvalMetrics` shape consistent across `metrics.ts`, `EvalCard`, eval page.
- Trust tuple `(meeting_type, modality)` matches Plan 4's gate signatures.

---

## Decisions I made on your behalf

1. **Real-time supersession matching is deferred.** At extraction-review-time, items haven't been embedded yet (embedding happens on accept). Surfacing real-time candidates would require embedding the raw extracted item — extra cost, extra latency, extra complexity. v1 catches missed supersessions via the weekly drift detector; if a reviewer wants real-time hints, we can add an "embed-then-match" button in Plan 5.1.
2. **Embeddings are extraction-source only.** Manual tasks aren't embedded in v1. The matcher only finds extraction-vs-extraction overlaps. If someone manually adds a task that the next extraction would have superseded, the drift detector misses it. v1 trade-off.
3. **Trust env flag** `EARNED_TRUST_ENABLED=true` gates activation. v1 ships unset; activation is a manual ops step after the eval period concludes successfully. The env flag is the lowest-friction kill-switch — flip it back off at any time.
4. **Trust tuple is `(meeting_type, modality)`** only — agency is per-task per correction 2. The original spec had `(meeting_type, modality, agency_name)`; with multi-agency meetings the norm, agency makes no sense at the meeting level.
5. **Eval substitutes review-decision history for ground truth.** No labeled files yet. Recall is "items kept by reviewer / items extractor produced" — a lower bound (extractor recall vs ground truth would be lower). Precision is "items not edited" — a precision proxy. Documented inline so the user knows what these numbers mean.
6. **Drift detector samples 10%** of recent items. Spec §9 specifies 10%; v1 uses index-mod-10 (deterministic but not random). For small N (under 10), this samples zero. Surface this to the user — drift may need a manual trigger for low-volume weeks.
7. **Stale-meeting cutoff: 14 days** per the user's prompt. Mandatory + quick-scan items are dropped (counted as rejected). Auto-accepted items wouldn't exist (Plan 5 trust is disabled in v1), so nothing leaks through.
8. **`items_rejected` doubles as "auto-archived item count"** for telemetry. Eval distinguishes by `review_status` (`'skipped'` vs `'complete'`). If you want to separate active rejection from auto-archive in the metrics, add a `review_status='archived'` distinct from `'skipped'` later.
9. **Confirm-supersession endpoint sets prior task's status to `'superseded'`** (Plan 1 schema already allows it). The new task carries `supersedes_id`. No event log on the prior task except the `superseded_by` event — Plan 5 doesn't add a new event_type.
10. **OpenAI for embeddings** (vs. Anthropic). Anthropic doesn't offer embeddings; the AI Gateway proxies OpenAI. Direct OpenAI is the simplest path. If ZDR concerns block direct OpenAI, route via Vercel AI Gateway by setting `OPENAI_BASE_URL` to the gateway's OpenAI-compatible endpoint — single env-var change.
11. **Embedding the task title only** (not title + description). Titles are the canonical commitment sentence; descriptions are free-form and noisy. If recall suffers in practice, expand to `title + first 200 chars of description` — a one-line change in `embedTask`.
12. **Cron schedule choices**: drift Sunday 02:00 UTC (off-peak, before Monday morning), auto-archive 03:00 UTC daily (after the digest at 11:00 UTC of the previous day so the digest doesn't reflect just-archived rows).

---

## End of Plan 5
