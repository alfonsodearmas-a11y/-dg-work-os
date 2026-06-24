# Delayed Projects Oversight — Snapshot Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Treat every Delayed Projects upload as the authoritative snapshot of the delayed set: projects absent from a new upload transition to a soft `RESOLVED` state (kept for audit, dropped from active counts), and the cleared set is surfaced prominently on every upload.

**Architecture:** A pure, unit-tested reconciliation **planner** computes insert/update/resolve/reopen plans by matching incoming rows to existing rows on the numeric **View Project source id** (primary) with trimmed **Project Reference** (secondary). A thin **executor** applies the plan against Supabase using a failure-safe ordering (snapshot read → insert batch → upsert present rows → clear-absent **last**), backed by a new `upload_batches` audit table. Read queries gain a `status = 'DELAYED'` filter so active counts become truthful; a "Recently Cleared" view and a Weekly-Movement "cleared" pill surface what left the set.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (`supabaseAdmin` / `@supabase/supabase-js`), Tailwind v4, vitest, `xlsx`.

## Global Constraints

- **Stack is Supabase SQL migrations, NOT Prisma.** The spec says "Prisma migration"; this repo has no Prisma. Use a numbered SQL file in `supabase/migrations/`. (Verified: no `schema.prisma`, no `prisma` dep.)
- **`status` stays `text` + `CHECK`, NOT a native enum.** The column already exists as `status text DEFAULT 'DELAYED' NOT NULL`. Converting to a Postgres enum is an `ALTER COLUMN TYPE` (destructive per policy). A `CHECK (status IN ('DELAYED','RESOLVED'))` constraint is the additive, non-destructive equivalent and gives the same validation.
- **`SNAPSHOT_CLEAR_THRESHOLD = 0.35`** — named constant; guard trips when active>0 and absent fraction > 0.35 and the request is not a confirmed full export.
- **Never hard-delete a row.** Resolution is soft (status flip + timestamps).
- **Key on the numeric View Project source id; trimmed Project Reference is the secondary natural key. Never key on Project Title** (titles carry `_x000D_` CR artifacts + whitespace padding — verified in the fixture).
- **Keep the existing snapshot engine.** `delayed_project_snapshots` + `snapshotBeforeUpload()` back Weekly Movement deltas; do not remove them. `upload_batches` is added alongside as the reconciliation/audit backbone.
- **Scope:** Delayed Projects Oversight (`delayed_projects` table + `lib/delayed-projects/*`, `components/delayed-projects/*`, `app/api/delayed-projects/*`) plus surgical `status='DELAYED'` filters on the two cross-module readers of the same table. Do NOT touch auth, the PSIP `projects` table, or `app/api/projects/delayed*` (that widget reads PSIP `projects`, a different table). Superadmin `alfonso.dearmas@mpua.gov.gy` is inviolable.
- **Migration apply path:** Apply via Supabase MCP per standing policy. NOTE: the MCP is not exposed as a tool in the current session and there is no Supabase pg connection string in env (only `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). The MCP must be reconnected before the apply step (Task 2). Migration is additive (new nullable columns, new table, new CHECK + indexes) — no DROP/RENAME/TYPE-change/backfill, so no extra approval gate is triggered.

---

## Confirmed Diagnosis (from code, not assumption)

- `app/api/delayed-projects/upload/route.ts:77` — upsert keys `onConflict: 'project_reference'`. The numeric **View Project** id is *discarded* by `upload-parser.ts:52` (`SKIP_PATTERNS: [/^view( project)?$/]`).
- `route.ts:116-123` computes `not_in_upload` (the dropped set) but **only returns it for display** — no row ever changes status. → projects can enter the delayed set but never leave.
- `lib/delayed-projects/queries.ts` — `getProjects` (board) and `getSummary` (Total Delayed / Critical / Longest Overdue cards) query `delayed_projects` with **no `status` filter** → they count every row ever uploaded (the "45").
- Fixture `tests/fixtures/oversight-project-list-2026.xlsx` (27 rows): "View Project" is a plain numeric cell (e.g. `30068`), 100% present & unique; `Project Reference` is unique (trimmed), its trailing number == the View id; ≥1 title contains `_x000D_`/`\r\n`.

---

## File Structure

**Create:**
- `supabase/migrations/130_delayed_projects_reconciliation.sql` — additive schema: `delayed_projects` columns (`source_id bigint`, `resolved_at timestamptz`, `reopened_at timestamptz`, `last_seen_batch_id uuid`, `resolved_by_batch_id uuid`), `status` CHECK constraint, indexes; new `upload_batches` table; FKs.
- `lib/delayed-projects/reconcile.ts` — pure `planReconciliation()` + the executor `reconcileUpload()` + `SNAPSHOT_CLEAR_THRESHOLD`.
- `lib/delayed-projects/__tests__/reconcile.test.ts` — unit tests for the pure planner.

**Modify:**
- `lib/delayed-projects/upload-parser.ts` — capture `source_id` (map "View Project" → numeric id) on `ParsedDelayedProject`.
- `lib/delayed-projects/__tests__/upload-parser.test.ts` — update the "skips View Project" assertions to "captures View Project as source_id".
- `lib/delayed-projects/types.ts` — `status: 'DELAYED' | 'RESOLVED'`; add `source_id`/`resolved_at`/`reopened_at`/batch fk fields to `DelayedProject`; add `UploadBatch`, extend `UploadResult` (needsConfirmation + cleared/reopened + counts), add `cleared`/`reopened` to `WeeklyMovement`, add `ClearedProjectRef`.
- `app/api/delayed-projects/upload/route.ts` — call `reconcileUpload()`; pass `fileName`, `confirmFullExport`; return `needsConfirmation` (HTTP 409-style payload) or the full `UploadResult`.
- `lib/delayed-projects/queries.ts` — `getProjects` accepts `status` filter (default `'DELAYED'`) + returns cleared metadata when `RESOLVED`; `getSummary` filters `status='DELAYED'`; Weekly Movement gains `cleared`/`reopened` from the latest batch.
- `app/api/delayed-projects/route.ts` — accept `status` query param (`DELAYED` default | `RESOLVED`).
- `app/api/intel/summary/route.ts:82` — add `.eq('status','DELAYED')` (cross-module correctness).
- `lib/today/signals.ts:117` — add `.eq('status','DELAYED')` on the stalled backfill.
- `components/delayed-projects/UploadModal.tsx` — handle `needsConfirmation` (confirm dialog → re-POST `confirmFullExport`); relabel result to "Recently Cleared / No Longer Delayed" with resolved/reopened counts + list.
- `components/delayed-projects/WeeklyMovementSummary.tsx` — add a `cleared` pill (and `reopened` when > 0).
- `components/delayed-projects/ProjectRegistryTab.tsx` — add an "Active (Delayed)" | "Recently Cleared" view toggle; pass `status` to the list fetch; render cleared columns.
- `components/delayed-projects/RegistryTable.tsx` — muted row + "Cleared" badge for `status==='RESOLVED'`; cleared-date + cleared-by-upload columns in the cleared view.

---

## Schema Diff (proposed — for approval before writing the migration)

```sql
-- supabase/migrations/130_delayed_projects_reconciliation.sql
-- Additive only: new nullable columns, new table, new CHECK + indexes. No DROP/RENAME/TYPE-change/backfill.

-- 1. upload_batches: the audit backbone (one row per upload).
CREATE TABLE IF NOT EXISTS upload_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name      text,
  uploaded_at    timestamptz NOT NULL DEFAULT now(),
  uploaded_by    text,
  row_count      integer NOT NULL DEFAULT 0,
  new_count      integer NOT NULL DEFAULT 0,
  updated_count  integer NOT NULL DEFAULT 0,
  resolved_count integer NOT NULL DEFAULT 0,
  reopened_count integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE upload_batches ENABLE ROW LEVEL SECURITY;
-- NO public SELECT policy: uploader emails + filenames must not be exposed to every role.
-- All reads are server-side via service_role (bypasses RLS). There is no client-side reader of
-- this table — the cleared view / analytics fetch batch fields through API routes. With RLS on and
-- no SELECT policy, anon/authenticated cannot read it; service_role still can.
CREATE POLICY ub_service_all ON upload_batches FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE INDEX IF NOT EXISTS idx_ub_uploaded_at ON upload_batches(uploaded_at DESC);

-- 2. delayed_projects: reconciliation columns (all nullable → existing rows unaffected;
--    status already DEFAULT 'DELAYED' so existing rows classify correctly with no backfill).
ALTER TABLE delayed_projects
  ADD COLUMN IF NOT EXISTS source_id           bigint,
  ADD COLUMN IF NOT EXISTS resolved_at         timestamptz,
  ADD COLUMN IF NOT EXISTS reopened_at         timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_batch_id  uuid REFERENCES upload_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_by_batch_id uuid REFERENCES upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dp_source_id ON delayed_projects(source_id);
-- status already has idx_dp_status from migration 074.

-- 3. status validation: text + CHECK (non-destructive; all existing rows are 'DELAYED').
--    NOT VALID first, then VALIDATE — avoids a full-table lock and is safe given current data.
ALTER TABLE delayed_projects
  ADD CONSTRAINT delayed_projects_status_check CHECK (status IN ('DELAYED','RESOLVED')) NOT VALID;
ALTER TABLE delayed_projects VALIDATE CONSTRAINT delayed_projects_status_check;
```

---

## Reconciliation Logic (the planner contract)

```ts
// lib/delayed-projects/reconcile.ts
export const SNAPSHOT_CLEAR_THRESHOLD = 0.35;

export interface ExistingRow {
  id: string; source_id: number | null; project_reference: string;
  status: 'DELAYED' | 'RESOLVED'; completion_percent: number;
  project_name: string; sub_agency: string;
}
export interface ReconcilePlan {
  guardTripped: boolean;
  activeDelayed: number; absentCount: number; absentFraction: number;
  toInsert: ParsedDelayedProject[];                 // no existing match
  toUpdate: { existing: ExistingRow; incoming: ParsedDelayedProject; reopened: boolean }[];
  toResolveIds: string[];                            // DELAYED, absent from upload → RESOLVED
  counts: { newCount: number; updatedCount: number; resolvedCount: number; reopenedCount: number };
}

// Match: existing row is "present in upload" iff
//   source_id ∈ incoming source_ids  OR  trimmed project_reference ∈ incoming refs.
// Per incoming row: find existing by source_id first, else by trimmed ref → update; else insert.
// Guard: activeDelayed>0 && absentFraction > threshold && !confirmFullExport → guardTripped (NO mutation).
export function planReconciliation(
  existing: ExistingRow[], incoming: ParsedDelayedProject[], confirmFullExport: boolean,
): ReconcilePlan
```

**Executor `reconcileUpload(rows, fileName, uploadedBy, confirmFullExport)` ordering (failure-safe; honors the "single transaction" *intent* without a Supabase pg transaction — none is available, see Global Constraints). A guard-tripped request must be FULLY INERT — zero writes, including no snapshot:**
1. Read existing `delayed_projects` (`id, source_id, project_reference, status, completion_percent, project_name, sub_agency, contract_value, created_at`) — one consistent read. **Reads ALL statuses** (must see `RESOLVED` rows to detect reopens — do NOT filter here).
2. `planReconciliation(...)`. **Evaluate the guard now.** If `guardTripped` → `return { needsConfirmation: true, activeDelayed, absentCount, absentFraction, threshold }` having **written nothing** (no snapshot, no batch, no upsert). This is the fix: `snapshotBeforeUpload()` is itself a write and must not run on a tripped/confirm-pending request, or the confirm re-POST double-snapshots the same logical upload and corrupts Weekly Movement.
3. *(Guard passed from here on.)* `snapshotBeforeUpload()` — snapshots the **`status='DELAYED'`** set only (see Weekly Movement Coherence). Runs exactly once per committed upload.
4. Insert `upload_batches` row (get `batch.id`).
5. Apply present rows with **chunk-plus-one-by-one fallback**: `toInsert` (status `DELAYED`, `source_id`, `last_seen_batch_id=batch.id`) and `toUpdate` (set `status='DELAYED'`, `source_id`, `last_seen_batch_id=batch.id`; if `reopened` also `reopened_at=now()`; **do not touch** `resolved_at`). Use `onConflict: 'id'` for updates / `insert` for new.
6. **Last:** resolve absentees `toResolveIds` → `status='RESOLVED'`, `resolved_at=now()`, `resolved_by_batch_id=batch.id`, using the **same chunk-plus-one-by-one fallback** as step 5 (NOT a single unguarded `updateMany`).
7. Update `upload_batches` row with counts **tallied from operations that actually committed** (see below), and build the `cleared[]` list from rows that were actually resolved.
8. Return `UploadResult` incl. committed `new/updated/resolved/reopened` counts, `cleared[]` (resolved rows: source_id, ref, name, agency, completion, contract_value, resolved_at, created_at) and `reopened[]`.

**Audit integrity (counts from committed work, not the plan):** the executor accumulates `committedNew`, `committedUpdated`, `committedReopened`, `committedResolved`, and a `committedCleared[]` array as each chunk/row succeeds — on a chunk error it drops to one-by-one and counts only the rows that returned no error. The `upload_batches` counts and the returned `cleared[]` are written from these committed tallies, **never** copied from `plan.counts`. Consequence: a partial write can under-report, but a batch row can never assert a clear that did not happen. (`plan.counts` remains only for the pure planner's own unit tests.)

**Partial-completion signalling:** the executor also tracks the *planned* total for each write phase (`toInsert.length + toUpdate.length` for present rows, `toResolveIds.length` for resolves). If any committed total falls short of its planned total, set `result.partial = true` and include `applied`/`planned` totals (`{ applied: committedNew+committedUpdated+committedReopened+committedResolved, planned: toInsert.length+toUpdate.length+toResolveIds.length }`). The UI surfaces "N of M applied — re-upload to finish" (Task 7). A clean run leaves `partial = false`.

Ordering rationale: a crash anywhere before step 6 leaves every row `DELAYED` (the old bug persists for that run — no data loss); the clear step runs only after all present rows are safely written, and only ever clears rows whose resolve actually committed. The worst case is "nothing cleared this run", never "wrongly cleared". On reopen we set `reopened_at` and leave the prior `resolved_at` in place; counts/lists filter on `status` only, so a stale `resolved_at` on a now-DELAYED row is harmless. (Limitation: these are scalar timestamps — they hold only the **latest** clear and the **latest** reopen, not the full event history. See Self-Review.)

---

## Reader Inventory — every `delayed_projects` SELECT (proven exhaustive)

`grep -rn "delayed_projects" app/ lib/ components/` over `*.ts`/`*.tsx`. Non-query hits (type fields, render code consuming `data.delayed_projects`, the methodology doc string, test fixtures) are excluded; every actual `.from('delayed_projects')` site is classified below.

**Gets the `status='DELAYED'` filter (feeds a count / list / signal):**
- `lib/delayed-projects/queries.ts:100,102` — `getProjects` (parameterized: default `DELAYED`, `RESOLVED` for the cleared view). *(Task 5)*
- `lib/delayed-projects/queries.ts:189` — `getSummary`. *(Task 5)*
- `lib/delayed-projects/queries.ts:630` — **`getInterventionSummary` `total_projects` count** — was missed; without it, RESOLVED rows count as "unattended" on the Unattended-Projects KPI. *(Task 5, newly added)*
- `lib/delayed-projects/snapshot-engine.ts:14` — **`snapshotBeforeUpload`** — was missed; must snapshot only the DELAYED set so snapshots represent "the delayed set at upload time" (also the lynch-pin of the Weekly-Movement coherence fix). *(Task 5, newly added)*
- `app/api/intel/summary/route.ts:82` — per-agency delayed aggregate. *(Task 6)*
- `lib/today/signals.ts:117` — stalled backfill. *(Task 6)*

**Correctly NOT filtered (with reason):**
- `lib/delayed-projects/queries.ts:429` — `getProjectById` (single by id; the detail drawer **must** open RESOLVED rows for inspection).
- `lib/delayed-projects/queries.ts:496` — interventions `delayed_projects!inner(...)` join (name/agency lookup; an intervention on a now-cleared project must still render).
- `lib/delayed-projects/queries.ts:372` — `getWeeklyMovement` display-name lookup by id (reworked in Task 5 regardless).
- `lib/delayed-projects/queries.ts:650` — `getLastUploadDate` (switched to `upload_batches.uploaded_at` in Task 5; no status concern).
- `app/api/delayed-projects/upload/route.ts:32` — the executor's read-existing; **must include RESOLVED** to detect reopens (explicitly unfiltered).

**Inherit the filter transitively (no direct query — verified):**
- `lib/intel/get-agency-intel-data.ts:938` calls `getProjects(...)` → the whole Intel chain (`intel-report-view`, `pdf/intel-report-render`, `pdf/intel-brief-render`, `components/intel/bento/*`) consumes `data.delayed_projects` from that filtered result.
- `lib/today/signals.ts` `getStalledProjectIds` reads `delayed_project_snapshots` only — and snapshots become DELAYED-only — and its `getProjects(...)` call (line 105) inherits the filter.

## Weekly Movement Coherence — `exits` vs `cleared`

Because resolved projects now **stay** in the table as `RESOLVED` (not deleted), the old snapshot-diff `exits` would either sit at a permanent dead `0` or double-count against the new batch-based `cleared`. Resolution:

- **Retire `exits`** entirely — remove it from `WeeklyMovement`, from `getWeeklyMovement`, and from the UI. Batch-based `cleared` is the single, authoritative "left the delayed set" number.
- **`snapshotBeforeUpload` snapshots only `status='DELAYED'`.** Snapshots now mean "the delayed set as of the start of each upload."
- **One window = the latest upload.** `new`, `cleared`, `reopened` come from the **latest `upload_batches` row** (the upload that just ran). `progressed`/`stalled`/`regressed` are recomputed as **latest pre-upload snapshot vs live completion** of still-`DELAYED` projects (reusing `getLatestSnapshotMap()`), *not* a two-snapshot-date diff. Since `snapshotBeforeUpload` runs at the start of each upload (= prior state) and live = post-upload state, this diff describes exactly the same window as `new`/`cleared`/`reopened`. Same-day re-uploads stay coherent because we compare snapshot-vs-live, not date-vs-date.
- Panel anchor relabelled "Since last upload"; the snapshot cadence is one-per-upload, matching the upload cadence.

## Task 1: Parser captures the View Project source id

**Files:**
- Modify: `lib/delayed-projects/upload-parser.ts`
- Test: `lib/delayed-projects/__tests__/upload-parser.test.ts`

**Interfaces:**
- Produces: `ParsedDelayedProject.source_id: number | null`

- [ ] **Step 1: Update the failing test** — replace the "skips the View Project column" test in `upload-parser.test.ts` with:

```ts
  it('captures View Project as a numeric source_id', () => {
    expect(result.headerMapping['View Project']).toBe('source_id');
    expect(result.rows[0].source_id).toBe(30068);
    expect(result.rows.every((r) => typeof r.source_id === 'number')).toBe(true);
    expect(new Set(result.rows.map((r) => r.source_id)).size).toBe(result.rows.length); // unique
  });
```

- [ ] **Step 2: Run it, verify FAIL** — `npx vitest run lib/delayed-projects/__tests__/upload-parser.test.ts` → FAIL (source_id undefined / mapping null).

- [ ] **Step 3: Implement** in `upload-parser.ts`:
  - Remove the `SKIP_PATTERNS` entry for View Project; add to `COLUMN_MAP` **first**: `{ pattern: ['view project', 'view'], field: 'source_id' }` (keep it anchored — match exact "view project"/"view" only; the existing normalize strips punctuation). Safer: keep a dedicated exact check so "Overview"/"Preview" never match — map header to `source_id` only when `norm === 'view project' || norm === 'view'`.
  - Add `source_id: number | null` to `ParsedDelayedProject`.
  - In the row loop: `const sid = parseInt(String(mapped.source_id ?? '').trim(), 10); rows.push({ ..., source_id: Number.isNaN(sid) ? null : sid });`
  - Do NOT add `source_id` to `required`/`missingRequiredFields` (older files without the column must still import; reconciliation falls back to ref).

- [ ] **Step 4: Run tests, verify PASS** — `npx vitest run lib/delayed-projects/__tests__/upload-parser.test.ts` → PASS (incl. the existing 27-row/no-warnings tests).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(delayed): capture View Project numeric source_id in upload parser"`

---

## Task 2: Migration — additive reconciliation schema

**Files:**
- Create: `supabase/migrations/130_delayed_projects_reconciliation.sql` (content = Schema Diff above)

- [ ] **Step 1: Write the migration file** exactly as the Schema Diff section.
- [ ] **Step 2: Apply via Supabase MCP** (reconnect MCP first — not exposed this session). Apply statements in order: `upload_batches` (+RLS+policies+index) → `delayed_projects` ADD COLUMNs (+FKs) → `idx_dp_source_id` → status CHECK (NOT VALID then VALIDATE). Additive only — no confirmation gate triggered.
- [ ] **Step 3: Verify** — query `information_schema.columns` for the 5 new `delayed_projects` columns and `upload_batches` existence; confirm existing rows still read `status='DELAYED'`.
- [ ] **Step 4: Commit** — `git add supabase/migrations/130_delayed_projects_reconciliation.sql && git commit -m "feat(db): migration 130 — delayed-projects reconciliation schema (additive)"`

---

## Task 3: Pure reconciliation planner (TDD core)

**Files:**
- Create: `lib/delayed-projects/reconcile.ts` (planner + `SNAPSHOT_CLEAR_THRESHOLD` only in this task)
- Test: `lib/delayed-projects/__tests__/reconcile.test.ts`

**Interfaces:**
- Produces: `planReconciliation`, `SNAPSHOT_CLEAR_THRESHOLD`, `ExistingRow`, `ReconcilePlan` (signatures above).

- [ ] **Step 1: Write failing tests** covering the spec's required cases:

```ts
import { describe, it, expect } from 'vitest';
import { planReconciliation, SNAPSHOT_CLEAR_THRESHOLD } from '../reconcile';

const inc = (o: Partial<any> = {}) => ({ source_id: 1, project_reference: 'R1', project_name: 'P', sub_agency: 'GWI', completion_percent: 10, /* ...other ParsedDelayedProject fields */ ...o });
const ex = (o: Partial<any> = {}) => ({ id: 'u1', source_id: 1, project_reference: 'R1', status: 'DELAYED', completion_percent: 10, project_name: 'P', sub_agency: 'GWI', ...o });

