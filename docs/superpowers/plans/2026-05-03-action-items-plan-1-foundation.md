# Action Items — Plan 1 (rev 2026-05-03b): Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (rev 2026-05-03b — read the changelog first; this plan is a partial rebuild after the module-relationship correction).

**Goal:** Land the schema, type system, visibility logic, and route scaffolding for the Action Items *pipeline* — which creates Tasks. End state: migration 102 (now corrected) is runnable and idempotent, the `tasks` table is widened with extraction provenance / verification flow / supersession / visibility columns, four pipeline-side tables are in place, the `canSeeTask` helper compiles and is unit-tested, the review-queue routes render auth-gated empty shells, and the sidebar carries a single Action Items link pointing at the review queue. Zero AI, zero Fireflies, zero new consumption surfaces — War Room is the consumption surface.

**Architecture:** A single SQL migration widens `users` and `tasks`, creates four pipeline-side tables, retargets the events log to `tasks`, and disables the existing `tasks` RLS policy in favor of app-layer enforcement (consistent with the rest of DGOS). A `lib/action-items/` directory holds enums, types, constants, and the `canSeeTask` visibility helper. Page shells under `app/action-items/review/*` use the existing AppShell layout and render an empty-state component until later plans wire features in. Visibility is enforced app-layer via a pure function tested independently.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + pgvector), Vitest, Tailwind v4, NextAuth v5.

---

## Context: what changed and why

This plan replaces the original Plan 1, which was committed on the `action-items-foundation` branch but **not yet applied to the live database** (the migration is manual-execution-only via Supabase Dashboard). The spec correction (rev 2026-05-03b) requires:

- Removing the `action_items` table from migration 102.
- Adding `ALTER TABLE tasks` columns + a status-enum widen to migration 102.
- Renaming `action_item_events.item_id` → `task_id` and retargeting its FK to `tasks(id)`.
- Disabling the existing `tasks` RLS policy from migration 022 (visibility moves to app-layer for this module's flows; mixing RLS with app-layer guards is a footgun).
- Deleting the unused new-module page shells (`app/action-items/page.tsx`, `mine`, `agency/[name]`, `[id]`, `new`) — War Room (`/tasks`) is the consumption surface.
- Rewriting `constants.ts` and `types.ts` to reflect the tasks-table extension instead of a parallel `action_items` table.
- Rewriting `visibility.ts` as `canSeeTask(user, task)`.
- Updating the module README.

### Rollback approach: edit migration 102 in place

The user's prompt offered two rollback paths: (a) follow-up migration that drops `action_items` and adds task columns, or (b) reset the branch to main and apply a corrected migration 102 fresh. **Neither is the cleanest option.** Migration 102 has not been executed against any database; it is a `.sql` file that the user runs by hand. Editing the file in place is strictly cleaner than (a) — no `action_items` ghost table is created and immediately dropped — and strictly cleaner than (b) — the constants / types / visibility helper / review-queue shells from the original Plan 1 are mostly correct and can be amended in place rather than discarded and rewritten.

This revised plan therefore:

- **Keeps the branch.** No `git reset`. The corrective work appears as new commits on top of the existing Plan 1 commits.
- **Edits migration 102 in place.** The commit history will show the edits, but the file the user pastes into Supabase Dashboard will be the corrected version.
- **Deletes the unused shells.** Five `app/action-items/*` shells are removed; the `EmptyShell` component stays (still used by review shells).
- **Rewrites three lib files.** `constants.ts` (small adjustments), `types.ts` (drop one row type, add task-extension type), `visibility.ts` (rename + rewrite to operate on Task).

If this plan is executed by an agent encountering it cold (without the prior commits in place), every "modify" task below devolves into a "create" task with the same final-state code — the steps describe end states, not deltas, so the plan is correct in either situation.

---

## Conventions for this plan

- **Migration execution:** Output the SQL file under `supabase/migrations/`. Do **not** auto-run. After commits land, the user executes via Supabase Dashboard. Each task that depends on the schema being live calls this out.
- **Tests live in** `lib/__tests__/`. Module under test: `lib/action-items/<file>.ts` → test at `lib/__tests__/action-items-<file>.test.ts`.
- **Commits:** small and frequent, one per logical step. Conventional-commit prefixes: `feat:`, `chore:`, `test:`, `refactor:`, `docs:`.
- **Type-checking gate:** every task that adds or changes TS code ends with `npx tsc --noEmit` passing before commit. Where called out, `npm run lint` also runs.
- **No premature features.** This plan adds *no* business logic, *no* data fetches, *no* UI components beyond review-queue empty shells.

---

## File map

**Modified (corrected from prior Plan 1):**

- `supabase/migrations/102_action_items_v1.sql` — full schema for v1: users widening + tasks widening + 4 pipeline-side tables + index set + RLS-disable on `tasks`.
- `supabase/migrations/102_action_items_v1.README.md` — execution + verification doc.
- `lib/action-items/constants.ts` — frozen enums; replace `ITEM_STATUSES` with `TASK_STATUSES`; keep visibility / agency / modality / verb-taxonomy / banned-phrases / safety / closure / event types.
- `lib/action-items/types.ts` — replace `ActionItemRow` with `TaskWithExtensions`; rename `item_id` → `task_id` on `ActionItemEventRow`; update Zod re-exports.
- `lib/action-items/visibility.ts` — rename `canSeeItem` → `canSeeTask`; operate on Task fields.
- `lib/action-items/README.md` — reflect the corrected module relationship.
- `lib/__tests__/action-items-constants.test.ts` — adjust assertions for the renamed enum.
- `lib/__tests__/action-items-visibility.test.ts` — adjust to `canSeeTask` signature.
- `components/layout/Sidebar.tsx` — add a single "Action Items" link pointing at `/action-items/review`.

**Deleted (these were created by the original Plan 1 and have no purpose under the corrected spec):**

- `app/action-items/page.tsx`
- `app/action-items/mine/page.tsx`
- `app/action-items/agency/[name]/page.tsx`
- `app/action-items/[id]/page.tsx`
- `app/action-items/new/page.tsx`

**Kept (no changes from prior Plan 1):**

- `app/action-items/review/page.tsx`
- `app/action-items/review/[extractionId]/page.tsx`
- `components/action-items/EmptyShell.tsx`

---

## Task 1: Migration 102 — pgvector + users widening

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql` (replace contents — see Tasks 1–5 collectively)

The migration is rebuilt from scratch in this plan. Each task adds a coherent block; Task 5 verifies the result.

- [ ] **Step 1: Reset the file to scaffold + pgvector enable.**

Overwrite `supabase/migrations/102_action_items_v1.sql` with:

```sql
-- ============================================================================
-- Migration 102: Action Items v1 — Foundation (rev 2026-05-03b)
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + tasks widening (extraction provenance,
-- verification flow, supersession, visibility) + 4 pipeline-side tables.
-- Disables the existing tasks RLS policy from migration 022 (visibility for
-- this module's flows is enforced app-layer, consistent with the rest of
-- DGOS — mixing RLS with app-layer guards is a footgun).
--
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated commitment is attributed to the meeting itself.
-- Computed at render time from tasks.source + supporting lookups.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 2: Append the users widening block.**

```sql
-- ----------------------------------------------------------------------------
-- Widen users
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, parl_sec, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';
```

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): rebuild migration 102 — pgvector + users widening (rev b)"
```

---

## Task 2: Migration 102 — `action_item_extractions` table

The extractions table is unchanged in shape from the original Plan 1; this task re-appends it after Task 1's reset.

- [ ] **Step 1: Append the table.**

```sql
-- ----------------------------------------------------------------------------
-- action_item_extractions — one row per (Fireflies meeting, prompt version)
-- Created BEFORE the tasks widen because tasks.extraction_id FKs to it.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_extractions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id              TEXT NOT NULL,
  meeting_title           TEXT,
  meeting_date            TIMESTAMPTZ,
  meeting_type            TEXT NOT NULL CHECK (meeting_type IN ('internal','agency','external')),
  modality                TEXT NOT NULL CHECK (modality IN ('virtual','in_person','mixed')),
  meeting_type_overridden BOOLEAN NOT NULL DEFAULT false,
  modality_overridden     BOOLEAN NOT NULL DEFAULT false,
  agency_name             TEXT CHECK (agency_name IN
                            ('GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
                             'MPUA-DG','MPUA-Minister','MPUA-PS') OR agency_name IS NULL),
  transcript_url          TEXT,
  transcript_hash         TEXT,
  prompt_version          TEXT NOT NULL,
  model                   TEXT NOT NULL,
  raw_response            JSONB NOT NULL,
  token_count_input       INTEGER,
  token_count_output      INTEGER,
  extraction_duration_ms  INTEGER,
  items_extracted         INTEGER NOT NULL DEFAULT 0,
  items_accepted          INTEGER NOT NULL DEFAULT 0,
  items_edited            INTEGER NOT NULL DEFAULT 0,
  items_rejected          INTEGER NOT NULL DEFAULT 0,
  items_added_manually    INTEGER NOT NULL DEFAULT 0,
  review_status           TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN
                            ('pending','in_review','complete','skipped','failed')),
  reviewed_by             UUID REFERENCES users(id),
  reviewed_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT extractions_meeting_prompt_unique UNIQUE (meeting_id, prompt_version)
);