describe('planReconciliation', () => {
  it('clears a DELAYED project absent from the upload', () => {
    const plan = planReconciliation([ex({ id: 'a', source_id: 9, project_reference: 'R9' })], [inc()], true);
    expect(plan.toResolveIds).toEqual(['a']);
    expect(plan.counts.resolvedCount).toBe(1);
    expect(plan.toInsert).toHaveLength(1);
  });
  it('matches existing rows that lack source_id by trimmed project_reference (migration bridge)', () => {
    const plan = planReconciliation([ex({ source_id: null, project_reference: 'R1   ' })], [inc({ project_reference: 'R1' })], true);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toResolveIds).toEqual([]);
  });
  it('matches on source_id even when the reference text differs', () => {
    const plan = planReconciliation([ex({ source_id: 1, project_reference: 'OLD' })], [inc({ source_id: 1, project_reference: 'NEW' })], true);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toResolveIds).toEqual([]);
  });
  it('reopens a RESOLVED project that reappears', () => {
    const plan = planReconciliation([ex({ status: 'RESOLVED' })], [inc()], true);
    expect(plan.toUpdate[0].reopened).toBe(true);
    expect(plan.counts.reopenedCount).toBe(1);
    expect(plan.counts.updatedCount).toBe(0);
  });
  it('trips the guard above threshold when not confirmed', () => {
    const existing = Array.from({ length: 10 }, (_, i) => ex({ id: `e${i}`, source_id: 100 + i, project_reference: `R${100 + i}` }));
    const plan = planReconciliation(existing, [inc({ source_id: 100, project_reference: 'R100' })], false); // 9/10 absent = 0.9 > 0.35
    expect(plan.guardTripped).toBe(true);
    expect(plan.toResolveIds).toEqual([]);  // no mutation when tripped
    expect(plan.absentFraction).toBeGreaterThan(SNAPSHOT_CLEAR_THRESHOLD);
  });
  it('does NOT trip when confirmFullExport=true', () => {
    const existing = Array.from({ length: 10 }, (_, i) => ex({ id: `e${i}`, source_id: 100 + i, project_reference: `R${100 + i}` }));
    const plan = planReconciliation(existing, [inc({ source_id: 100, project_reference: 'R100' })], true);
    expect(plan.guardTripped).toBe(false);
    expect(plan.toResolveIds.length).toBe(9);
  });
  it('ignores already-RESOLVED rows when computing the absent fraction', () => {
    const plan = planReconciliation([ex({ id: 'r', status: 'RESOLVED', source_id: 5, project_reference: 'R5' }), ex({ id: 'd', source_id: 6, project_reference: 'R6' })], [inc({ source_id: 6, project_reference: 'R6' })], false);
    expect(plan.activeDelayed).toBe(1);     // only the DELAYED one
    expect(plan.guardTripped).toBe(false);  // 0 absent
  });
});
```

- [ ] **Step 2: Run, verify FAIL** — `npx vitest run lib/delayed-projects/__tests__/reconcile.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement** `planReconciliation` (pure; build `bySourceId`/`byRef` maps over existing; classify each incoming as update[+reopened] or insert; absent = DELAYED rows present in neither incoming set; guard from absentFraction). Export `SNAPSHOT_CLEAR_THRESHOLD = 0.35`.
- [ ] **Step 4: Run, verify PASS** — `npx vitest run lib/delayed-projects/__tests__/reconcile.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(delayed): pure snapshot-reconciliation planner + tests"`