CREATE INDEX IF NOT EXISTS idx_extractions_review_status
  ON action_item_extractions(review_status)
  WHERE review_status IN ('pending','in_review');
CREATE INDEX IF NOT EXISTS idx_extractions_meeting_date
  ON action_item_extractions(meeting_date DESC);
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): action_item_extractions table"
```

---

## Task 3: Migration 102 — widen `tasks` (replaces the dropped `action_items` table)

This is the load-bearing change in the corrected spec. The existing `tasks` table absorbs the columns the old `action_items` would have introduced, plus a status-enum widen for `awaiting_verification` and `superseded`. The existing RLS policy is dropped — visibility moves to app-layer.

- [ ] **Step 1: Append the tasks widening block.**

```sql
-- ----------------------------------------------------------------------------
-- Widen tasks: extraction provenance, verification flow, supersession,
-- visibility scope. The canonical commitment record is tasks; extraction
-- writes into tasks with source='extraction' and provenance fields set.
-- ----------------------------------------------------------------------------

-- Extraction provenance
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual','extraction'));
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extraction_id       UUID REFERENCES action_item_extractions(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS extraction_item_idx INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_meeting_id   TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_timestamp    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_quote        TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner_name_raw      TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS delegated_to_id     UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verb_category       TEXT
  CHECK (verb_category IN ('correspondence','decision','information',
                           'scheduling','project_update','analysis')
         OR verb_category IS NULL);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_trigger         TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_overall  NUMERIC(3,2);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS confidence_reasons  TEXT[];
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_embedding      VECTOR(1536);

-- Verification flow
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completion_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_by    UUID REFERENCES users(id);
-- completed_at already exists from migration 029 — do nothing.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_by     UUID REFERENCES users(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS verified_at     TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dispute_note    TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS disputed_at     TIMESTAMPTZ;

-- Supersession (self-FK)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS supersedes_id UUID REFERENCES tasks(id);

-- Visibility (default agency_normal; extraction sets dg_only for external meetings)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'agency_normal'
  CHECK (visibility_scope IN ('agency_normal','dg_only'));

-- Widen status enum
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('new','active','blocked','done',
                    'awaiting_verification','superseded'));

-- Source-conditional integrity: extraction tasks must carry full provenance.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS extraction_provenance_required;
ALTER TABLE tasks ADD CONSTRAINT extraction_provenance_required CHECK (
  source = 'manual' OR
  (extraction_id IS NOT NULL
   AND source_meeting_id IS NOT NULL
   AND extraction_item_idx IS NOT NULL
   AND confidence_overall IS NOT NULL)
);

-- Disable the migration-022 RLS policy in favor of app-layer enforcement.
-- Rationale: this module's verification + dispute + visibility flows already
-- live in app-layer code (canSeeTask helper + scoped queries). Mixing RLS
-- with app-layer guards is the project's standing footgun rule.
DROP POLICY IF EXISTS tasks_access ON tasks;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

-- Indexes for the new lifecycle and supersession workloads
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_open
  ON tasks(status, due_date)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_tasks_owner_status_open
  ON tasks(owner_user_id, status)
  WHERE status IN ('new','active','blocked','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_tasks_supersedes
  ON tasks(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_extraction
  ON tasks(extraction_id) WHERE extraction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_embedding
  ON tasks USING ivfflat (task_embedding vector_cosine_ops);

COMMENT ON COLUMN tasks.source IS
  'manual = created via Add Task; extraction = created from Fireflies pipeline.';
COMMENT ON COLUMN tasks.visibility_scope IS
  'agency_normal = standard role-based visibility; dg_only = DG sees only.';
COMMENT ON COLUMN tasks.delegated_to_id IS
  'Set when DG owns the task but staff executes. Delegate sees but cannot close.';
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): widen tasks — provenance, verification, supersession, visibility"
```

---

## Task 4: Migration 102 — events (FK to tasks), meetings_seen, failed_extractions

`action_item_events` now has `task_id` (renamed from `item_id`) referencing `tasks(id)`. The other two tables are unchanged in shape.

- [ ] **Step 1: Append the three tables.**

```sql
-- ----------------------------------------------------------------------------
-- action_item_events — append-only audit log for the pipeline + verification
-- flow, attached to the task. Coexists with task_activities (the human-action
-- log scoped to the existing Tasks UI) by design — different concerns.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
                  ('created','accepted','edited','rejected','status_change',
                   'dispute_raised','dispute_resolved','superseded_by','supersedes',
                   'attribution_error_flagged')),
  actor_id      UUID REFERENCES users(id),
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_task
  ON action_item_events(task_id, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- meetings_seen — every Fireflies meeting we observe (drives daily digest)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS meetings_seen (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_meeting_id  TEXT NOT NULL UNIQUE,
  meeting_title         TEXT,
  meeting_date          TIMESTAMPTZ,
  detected_type         TEXT CHECK (detected_type IN ('internal','agency','external')),
  detected_modality     TEXT CHECK (detected_modality IN ('virtual','in_person','mixed')),
  detected_agency_name  TEXT,
  attendee_emails       TEXT[],
  transcript_ready_at   TIMESTAMPTZ,
  pipeline_action       TEXT NOT NULL CHECK (pipeline_action IN
                          ('extracted','skipped_out_of_scope','queued','failed','manually_processed')),
  skip_reason           TEXT,
  extraction_id         UUID REFERENCES action_item_extractions(id),
  observed_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_seen_date
  ON meetings_seen(meeting_date DESC);
CREATE INDEX IF NOT EXISTS idx_meetings_seen_action
  ON meetings_seen(pipeline_action);

-- ----------------------------------------------------------------------------
-- failed_extractions — quarantine table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS failed_extractions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fireflies_meeting_id  TEXT NOT NULL,
  attempted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  failure_reason        TEXT NOT NULL CHECK (failure_reason IN
                          ('claude_error','malformed_json','transcript_unavailable',
                           'speaker_collapse_virtual','transcript_partial','quota_exceeded','other')),
  failure_detail        TEXT,
  retry_count           INTEGER NOT NULL DEFAULT 0,
  resolved_at           TIMESTAMPTZ,
  resolved_by           TEXT
);

CREATE INDEX IF NOT EXISTS idx_failed_extractions_unresolved
  ON failed_extractions(attempted_at DESC)
  WHERE resolved_at IS NULL;
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): events (FK→tasks), meetings_seen, failed_extractions"
```

---

## Task 5: Migration sanity + README

- [ ] **Step 1: Verify the migration file's structure.**

```bash
grep -nE "CREATE TABLE|ALTER TABLE|DROP|CREATE EXTENSION|CREATE INDEX" supabase/migrations/102_action_items_v1.sql
```

Expected: ordering is `CREATE EXTENSION` → `ALTER TABLE users` (×3) → `CREATE TABLE action_item_extractions` → `ALTER TABLE tasks` (×many) → `DROP POLICY tasks_access` → `ALTER TABLE tasks DISABLE ROW LEVEL SECURITY` → `CREATE TABLE action_item_events` → `CREATE TABLE meetings_seen` → `CREATE TABLE failed_extractions` → indexes interleaved.

Confirm: `tasks.extraction_id` reference appears AFTER `CREATE TABLE action_item_extractions` (FK target must exist). `action_item_events.task_id REFERENCES tasks(id)` is satisfied because `tasks` already exists pre-migration.

Confirm by negation: there is **no** `CREATE TABLE action_items` statement anywhere in the file. Run:

```bash
grep -n "CREATE TABLE action_items" supabase/migrations/102_action_items_v1.sql && echo "FOUND — bug" || echo "OK — no action_items table"
```

Expected: `OK — no action_items table`.

- [ ] **Step 2: Confirm the existing `users_agency_check` from migration 021 is still satisfied.**

The existing constraint requires `agency IS NULL` for roles `dg/minister/ps` and `agency IS NOT NULL` for `agency_admin/officer`. The new `is_agency_head` column does not interact with it. Append this comment to the migration file:

```sql
-- ----------------------------------------------------------------------------
-- Compatibility note: existing users_agency_check (migration 021) requires
-- agency IS NULL for dg/minister/ps. is_agency_head is independent —
-- Minister/PS may have is_agency_head=true with agency=NULL.
-- The existing tasks_status_check from migration 029 has been replaced above
-- with the widened set including awaiting_verification and superseded.
-- ----------------------------------------------------------------------------
```

- [ ] **Step 3: Update the README.**

Overwrite `supabase/migrations/102_action_items_v1.README.md`:

```markdown
# Migration 102 — Action Items v1 (rev 2026-05-03b)

## Summary

- Widens `users` (3 columns).
- Widens `tasks` (provenance, verification flow, supersession, visibility, status enum).
- Adds 4 pipeline-side tables: `action_item_extractions`, `action_item_events`, `meetings_seen`, `failed_extractions`.
- Disables the existing `tasks` RLS policy from migration 022 (visibility moves to app-layer for this module's flows).
- Enables pgvector.

There is **no** `action_items` table — the spec was corrected before any
database execution. The canonical commitment layer is the existing `tasks`
table widened in this migration.

## How to run

This migration is **not** auto-executed. Run via Supabase Dashboard → SQL
Editor against the project database.

1. Open https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `102_action_items_v1.sql`
4. Run

## Pre-flight

- pgvector: `CREATE EXTENSION IF NOT EXISTS vector` runs at the top. If not
  available, enable via Database → Extensions → search "vector" → Enable.
- The `tasks` RLS policy (`tasks_access`) is dropped by this migration.
  After execution, all reads / writes on `tasks` will be unrestricted at
  the database layer; app-layer guards in `lib/action-items/visibility.ts`
  and the existing `app/api/tasks/*` route handlers carry enforcement.

## Idempotency

`IF NOT EXISTS` on every `CREATE TABLE`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
and `CREATE INDEX IF NOT EXISTS`. The status-check rebuild uses
`DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT`. Safe to re-run.

## Verification

```sql
-- 4 pipeline tables
SELECT count(*) FROM information_schema.tables
WHERE table_name IN
  ('action_item_extractions','action_item_events','meetings_seen','failed_extractions');
-- expected: 4

-- users widened
SELECT column_name FROM information_schema.columns
WHERE table_name='users' AND column_name IN
  ('aliases','closure_mode','is_agency_head');
-- expected: 3 rows

-- tasks widened (sample of new columns)
SELECT column_name FROM information_schema.columns
WHERE table_name='tasks' AND column_name IN
  ('source','extraction_id','source_quote','completion_note','verified_by',
   'dispute_note','supersedes_id','visibility_scope','delegated_to_id',
   'task_embedding','confidence_overall');
-- expected: 11 rows

-- status enum widened
SELECT pg_get_constraintdef(oid)
FROM pg_constraint WHERE conname='tasks_status_check';
-- expected to include awaiting_verification and superseded

-- RLS disabled on tasks
SELECT relrowsecurity FROM pg_class WHERE relname='tasks';
-- expected: false
```
```

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql supabase/migrations/102_action_items_v1.README.md
git commit -m "docs(action-items): migration 102 README — rev b verification queries"
```

---

## Task 6: Delete the unused new-module page shells

The original Plan 1 created five shells under `app/action-items/{page,mine,agency/[name],[id],new}.tsx`. The corrected spec drops all five surfaces — War Room is the consumption surface. Delete them.

- [ ] **Step 1: Delete the files (and the empty directories they leave behind).**

```bash
rm -f app/action-items/page.tsx
rm -f app/action-items/mine/page.tsx
rm -f app/action-items/[id]/page.tsx
rm -f app/action-items/new/page.tsx
rm -rf app/action-items/agency
rmdir app/action-items/mine 2>/dev/null || true
rmdir app/action-items/new 2>/dev/null || true
# Note: app/action-items/[id] becomes empty too; remove the directory
rmdir 'app/action-items/[id]' 2>/dev/null || true
```

If the directories above don't exist (because this plan is being executed cold), the `rm -f` and `rmdir 2>/dev/null` calls are no-ops and the task continues.

- [ ] **Step 2: Confirm only `review/` remains under `app/action-items/`.**

```bash
ls -1 app/action-items/
```

Expected: a single entry, `review`. (Plus `review/[extractionId]/` and `review/page.tsx` inside it.)

- [ ] **Step 3: Type-check.**

```bash
npx tsc --noEmit
```

Expected: no errors. (`EmptyShell` is still imported by the review shells.)

- [ ] **Step 4: Commit.**

```bash
git add -A app/action-items
git commit -m "refactor(action-items): drop new-module page shells (War Room is the consumption surface)"
```

---

## Task 7: Constants module — adjust to the corrected schema

Most of the original Plan 1 constants module is correct as-is. The needed changes:

- Replace `ITEM_STATUSES` (the 7-value action_items enum) with `TASK_STATUSES` (the 6-value tasks enum *after* the migration-102 widen: `new`, `active`, `blocked`, `done`, `awaiting_verification`, `superseded`).
- Update the corresponding test.

Other constants (`AGENCIES`, `MEETING_TYPES`, `MODALITIES`, `REVIEW_STATUSES`, `PIPELINE_ACTIONS`, `VERB_CATEGORIES`, `APPROVED_VERBS`, `BANNED_PHRASES`, `SAFETY_KEYWORDS`, `CLOSURE_MODES`, `VISIBILITY_SCOPES`, `PRIORITIES`, `FAILURE_REASONS`, `EVENT_TYPES`) carry over unchanged.

- [ ] **Step 1: Apply the constants change.**

In `lib/action-items/constants.ts`, replace the `ITEM_STATUSES` block:

```typescript
export const TASK_STATUSES = [
  'new', 'active', 'blocked', 'done',
  'awaiting_verification', 'superseded',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
```

(The original Plan 1 had `ITEM_STATUSES` and `ItemStatus`; the file's `ITEM_STATUSES` export and its type alias are removed entirely.)

If the file does not yet exist (cold execution), create it with the full content from the original Plan 1 Task 6 step 3 — verbatim — but with `ITEM_STATUSES` replaced by the `TASK_STATUSES` block above. Do not export `ItemStatus`.

- [ ] **Step 2: Update the constants test.**

In `lib/__tests__/action-items-constants.test.ts`, replace the `ITEM_STATUSES` test with:

```typescript
  it('exports the 6 task statuses including awaiting_verification and superseded', () => {
    expect(TASK_STATUSES).toEqual([
      'new','active','blocked','done',
      'awaiting_verification','superseded',
    ]);
  });
```

…and update the import line at the top of the file: replace `ITEM_STATUSES,` with `TASK_STATUSES,`.

If the file does not yet exist, create the full test from the original Plan 1 Task 6 step 1, with the same substitution.

- [ ] **Step 3: Run the test.**

```bash
npx vitest run lib/__tests__/action-items-constants.test.ts
```

Expected: PASS, all assertions green.

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/constants.ts lib/__tests__/action-items-constants.test.ts
git commit -m "refactor(action-items): TASK_STATUSES (replaces ITEM_STATUSES; tasks-table aligned)"
```

---

## Task 8: Types module — drop `ActionItemRow`, add task-extension type

Replace the `ActionItemRow` interface with `TaskWithExtensions`, which describes the fields a Task row carries *after* migration 102. Rename `ActionItemEventRow.item_id` → `task_id`. Drop the `ItemStatus` import; use `TaskStatus`.

- [ ] **Step 1: Apply the types changes.**

Overwrite `lib/action-items/types.ts`:

```typescript
import { z } from 'zod';
import {
  AGENCIES, MEETING_TYPES, MODALITIES, TASK_STATUSES,
  REVIEW_STATUSES, PIPELINE_ACTIONS, VERB_CATEGORIES,
  CLOSURE_MODES, VISIBILITY_SCOPES, PRIORITIES,
  FAILURE_REASONS, EVENT_TYPES,
  type Agency, type MeetingType, type Modality, type TaskStatus,
  type ReviewStatus, type PipelineAction, type VerbCategory,
  type ClosureMode, type VisibilityScope, type Priority,
  type FailureReason, type EventType,
} from './constants';

// ============================================================================
// DB row types — mirror migration 102 + the existing tasks columns from
// migrations 022 / 029. The canonical commitment record is `tasks`; this
// project widens it. `ActionItemEventRow` and the others mirror new tables.
// ============================================================================

/**
 * The Task row as it exists AFTER migration 102 — i.e., the existing tasks
 * columns plus the extension columns added by this project.
 *
 * Note: `tasks.priority` is the existing low|medium|high|critical enum from
 * migration 029. Internal P-tier values (P0–P3) are mapped to this scale at
 * extraction time per spec §6.5.
 */
export interface TaskWithExtensions {
  // Existing tasks columns (migration 022 + 029)
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority | null;        // existing low|medium|high|critical, NULL allowed historically
  due_date: string | null;          // DATE
  agency: string | null;            // freeform; canonical enum used by extraction
  role: string | null;
  owner_user_id: string;
  assigned_by_user_id: string | null;
  source_meeting_id: string | null; // existed pre-migration as UUID; widened to TEXT below
  blocked_reason: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  // Migration 102 extension columns
  source: 'manual' | 'extraction';
  extraction_id: string | null;
  extraction_item_idx: number | null;
  source_timestamp: string | null;
  source_quote: string | null;
  owner_name_raw: string | null;
  delegated_to_id: string | null;
  verb_category: VerbCategory | null;
  due_trigger: string | null;
  confidence_overall: number | null;
  confidence_reasons: string[] | null;
  task_embedding: number[] | null;

  completion_note: string | null;
  completed_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;

  supersedes_id: string | null;
  visibility_scope: VisibilityScope;
}

/** Existing PRIORITIES note: import alias kept for downstream Plan 4 priority mapping. */
export type TaskPriority = Priority;

export interface ActionItemExtractionRow {
  id: string;
  meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  meeting_type: MeetingType;
  modality: Modality;
  meeting_type_overridden: boolean;
  modality_overridden: boolean;
  agency_name: Agency | null;
  transcript_url: string | null;
  transcript_hash: string | null;
  prompt_version: string;
  model: string;
  raw_response: unknown;
  token_count_input: number | null;
  token_count_output: number | null;
  extraction_duration_ms: number | null;
  items_extracted: number;
  items_accepted: number;
  items_edited: number;
  items_rejected: number;
  items_added_manually: number;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface ActionItemEventRow {
  id: string;
  task_id: string;                  // renamed from item_id (rev b)
  event_type: EventType;
  actor_id: string | null;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export interface MeetingsSeenRow {
  id: string;
  fireflies_meeting_id: string;
  meeting_title: string | null;
  meeting_date: string | null;
  detected_type: MeetingType | null;
  detected_modality: Modality | null;
  detected_agency_name: Agency | null;
  attendee_emails: string[] | null;
  transcript_ready_at: string | null;
  pipeline_action: PipelineAction;
  skip_reason: string | null;
  extraction_id: string | null;
  observed_at: string;
}

export interface FailedExtractionRow {
  id: string;
  fireflies_meeting_id: string;
  attempted_at: string;
  failure_reason: FailureReason;
  failure_detail: string | null;
  retry_count: number;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface UserStaffFields {
  id: string;
  email: string;
  name: string | null;
  role: 'dg' | 'minister' | 'ps' | 'parl_sec' | 'agency_admin' | 'officer';
  agency: string | null;
  aliases: string[];
  closure_mode: ClosureMode;
  is_agency_head: boolean;
  is_active: boolean;
}

// ============================================================================
// Zod schemas
// ============================================================================

export const AgencyZ          = z.enum(AGENCIES);
export const MeetingTypeZ     = z.enum(MEETING_TYPES);
export const ModalityZ        = z.enum(MODALITIES);
export const TaskStatusZ      = z.enum(TASK_STATUSES);
export const ReviewStatusZ    = z.enum(REVIEW_STATUSES);
export const PipelineActionZ  = z.enum(PIPELINE_ACTIONS);
export const VerbCategoryZ    = z.enum(VERB_CATEGORIES);
export const ClosureModeZ     = z.enum(CLOSURE_MODES);
export const VisibilityScopeZ = z.enum(VISIBILITY_SCOPES);
export const PriorityZ        = z.enum(PRIORITIES);
export const FailureReasonZ   = z.enum(FAILURE_REASONS);
export const EventTypeZ       = z.enum(EVENT_TYPES);

export type {
  Agency, MeetingType, Modality, TaskStatus, ReviewStatus,
  PipelineAction, VerbCategory, ClosureMode, VisibilityScope, Priority,
  FailureReason, EventType,
};
```

- [ ] **Step 2: Type-check.**

```bash
npx tsc --noEmit
```

Expected: no errors. If older Plan 1 code still imports `ActionItemRow` or `ItemStatus`, fix the imports in those files (none should exist outside the deleted shells, but `lib/__tests__/action-items-visibility.test.ts` and `lib/action-items/visibility.ts` will be rewritten in Task 9 below).

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/types.ts
git commit -m "refactor(action-items): TaskWithExtensions row type (replaces ActionItemRow)"
```

---

## Task 9: Visibility helper — rewrite as `canSeeTask`

The function semantics are unchanged (DG sees all; PS/parl_sec see all `agency_normal`; Minister sees all `agency_normal`; agency staff see by agency match or owner / delegate; inactive users see nothing; `dg_only` is DG only) — only the row shape changes. The agency comparison continues to be case-insensitive because `tasks.agency` is freeform.

**Files:**
- Modify: `lib/action-items/visibility.ts`
- Modify: `lib/__tests__/action-items-visibility.test.ts`

- [ ] **Step 1: Rewrite the test.**

Overwrite `lib/__tests__/action-items-visibility.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canSeeTask } from '@/lib/action-items/visibility';
import type { TaskWithExtensions, UserStaffFields } from '@/lib/action-items/types';

const baseTask: TaskWithExtensions = {
  id: 't1',
  title: 'Issue notification of termination to InterEnergy',
  description: null,
  status: 'new',
  priority: 'medium',
  due_date: null,
  agency: 'GPL',
  role: null,
  owner_user_id: 'u-kesh',
  assigned_by_user_id: null,
  source_meeting_id: 'm1',
  blocked_reason: null,
  completed_at: null,
  created_at: '2026-05-03T00:00:00Z',
  updated_at: '2026-05-03T00:00:00Z',
  source: 'extraction',
  extraction_id: 'e1',
  extraction_item_idx: 0,
  source_timestamp: '00:01:00',
  source_quote: 'q',
  owner_name_raw: 'Kesh',
  delegated_to_id: null,
  verb_category: 'correspondence',
  due_trigger: null,
  confidence_overall: 0.9,
  confidence_reasons: null,
  task_embedding: null,
  completion_note: null,
  completed_by: null,
  verified_by: null,
  verified_at: null,
  dispute_note: null,
  disputed_at: null,
  supersedes_id: null,
  visibility_scope: 'agency_normal',
};

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: 'x@example.com', name: 'X',
  role: 'officer', agency: null,
  aliases: [], closure_mode: 'self_close', is_agency_head: false,
  is_active: true, ...over,
});

describe('canSeeTask', () => {
  it('DG sees everything (agency_normal)', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg' }), baseTask)).toBe(true);
  });

  it('DG sees dg_only tasks', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(true);
  });

  it('PS sees agency_normal tasks in any agency', () => {
    expect(canSeeTask(u({ id: 'ps', role: 'ps' }), baseTask)).toBe(true);
  });

  it('parl_sec is treated as PS for visibility', () => {
    expect(canSeeTask(u({ id: 'p', role: 'parl_sec' }), baseTask)).toBe(true);
  });

  it('PS does NOT see dg_only tasks', () => {
    expect(canSeeTask(u({ id: 'ps', role: 'ps' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(false);
  });

  it('Minister sees agency_normal tasks', () => {
    expect(canSeeTask(u({ id: 'm', role: 'minister' }), baseTask)).toBe(true);
  });

  it('Minister does NOT see dg_only tasks', () => {
    expect(canSeeTask(u({ id: 'm', role: 'minister' }),
      { ...baseTask, visibility_scope: 'dg_only' })).toBe(false);
  });

  it('agency officer sees tasks in their home agency', () => {
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'GPL' }), baseTask)).toBe(true);
  });

  it('agency officer does NOT see tasks in another agency', () => {
    expect(canSeeTask(u({ id: 'mark', role: 'officer', agency: 'GWI' }), baseTask)).toBe(false);
  });

  it('owner sees their own task even outside their home agency', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GWI' }),
      { ...baseTask, owner_user_id: 'kesh', agency: 'MPUA-DG' },
    )).toBe(true);
  });

  it('delegate sees a task delegated to them', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GWI' }),
      { ...baseTask, owner_user_id: 'someone-else', delegated_to_id: 'kesh', agency: 'MPUA-DG' },
    )).toBe(true);
  });

  it('agency officer does NOT see dg_only tasks even in their own agency', () => {
    expect(canSeeTask(
      u({ id: 'kesh', role: 'officer', agency: 'GPL' }),
      { ...baseTask, visibility_scope: 'dg_only' },
    )).toBe(false);
  });

  it('agency_admin behaves like officer for visibility', () => {
    expect(canSeeTask(u({ id: 'a', role: 'agency_admin', agency: 'GPL' }), baseTask)).toBe(true);
  });

  it('inactive user sees nothing', () => {
    expect(canSeeTask(u({ id: 'dg', role: 'dg', is_active: false }), baseTask)).toBe(false);
  });

  it('agency comparison is case-insensitive (tasks.agency is freeform)', () => {
    // tasks.agency may be 'gpl' (legacy) or 'GPL' (canonical); both must match user.agency='gpl'.
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'gpl' }), baseTask)).toBe(true);
    expect(canSeeTask(u({ id: 'k', role: 'officer', agency: 'gpl' }),
      { ...baseTask, agency: 'gpl' })).toBe(true);
  });

  it('null task.agency does not match', () => {
    expect(canSeeTask(
      u({ id: 'k', role: 'officer', agency: 'GPL' }),
      { ...baseTask, agency: null },
    )).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (current `canSeeItem` won't satisfy this signature).**

```bash
npx vitest run lib/__tests__/action-items-visibility.test.ts
```

Expected: FAIL — `canSeeTask` is not exported / signature mismatch.

- [ ] **Step 3: Rewrite the helper.**

Overwrite `lib/action-items/visibility.ts`:

```typescript
import type { TaskWithExtensions, UserStaffFields } from './types';

const MINISTRY_ROLES = new Set(['dg', 'minister', 'ps', 'parl_sec']);

export function canSeeTask(user: UserStaffFields, task: TaskWithExtensions): boolean {
  if (!user.is_active) return false;

  if (task.visibility_scope === 'dg_only') {
    return user.role === 'dg';
  }

  // agency_normal:
  if (MINISTRY_ROLES.has(user.role)) return true;

  if (user.id === task.owner_user_id) return true;
  if (task.delegated_to_id && user.id === task.delegated_to_id) return true;

  if (user.agency && task.agency &&
      user.agency.toLowerCase() === task.agency.toLowerCase()) {
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

```bash
npx vitest run lib/__tests__/action-items-visibility.test.ts
```

Expected: PASS, all 16 tests green.

- [ ] **Step 5: Type-check + lint.**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add lib/action-items/visibility.ts lib/__tests__/action-items-visibility.test.ts
git commit -m "refactor(action-items): canSeeTask (replaces canSeeItem; operates on tasks)"
```

---

## Task 10: Module README — reflect corrected relationship

**Files:**
- Modify: `lib/action-items/README.md`

- [ ] **Step 1: Overwrite the README.**

```markdown
# Action Items module

The extraction pipeline that creates Tasks. **Action Items is not a new
module — Tasks/War Room (`/tasks`) is the canonical commitment layer.**
Items originate from Fireflies-extracted transcripts (later plans) or
from manual entry via the existing Add Task form in War Room.

## Spec

`docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md`
(rev 2026-05-03b — read the changelog at the top). The locked decisions
in §0 are non-negotiable.

## Structure (Plan 1 — foundation)

- `constants.ts` — frozen enums and lookup tables that mirror the CHECK
  constraints in migration 102 and the widened `tasks_status_check`.
- `types.ts` — `TaskWithExtensions` (the `tasks` row after migration 102)
  + row types for the four pipeline-side tables + `UserStaffFields`.
  Zod schemas for runtime validation at API boundaries.
- `visibility.ts` — `canSeeTask(user, task)` pure function. App-layer
  visibility enforcement. The `tasks` RLS policy from migration 022 is
  disabled by migration 102; this helper is the enforcement seam.

## Routes that remain under `/action-items`

- `/action-items/review` — meeting cards awaiting extraction review.
- `/action-items/review/[extractionId]` — three-bucket review.
- `/action-items/meetings` — `meetings_seen` list (Plan 3).
- `/action-items/process` — manual extraction trigger (Plan 4).
- `/action-items/eval` — eval dashboard (Plan 5).

War Room (`/tasks`) is the consumption surface for the items themselves.

## Prompt versioning rule (anticipating Plan 4)

Prompts live in `lib/action-items/prompts/extraction-<modality>-vN.M.ts`.
**Never edit a versioned prompt file in place.** Any change requires a
new filename and a new `prompt_version` string. Old extractions reference
the prompt they ran against; preserving the file is what makes
per-prompt-version eval possible.

## Attribution anchor

Every AI-generated task is attributed to the meeting itself, not to the
AI and not to the DG. Card text is computed at render time from
`tasks.source` + lookups; never stored. Locked decision §0.1.
```

- [ ] **Step 2: Commit.**

```bash
git add lib/action-items/README.md
git commit -m "docs(action-items): module README — corrected relationship to Tasks"
```

---

## Task 11: Sidebar entry → `/action-items/review`

**Files:**
- Modify: `components/layout/Sidebar.tsx`

The sidebar carries one Action Items link. It points at the review queue (DG/PS only — page-level guard already in place from the prior Plan 1 review-shell commit). Other Action Items routes (`/meetings`, `/process`, `/eval`) are reached from inside the review surface in later plans.

- [ ] **Step 1: Read the existing sidebar to find the insertion point.**

```bash
grep -n "Task Board\|War Room\|/tasks\|Oversight\|/oversight" components/layout/Sidebar.tsx
```

Expected: line numbers for the existing Tasks/War Room entry. Note them.

- [ ] **Step 2: Add the new link.**

Insert an "Action Items" entry that points to `/action-items/review`. Match the existing sidebar item shape (likely a config array or a repeated `<SidebarItem>` JSX). Place it **after** the Tasks/War Room entry — pipeline-management lives next to where the items it produces consume.

- Label: `Action Items`
- Href: `/action-items/review`
- Icon: a Lucide icon already imported in the file; if there's no obvious match, use `ListChecks` and add it to the imports.
- No role gate at the sidebar level — the page guards in the review shells handle access (DG/PS/parl_sec only).

- [ ] **Step 3: Verify.**

```bash
grep -n "/action-items/review" components/layout/Sidebar.tsx
```

Expected: at least one match.

- [ ] **Step 4: Type-check + lint.**

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Commit.**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(action-items): sidebar entry → /action-items/review"
```

---

## Task 12: End-to-end verification

- [ ] **Step 1: Run the full test suite.**

```bash
npm test
```

Expected: all tests pass — including the updated constants and `canSeeTask` tests.

- [ ] **Step 2: Type-check.**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint.**

```bash
npm run lint
```

Expected: no errors.

- [ ] **Step 4: Build.**

```bash
npm run build
```

Expected: build succeeds. Only `/action-items/review` and `/action-items/review/[extractionId]` appear under `/action-items` in the route output.

- [ ] **Step 5: Manual smoke test.**

```bash
npm run dev
```

In the browser:

- `/action-items/review` (as DG) → renders "Review queue" empty shell.
- `/action-items/review` (as officer) → renders "Restricted" notice.
- `/action-items/review/<any-uuid>` (as DG) → renders extraction empty shell.
- `/action-items` (any role) → 404. (No page; intentional. War Room is the surface.)
- `/action-items/mine` → 404. (Use `/tasks` My Tasks.)
- `/action-items/agency/GPL` → 404. (Use War Room agency filter.)
- `/action-items/new` → 404. (Use War Room Add Task.)
- `/tasks` → unchanged from main; still renders the existing War Room board.
- Sidebar shows "Action Items" linking to `/action-items/review`.

- [ ] **Step 6: Migration handoff.**

Surface to the user (post in chat or in PR description):

> Migration `supabase/migrations/102_action_items_v1.sql` (rev b) is ready
> to run. Execute manually via Supabase Dashboard → SQL Editor against
> the project DB. **This migration drops the `tasks_access` RLS policy
> from migration 022; visibility for this module's flows now lives in
> `lib/action-items/visibility.ts` (`canSeeTask`).** Verification queries
> in `102_action_items_v1.README.md`.

This is the only manual step at end of revised Plan 1.

---

## Self-review

**Spec coverage** (against `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` rev b):

- §0 locked decisions → constants module + types reflect every enum; attribution anchor in README.
- §1 v1 scope → only `/action-items/review/*` routes scaffolded; War Room is left alone (correct).
- §3.1 users widening → Task 1.
- §3.2 tasks widening (provenance, verification flow, supersession, visibility, status enum) → Task 3.
- §3.3 extractions table → Task 2.
- §3.4 events table with `task_id` FK → Task 4.
- §3.5 `meetings_seen` → Task 4.
- §3.6 `failed_extractions` → Task 4.
- §11.3 visibility on tasks → Task 9.
- Migration 022 RLS disabled → Task 3.
- Sidebar link → Task 11.
- Manual migration execution rule + README → Tasks 5, 12.

**Not in this plan (correctly deferred):**

- Plan 2 (next): owner self-close, DG verification, dispute / pushback, verification surface placement, inline manual-add component, event-log extension on existing task detail, lifecycle API routes under `/api/tasks/[id]/{complete,verify,dispute,pushback}`.
- Plan 3: Fireflies polling, `meetings_seen` population, daily digest, "Process manually" CTA → War Room Add Task with query-param prefill.
- Plan 4: extraction (Anthropic), prompt files, validation pipeline, resolution pipeline, political-risk gate, three-bucket review UI, supersession suggestion display.
- Plan 5: supersession matcher, drift detector, earned-trust tracker, eval dashboard.

**Placeholder scan:** every step has concrete code or a concrete command. No "TBD".

**Type consistency:**

- `canSeeTask(user: UserStaffFields, task: TaskWithExtensions): boolean` — same signature in test (Task 9) and at every call site assumed by Plans 2–5.
- `TaskStatus` includes `awaiting_verification` and `superseded` — used by both `tasks_status_check` (Task 3) and the constants/types (Tasks 7–8).
- `ActionItemEventRow.task_id` matches the column name in migration 102 (Task 4).
- `tasks.source ∈ {'manual','extraction'}` matches both the migration CHECK and the `TaskWithExtensions.source` literal type.

---

## Decisions I made on your behalf

These are choices made autonomously while writing the revised plan. Flag any that should have been escalated.

1. **Edit migration 102 in place** instead of (a) follow-up migration or (b) branch reset. Rationale in the "Context" section above: migration 102 has not been executed; both alternatives the user listed are strictly worse. The branch keeps its commit history; the file the user actually pastes into Supabase Dashboard is the corrected version.
2. **Drop the `tasks_access` RLS policy from migration 022** in this migration. The spec moves to app-layer enforcement; mixing RLS with app-layer guards is the standing footgun rule. The existing `app/api/tasks/*` route handlers already do app-layer checks; `canSeeTask` is the seam for new flows. If RLS removal is unacceptable, the alternative is to extend the existing policy with awaiting_verification + dispute_note visibility — a separate, more invasive design choice; flagging here.
3. **No CHECK constraint on `tasks.agency` in this migration.** The existing 93 rows have freeform values (`gpl`, `mpua`, etc.); a CHECK constraint would fail. Extraction-side code writes the canonical 9-value enum; a follow-up data-cleanup migration (out of v1 scope) can canonicalize legacy rows and then add the constraint. `canSeeTask` compares case-insensitively to bridge the gap.
4. **`tasks.source` defaults to `'manual'`** so the existing 93 rows don't fail the new `extraction_provenance_required` constraint. The constraint exempts `source='manual'` from the provenance requirement.
5. **`tasks.source_meeting_id` is added as TEXT** even though the existing same-named column from migration 022 is UUID. The existing column was unused and never written to (Notion cleanup left it as a vestigial UUID); the new TEXT column carries Fireflies meeting IDs, which are not UUIDs. Verify this assumption in the live database before running migration 102 — if any tasks rows have a non-NULL `source_meeting_id` UUID, the type widen needs to be done carefully or a data migration first. The migration uses `ADD COLUMN IF NOT EXISTS`, so if the existing UUID column is still present and populated, the migration **will not** add the TEXT version and the column will retain its UUID type. **Open issue for Plan 2 to address before extraction wires in:** confirm `tasks.source_meeting_id` is unused, then either keep the UUID column and have the pipeline write a deterministic UUID derived from the Fireflies ID, OR run a one-off `ALTER COLUMN ... TYPE TEXT` before any extraction inserts.
6. **`TaskStatus` is the canonical name** (not `ItemStatus`). The original Plan 1's `ITEM_STATUSES` had 7 action_items-specific values; the corrected enum has 6 and aligns with the actual `tasks_status_check` constraint after migration 102.
7. **`canSeeTask` matches by `delegated_to_id`** in addition to ownership, role, and agency. Spec §10.6 says "delegate sees but cannot close." The closure rule is enforced in Plan 2's `/complete` endpoint; the visibility seam is here.
8. **Sidebar link points at `/action-items/review`** (the only DGOS-owned route under `/action-items` until Plans 3/4/5 add `/meetings`, `/process`, `/eval`). The page-level guard (DG/PS/parl_sec) was committed in the original Plan 1 review shells; the sidebar relies on it.
9. **`/action-items` and the dropped surfaces 404** in the build output. This is correct behavior — the corrected spec drops these surfaces. If a redirect to War Room would be more user-friendly than a 404, it can be added later with a single `redirect('/tasks')` in a thin route file; v1 scope keeps it as 404.
10. **Plans 3, 4, 5 are unchanged in spirit** but require the following adjustments when those plans are written:
    - **Plan 3 (Fireflies ingestion + meetings_seen + digest)** — unaffected at the schema/code level. The "Process manually" CTA from a `meetings_seen` card now opens War Room's Add Task form with query-param prefill (`/tasks?action=add&meeting_id=...&meeting_title=...&meeting_date=...`) instead of a deleted `/action-items/new`. Confirm the existing Add Task form supports query-param prefill before Plan 3 ships, or add it as one Plan 3 task.
    - **Plan 4 (extraction + review + political-risk gate)** — accepted items insert into `tasks` (with `source='extraction'`) instead of an `action_items` table. The validation, resolution, and review-queue scope is unchanged; the inline manual-add component (`InlineExtractionAddItem.tsx`) wraps `POST /api/tasks` instead of a deleted `/api/action-items` endpoint. The lifecycle endpoints (`/complete`, `/verify`, `/dispute`, `/pushback`) live under `/api/tasks/[id]/*` (Plan 2 builds them).
    - **Plan 5 (supersession matcher + trust tracker + eval)** — matcher candidate set queries `tasks` (not `action_items`) where `status IN ('new','active','blocked','awaiting_verification')`. Trust tracker and eval dashboard semantics are unaffected; only the table they read from changes.

If any of these should have been a question, tell me and I'll revise.