---

## Task 4: Executor + upload route (apply the plan)

**Files:**
- Modify: `lib/delayed-projects/reconcile.ts` (add `reconcileUpload()` executor)
- Modify: `lib/delayed-projects/types.ts` (`UploadBatch`, extend `UploadResult`, `ClearedProjectRef`)
- Modify: `app/api/delayed-projects/upload/route.ts`

**Interfaces:**
- Consumes: `planReconciliation` (Task 3), `snapshotBeforeUpload` (existing).
- Produces: `reconcileUpload(rows, { fileName, uploadedBy, confirmFullExport }) → UploadResult | { needsConfirmation: true, ... }`.

- [ ] **Step 1: Types** — in `types.ts`: `status: 'DELAYED' | 'RESOLVED'`; add `source_id/resolved_at/reopened_at/last_seen_batch_id/resolved_by_batch_id/created_at` to `DelayedProject`; add `ClearedProjectRef { source_id, project_reference, project_name, sub_agency, completion_percent, contract_value, resolved_at, created_at, resolved_by_file? }`; add `ClearedAnalytics { count: number; total_contract_value: number; avg_days_to_clear: number | null }`; extend `UploadResult` with committed `new_count/updated_count/resolved_count/reopened_count`, `cleared: ClearedProjectRef[]`, `reopened: {project_name; sub_agency}[]`, `cleared_analytics: ClearedAnalytics`, `partial: boolean`, optional `applied`/`planned` totals + `needsConfirmation`/`activeDelayed`/`absentCount`/`absentFraction`/`threshold`; add `UploadBatch`; on `WeeklyMovement` **remove `exits`** and **add `cleared: number` + `reopened: number`**.
- [ ] **Step 2: Executor** — implement `reconcileUpload()` with the corrected failure-safe ordering: **read existing (all statuses) → plan → evaluate guard → if tripped return `needsConfirmation` with ZERO writes (no snapshot) →** else `snapshotBeforeUpload()` (DELAYED-only) → insert `upload_batches` → apply present rows (chunk + one-by-one fallback) → **resolve absentees last (same chunk + one-by-one fallback, NOT a bare `updateMany`)** → write `upload_batches` counts + build `cleared[]` **from committed operations only** (accumulate `committedNew/Updated/Reopened/Resolved` + `committedCleared[]`; never copy `plan.counts`). Keep the batch-of-50 chunk size.
- [ ] **Step 3: Route** — `upload/route.ts`: read `{ rows, fileName?, confirmFullExport? }`; `requireRole(['superadmin'])` unchanged; call `reconcileUpload(rows, { fileName, uploadedBy: session.user.email, confirmFullExport })`; if result has `needsConfirmation`, return `NextResponse.json(result, { status: 409 })`; else return the `UploadResult`.
- [ ] **Step 4: Build check** — `npx tsc --noEmit` (or `npm run build` later in Task 8). Expected: clean.
- [ ] **Step 5: Commit** — `git commit -am "feat(delayed): reconcile executor + upload route (guard, clear, reopen, batch audit)"`

---

## Task 5: Queries — status filters (incl. the 2 missed sites) + cleared metadata/analytics + coherent movement

**Files:**
- Modify: `lib/delayed-projects/queries.ts`
- Modify: `lib/delayed-projects/snapshot-engine.ts`
- Modify: `app/api/delayed-projects/route.ts`

- [ ] **Step 1: `getProjects`** — add `status?: 'DELAYED' | 'RESOLVED'` to `RegistryFilters`; apply `q.eq('status', filters.status ?? 'DELAYED')` inside `applyFilters`. When `status==='RESOLVED'`: also select `resolved_at, resolved_by_batch_id, created_at` and join `upload_batches(file_name, uploaded_at)` so the cleared view shows cleared-date + source upload; default sort = `resolved_at desc`.
- [ ] **Step 2: `getSummary`** — add `.eq('status','DELAYED')` so Total Delayed / Critical / Longest Overdue / exposure reflect only active rows.
- [ ] **Step 3: `getInterventionSummary` (MISSED site `queries.ts:630`)** — add `.eq('status','DELAYED')` to the `total_projects` count so RESOLVED rows are not counted as unattended.
- [ ] **Step 4: `snapshotBeforeUpload` (MISSED site `snapshot-engine.ts:14`)** — add `.eq('status','DELAYED')` to the project fetch so snapshots capture only the delayed set. (No-op for status-agnostic callers; required for movement coherence.)
- [ ] **Step 5: `getLastUploadDate`** — re-source from `upload_batches`: `select('uploaded_at').order('uploaded_at', { ascending:false }).limit(1)` → return `uploaded_at`. (Authoritative upload record; avoids `updated_at` ambiguity now that resolves also bump `updated_at`.)
- [ ] **Step 6: `getWeeklyMovement` rework (retire `exits`, one window)** — remove `exits` from `WeeklyMovement` and computation. Source `new`/`cleared`/`reopened` from the **most recent `upload_batches` row** (`new_count`/`resolved_count`/`reopened_count`). Recompute `progressed`/`stalled`/`regressed` as **`getLatestSnapshotMap()` (pre-upload) vs live `completion_percent` of still-`DELAYED` projects** (delta > 1 → progressed, < -1 → regressed, else stalled), not a two-snapshot-date diff. Anchor label "Since last upload". `top_movers`/`top_stalls` derive from the same live-vs-snapshot deltas.
- [ ] **Step 7: Cleared analytics** — add `getClearedAnalytics(agencyFilter?, filters?) → { count, total_contract_value, avg_days_to_clear: number | null }`: select all `RESOLVED` rows (`contract_value, resolved_at, created_at`, scoped); `count` = rows, `total_contract_value` = Σ`contract_value`, `avg_days_to_clear` = mean of `(resolved_at − created_at)` in days. **First-seen = `delayed_projects.created_at`** (the row's first insert). If `resolved_at` or `created_at` is null on a row, exclude it from the average; if no row has both, return `avg_days_to_clear: null` (UI omits it — never invented). Expose via the summary route (or a `?analytics=cleared` branch) for the cleared view, and compute the per-batch version inline in the executor result for the upload summary.
- [ ] **Step 8: Route** — `app/api/delayed-projects/route.ts`: read `status` (`'RESOLVED'` if `sp.get('status')==='RESOLVED'`, else `'DELAYED'`); pass into `filters`.
- [ ] **Step 9: Verify** — `npx tsc --noEmit` clean; live check deferred to Task 8.
- [ ] **Step 10: Commit** — `git commit -am "feat(delayed): status-scoped queries (incl. intervention count + snapshot), cleared metadata/analytics, coherent movement (exits retired)"`

---

## Task 6: Cross-module correctness (surgical status filters)

**Files:**
- Modify: `app/api/intel/summary/route.ts:82`
- Modify: `lib/today/signals.ts:117`

- [ ] **Step 1** — `app/api/intel/summary/route.ts`: add `.eq('status','DELAYED')` to the `delayed_projects` select (per-agency delayed aggregates must exclude RESOLVED).
- [ ] **Step 2** — `lib/today/signals.ts`: add `.eq('status','DELAYED')` to the stalled-backfill query `q` (a stalled id now RESOLVED must not surface as an active delayed-project signal).
- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.
- [ ] **Step 4: Commit** — `git commit -am "fix(intel,today): exclude RESOLVED delayed projects from active counts/signals"`

---

## Task 7: UI — surface & highlight the cleared set

**Files:**
- Modify: `components/delayed-projects/UploadModal.tsx`
- Modify: `components/delayed-projects/WeeklyMovementSummary.tsx`
- Modify: `components/delayed-projects/ProjectRegistryTab.tsx`
- Modify: `components/delayed-projects/RegistryTable.tsx`

- [ ] **Step 1: UploadModal — confirmation flow** — on POST, if `res.status === 409` and body `needsConfirmation`, show an inline confirm panel: "This file lists {rowCount} projects but {absentCount} of {activeDelayed} currently-delayed projects ({pct}%) are not in it. If this is the complete current export, those will be marked cleared. Confirm full export?" with a "Yes — clear them" button that re-POSTs with `confirmFullExport: true`, and a "Cancel" that returns to review.
- [ ] **Step 2: UploadModal — result + analytics strip** — replace the amber "not in this upload" box with a prominent **"Recently Cleared / No Longer Delayed"** panel driven by `uploadResult.cleared` (agency badge, name, last completion %, cleared date); show committed `new_count / updated_count / resolved_count / reopened_count` in the success summary; show a reopened list when `reopened.length > 0`. When `uploadResult.partial`, show a **warning banner** at the top of the result: "{applied} of {planned} applied — re-upload to finish" (amber, `AlertTriangle`). Above the cleared list, render a 3-number **cleared-set analytics strip** from `uploadResult.cleared_analytics`: **count cleared**, **total contract value cleared** (`fmtCurrency(total_contract_value/100)`), **avg time-to-clear** (`avg_days_to_clear` days) — and **omit the avg tile entirely when `avg_days_to_clear === null`** (do not show a fabricated value).
- [ ] **Step 3: WeeklyMovementSummary — retire `exits`, add `cleared`/`reopened`** — **remove the existing `exits` Pill** (lines ~33-35). Add a `cleared` Pill (`MinusCircle`, amber) when `movement.cleared > 0` and a `reopened` Pill (`RotateCcw`, blue) when `movement.reopened > 0`, alongside progressed/stalled/regressed/new. Relabel the "Since …" anchor to "Since last upload".
- [ ] **Step 4: ProjectRegistryTab — view toggle + cleared analytics** — add an "Active (Delayed)" | "Recently Cleared" segmented toggle above the filters; store `view` in state; include `status=RESOLVED` in the fetch query when "Recently Cleared" (default sort `resolved_at desc`); keep agency/region/search filters working. In the cleared view, render the same 3-number analytics strip from `getClearedAnalytics` (count / total contract value cleared / avg time-to-clear, avg omitted when null), scoped to the active filters.
- [ ] **Step 5: RegistryTable — cleared treatment** — when `view==='cleared'` (or `p.status==='RESOLVED'`): render the row muted (`opacity-70`) with a "Cleared" badge, and surface **Cleared date** + **Cleared by** (upload file/date) columns; hide the "Log intervention" action for cleared rows.
- [ ] **Step 6: Verify** — `npm run build` clean; visual check deferred to Task 8.
- [ ] **Step 7: Commit** — `git commit -am "feat(delayed): cleared view, upload confirmation + cleared summary, movement cleared pill"`

---

## Task 8: Simplify pass, full verification, deploy

- [ ] **Step 1: Simplify/cleanup pass** — run `/simplify` (or manual DRY/altitude review) over the diff; reconcile duplicated count logic, dead `not_in_upload` references, and naming.
- [ ] **Step 2: Tests** — `npx vitest run` → all green (parser + reconcile + existing suites).
- [ ] **Step 3: Build** — `npm run build` → clean.
- [ ] **Step 4: Acceptance (live, against the real DB after migration)** — re-upload the current 24-row export:
  - First upload trips the guard (45→24 ≈ 47% > 35%) → confirmation prompt appears.
  - Confirm → Total Delayed reads the true active count; the dropped projects (incl. the two GPL "Substations & T-Lines" entries) appear under **Recently Cleared** with cleared date + source upload.
  - Re-upload a file re-adding a cleared project → it flips to DELAYED with `reopened_at` set; Weekly Movement shows a reopened/cleared bucket.
  - Confirm no rows hard-deleted (row count only grows).
- [ ] **Step 5: Commit & deploy** — final commit; deploy once build is clean (Vercel). Confirm prod loads `/projects/delayed` (WarRoomPage) with correct counts.

---

## Self-Review

- **Spec coverage:** status enum→CHECK (✓ Constraints), resolvedAt/reopenedAt/lastSeenBatchId/resolvedByBatchId (✓ Task 2 schema), UploadBatch w/ counts (✓ Task 2), key on source_id + ref secondary, never title (✓ Tasks 1/3), guard @0.35 (✓ Task 3), reconcile steps 1-5 (✓ Tasks 3/4), never hard-delete (✓ executor), additive migration applied via MCP (✓ Task 2 + caveat), Total Delayed truthful (✓ Task 5), Recently Cleared tab w/ required columns + sort/filter (✓ Tasks 5/7), upload summary surfaces cleared immediately (✓ Task 7), Weekly Movement cleared bucket (✓ Tasks 5/7), muted/badge treatment (✓ Task 7), tests for clear/reopen/guard (✓ Task 3). All five acceptance criteria → Task 8 Step 4.
- **Review fixes applied (this revision):**
  - **Executor ordering** — guard evaluated *before* any write; a tripped/confirm-pending request runs **no `snapshotBeforeUpload()`**, so the confirm re-POST cannot double-snapshot (✓ Reconciliation Logic, Task 4).
  - **Audit integrity** — resolve step uses the same chunk + one-by-one fallback as the upserts; `upload_batches` counts + returned `cleared[]` are tallied from **committed** operations, never `plan.counts` (✓ Reconciliation Logic, Task 4).
  - **Exhaustive reader set** — every `.from('delayed_projects')` classified; the originally-missed **`getInterventionSummary` count** and **`snapshotBeforeUpload`** now get the filter; non-filtered sites justified; transitive readers (Intel/PDF/bento via `getProjects`, Today via snapshots) verified (✓ Reader Inventory, Task 5).
  - **`exits` vs `cleared`** — `exits` retired; snapshots are DELAYED-only; `new`/`cleared`/`reopened` from the latest batch and `progressed`/`stalled`/`regressed` from latest-snapshot-vs-live → all one window (✓ Weekly Movement Coherence, Tasks 5/7).
  - **RLS** — no public `SELECT` policy on `upload_batches`; service_role-only, no client reader (✓ Schema Diff, Task 2).
  - **Cleared analytics** — count / total contract value cleared / avg time-to-clear (first-seen = `created_at`); avg **omitted, not invented**, when uncomputable (✓ Task 5 Step 7, Task 7 Steps 2/4).
- **Reopen history — honest limitation:** the scalar `resolved_at` + `reopened_at` model holds only the **latest** clear and the **latest** reopen, **not** the full clear/reopen history. A project cleared→reopened→cleared→reopened retains only the most recent of each timestamp. This is an accepted scope boundary for this pass (no events table); per-upload provenance is still reconstructable from `upload_batches` + `last_seen_batch_id`/`resolved_by_batch_id` and the per-day `delayed_project_snapshots`.
- **Deviations flagged for approval:** (1) Supabase SQL not Prisma; (2) `status` text+CHECK not native enum (avoids destructive ALTER TYPE); (3) keep snapshot engine, add `upload_batches` alongside; (4) no Supabase pg transaction available → failure-safe ordered executor instead (documented); (5) cross-module + intra-module status filters added for correctness (4 active-count sites, incl. 2 found in review); (6) migration-apply needs the Supabase MCP reconnected; (7) `exits` removed from Weekly Movement (superseded by batch `cleared`).
