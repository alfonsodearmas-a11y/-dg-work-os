# Action Items — Plan 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (read this first; it is the authoritative source for every decision below).

**Goal:** Land the schema, type system, visibility logic, sidebar link, and route scaffolding for the Action Items pipeline. Zero AI, zero Fireflies, zero UI features. End state: migrations runnable, all routes render an auth-gated empty shell, types compile, visibility unit tests pass.

**Architecture:** Single SQL migration creates 5 new tables and widens `users`. A new `lib/action-items/` directory holds enums, types, constants, and the visibility helper. Page shells under `app/action-items/*` use the existing AppShell layout and render an empty-state component until later plans wire features in. Visibility is enforced app-layer via a pure function tested independently — consistent with the design spec's call to skip RLS for this module.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase (Postgres + pgvector), Vitest, Tailwind v4, NextAuth v5.

---

## Conventions for this plan

- **Migration execution:** Output the SQL file under `supabase/migrations/`. Do **not** auto-run. After the file is committed, the engineer must execute it via the Supabase Dashboard. Each task that depends on the schema being live calls this out explicitly.
- **Tests live in** `lib/__tests__/` next to the existing test files (`auth-helpers.test.ts`, `format.test.ts`, etc.). Module under test: `lib/action-items/<file>.ts` → test at `lib/__tests__/action-items-<file>.test.ts`.
- **Commits:** small and frequent, one per logical step. Conventional-commit prefixes used: `feat:`, `chore:`, `test:`, `refactor:`, `docs:`.
- **Type-checking gate:** every task that adds or changes TS code ends with `npx tsc --noEmit` passing before commit. Where called out, `npm run lint` also runs.
- **No premature features.** This plan adds *no* business logic, *no* data fetches, *no* UI components beyond empty shells. Anything not listed here belongs in Plans 2–5.

---

## File map

**Created:**

- `supabase/migrations/102_action_items_v1.sql` — full schema for v1: users widening + 5 tables + indexes + extension.
- `lib/action-items/README.md` — one-paragraph orientation pointing at the spec and the version-bump rule for prompts (anticipating Plan 4).
- `lib/action-items/constants.ts` — agency enum, status enum, modality enum, type enum, verb taxonomy, banned phrases, safety keywords.
- `lib/action-items/types.ts` — TypeScript types matching DB columns, plus Zod schemas for runtime validation at API boundaries.
- `lib/action-items/visibility.ts` — `canSeeItem(user, item)` pure function. App-layer visibility enforcement.
- `lib/__tests__/action-items-visibility.test.ts` — visibility unit tests.
- `lib/__tests__/action-items-constants.test.ts` — invariant tests on the constant tables (no banned phrase contains a sentence-initial verb that's also approved, no enum collision, etc.).
- `app/action-items/page.tsx` — empty-state shell for the agency-tree consumption view.
- `app/action-items/mine/page.tsx` — empty-state shell for the owner-scoped view.
- `app/action-items/agency/[name]/page.tsx` — empty-state shell for the per-agency view.
- `app/action-items/[id]/page.tsx` — empty-state shell for the item-detail view.
- `app/action-items/new/page.tsx` — empty-state shell for the freestanding manual-add form.
- `app/action-items/review/page.tsx` — empty-state shell for the review-queue meeting list.
- `app/action-items/review/[extractionId]/page.tsx` — empty-state shell for the per-meeting review view.
- `components/action-items/EmptyShell.tsx` — minimal reusable component used by every shell page in this plan.

**Modified:**

- `components/layout/Sidebar.tsx` — add "Action Items" entry under Main Menu, between "Task Board" and "Oversight".

---

## Task 1: SQL migration — pgvector + users widening

**Files:**
- Create: `supabase/migrations/102_action_items_v1.sql`

- [ ] **Step 1: Scaffold the migration file with the version comment and pgvector enable.**

Create `supabase/migrations/102_action_items_v1.sql` with:

```sql
-- ============================================================================
-- Migration 102: Action Items v1 — Foundation
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + 5 new tables for the action items pipeline.
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated action item is attributed to the meeting itself,
-- not to the AI and not to the DG personally. This is non-negotiable
-- and reaches into the schema via action_items.source + extraction linkage.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 2: Add the users widening block.**

Append to `102_action_items_v1.sql`:

```sql
-- ----------------------------------------------------------------------------
-- Widen users (locked decision: single users table carries staff metadata,
-- no separate staff_profile join table).
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';
```

- [ ] **Step 3: Verify the file syntactically by parsing it with psql in `--dry-run` style.**

Run:

```bash
grep -c "CREATE\|ALTER\|COMMENT" supabase/migrations/102_action_items_v1.sql
```

Expected: 5 (one extension, three alters, three comments — actually 7; the assert is "≥5", just confirming the file isn't empty).

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): scaffold migration 102 + widen users"
```

---

## Task 2: SQL migration — `action_item_extractions` table

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql`

- [ ] **Step 1: Append the `action_item_extractions` table.**

Add to `supabase/migrations/102_action_items_v1.sql`:

```sql
-- ----------------------------------------------------------------------------
-- action_item_extractions — one row per (Fireflies meeting, prompt version)
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
git commit -m "feat(action-items): add action_item_extractions table to migration"
```

---

## Task 3: SQL migration — `action_items` table

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql`

- [ ] **Step 1: Append the `action_items` table.**

Add to `supabase/migrations/102_action_items_v1.sql`:

```sql
-- ----------------------------------------------------------------------------
-- action_items — canonical commitment record
-- Single owner (delegation modeled as separate field, not co-owner).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source              TEXT NOT NULL DEFAULT 'extraction'
                        CHECK (source IN ('extraction','manual')),
  extraction_id       UUID REFERENCES action_item_extractions(id),
  extraction_item_idx INTEGER,
  source_meeting_id   TEXT,
  source_timestamp    TEXT,
  source_quote        TEXT,
  created_by          UUID REFERENCES users(id),

  -- Routing
  agency_name         TEXT NOT NULL CHECK (agency_name IN
                        ('GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
                         'MPUA-DG','MPUA-Minister','MPUA-PS')),
  owner_id            UUID NOT NULL REFERENCES users(id),
  owner_name_raw      TEXT NOT NULL,
  delegated_to_id     UUID REFERENCES users(id),

  -- Content
  verb_category       TEXT NOT NULL CHECK (verb_category IN
                        ('correspondence','decision','information',
                         'scheduling','project_update','analysis')),
  task                TEXT NOT NULL CHECK (char_length(task) <= 500),
  due_at              TIMESTAMPTZ,
  due_trigger         TEXT,
  priority            TEXT NOT NULL CHECK (priority IN ('P0','P1','P2','P3')),

  -- Lifecycle
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN
                        ('open','in_progress','awaiting_verification',
                         'complete','cancelled','superseded','disputed')),
  reviewed_by         UUID REFERENCES users(id),
  reviewed_at         TIMESTAMPTZ,
  completed_by        UUID REFERENCES users(id),
  completed_at        TIMESTAMPTZ,
  completion_note     TEXT,
  verified_by         UUID REFERENCES users(id),
  verified_at         TIMESTAMPTZ,
  disputed_at         TIMESTAMPTZ,
  dispute_note        TEXT,

  -- Supersession
  supersedes_id       UUID REFERENCES action_items(id),

  -- QA
  confidence_overall  NUMERIC(3,2),
  confidence_reasons  TEXT[],
  task_embedding      VECTOR(1536),

  -- Visibility (spec §11.5)
  visibility_scope    TEXT NOT NULL DEFAULT 'agency_normal'
                        CHECK (visibility_scope IN ('agency_normal','dg_only')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT extraction_fields_required CHECK (
    source = 'manual' OR
    (extraction_id IS NOT NULL
     AND source_meeting_id IS NOT NULL
     AND extraction_item_idx IS NOT NULL
     AND confidence_overall IS NOT NULL)
  ),
  CONSTRAINT manual_creator_required CHECK (
    source = 'extraction' OR created_by IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_items_agency_owner_status
  ON action_items(agency_name, owner_id, status)
  WHERE status IN ('open','in_progress','awaiting_verification');
CREATE INDEX IF NOT EXISTS idx_items_owner_status
  ON action_items(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_items_status_due
  ON action_items(status, due_at)
  WHERE status IN ('open','in_progress');
CREATE INDEX IF NOT EXISTS idx_items_supersedes
  ON action_items(supersedes_id) WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_items_extraction
  ON action_items(extraction_id);
CREATE INDEX IF NOT EXISTS idx_items_embedding
  ON action_items USING ivfflat (task_embedding vector_cosine_ops);
```

- [ ] **Step 2: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql
git commit -m "feat(action-items): add action_items table to migration"
```

---

## Task 4: SQL migration — events, meetings_seen, failed_extractions

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql`

- [ ] **Step 1: Append the three remaining tables.**

Add to `supabase/migrations/102_action_items_v1.sql`:

```sql
-- ----------------------------------------------------------------------------
-- action_item_events — append-only audit log
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS action_item_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id       UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN
                  ('created','accepted','edited','rejected','status_change',
                   'dispute_raised','dispute_resolved','superseded_by','supersedes',
                   'attribution_error_flagged')),
  actor_id      UUID REFERENCES users(id),
  payload       JSONB NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_item
  ON action_item_events(item_id, occurred_at DESC);

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
git commit -m "feat(action-items): add events, meetings_seen, failed_extractions"
```

---

## Task 5: Migration sanity — final consistency check

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql` (only if errors found)

- [ ] **Step 1: Verify foreign-key targets and table-creation order.**

Run:

```bash
grep -E "REFERENCES " supabase/migrations/102_action_items_v1.sql
```

Expected: every `REFERENCES <table>(id)` appears *after* the `CREATE TABLE <table>` for that target. The references are: `users(id)` (exists pre-migration); `action_item_extractions(id)` (created Task 2, used in Tasks 3 and 4); `action_items(id)` (created Task 3, used by `supersedes_id` self-reference and by `action_item_events.item_id` in Task 4). Confirm by inspection that the ordering in the file is: extension → users widening → extractions → items → events → meetings_seen → failed_extractions.

- [ ] **Step 2: Confirm the `users_agency_check` constraint from migration 021 is compatible.**

The existing constraint on `users` requires `agency IS NULL` for roles `dg/minister/ps` and `agency IS NOT NULL` for `agency_admin/officer`. The new `is_agency_head` column does not interact with this — Minister and PS will have `is_agency_head=true` AND `agency=NULL`, which is valid. Document by appending this comment to the migration file:

```sql
-- ----------------------------------------------------------------------------
-- Compatibility note: existing users_agency_check constraint (migration 021)
-- requires agency IS NULL for dg/minister/ps. is_agency_head is independent
-- of agency: Minister/PS can have is_agency_head=true with agency=NULL.
-- ----------------------------------------------------------------------------
```

- [ ] **Step 3: Output the manual-execution instruction file.**

Create `supabase/migrations/102_action_items_v1.README.md`:

```markdown
# Migration 102 — Action Items v1

## How to run

This migration is **not** auto-executed. Run it manually via Supabase Dashboard
(SQL Editor) against the project database.

1. Open the project at https://supabase.com/dashboard
2. SQL Editor → New query
3. Paste the contents of `102_action_items_v1.sql`
4. Run

## Pre-flight

The migration begins with `CREATE EXTENSION IF NOT EXISTS vector`. If the
Supabase project does not have pgvector enabled, this line will fail. Enable
the extension via Database → Extensions → search "vector" → Enable, then
re-run the migration.

## Idempotency

All `CREATE TABLE` and `CREATE INDEX` statements use `IF NOT EXISTS`. The
`ALTER TABLE users ADD COLUMN` statements use `IF NOT EXISTS`. Re-running the
migration is safe.

## Verification

After running, confirm:

```sql
SELECT count(*) FROM information_schema.tables
WHERE table_name IN
  ('action_items','action_item_extractions','action_item_events',
   'meetings_seen','failed_extractions');
-- expected: 5

SELECT column_name FROM information_schema.columns
WHERE table_name='users'
  AND column_name IN ('aliases','closure_mode','is_agency_head');
-- expected: 3 rows
```
```

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql supabase/migrations/102_action_items_v1.README.md
git commit -m "docs(action-items): migration 102 readme + compat note"
```

---

## Task 6: Constants module

**Files:**
- Create: `lib/action-items/constants.ts`
- Test: `lib/__tests__/action-items-constants.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `lib/__tests__/action-items-constants.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  AGENCIES,
  MEETING_TYPES,
  MODALITIES,
  ITEM_STATUSES,
  REVIEW_STATUSES,
  PIPELINE_ACTIONS,
  VERB_CATEGORIES,
  APPROVED_VERBS,
  BANNED_PHRASES,
  SAFETY_KEYWORDS,
  CLOSURE_MODES,
  VISIBILITY_SCOPES,
  PRIORITIES,
} from '@/lib/action-items/constants';

describe('action-items constants', () => {
  it('exports the 10 agency enum values', () => {
    expect(AGENCIES).toEqual([
      'GPL','GWI','GCAA','CJIA','MARAD','HCI','HA',
      'MPUA-DG','MPUA-Minister','MPUA-PS',
    ]);
  });

  it('exports the 3 meeting types and 3 modalities', () => {
    expect(MEETING_TYPES).toEqual(['internal','agency','external']);
    expect(MODALITIES).toEqual(['virtual','in_person','mixed']);
  });

  it('exports the 7 item statuses including superseded and disputed', () => {
    expect(ITEM_STATUSES).toEqual([
      'open','in_progress','awaiting_verification',
      'complete','cancelled','superseded','disputed',
    ]);
  });

  it('every approved verb maps to exactly one verb category', () => {
    const seen = new Map<string, string>();
    for (const [cat, verbs] of Object.entries(APPROVED_VERBS)) {
      for (const v of verbs) {
        expect(seen.has(v), `verb "${v}" in two categories`).toBe(false);
        seen.set(v, cat);
      }
    }
  });

  it('approved verbs cover all 6 verb categories', () => {
    expect(Object.keys(APPROVED_VERBS).sort()).toEqual([...VERB_CATEGORIES].sort());
  });

  it('no banned phrase contains an approved verb as a whole word', () => {
    const allApproved = Object.values(APPROVED_VERBS).flat();
    for (const phrase of BANNED_PHRASES) {
      for (const verb of allApproved) {
        const re = new RegExp(`\\b${verb}\\b`, 'i');
        expect(re.test(phrase),
          `banned phrase "${phrase}" contains approved verb "${verb}"`).toBe(false);
      }
    }
  });

  it('safety keywords are lowercase and non-empty', () => {
    for (const kw of SAFETY_KEYWORDS) {
      expect(kw).toBe(kw.toLowerCase());
      expect(kw.length).toBeGreaterThan(0);
    }
  });

  it('closure_modes, visibility_scopes, priorities exact values', () => {
    expect(CLOSURE_MODES).toEqual(['self_close','dg_managed']);
    expect(VISIBILITY_SCOPES).toEqual(['agency_normal','dg_only']);
    expect(PRIORITIES).toEqual(['P0','P1','P2','P3']);
  });

  it('review_statuses and pipeline_actions match schema CHECK constraints', () => {
    expect(REVIEW_STATUSES).toEqual(['pending','in_review','complete','skipped','failed']);
    expect(PIPELINE_ACTIONS).toEqual([
      'extracted','skipped_out_of_scope','queued','failed','manually_processed',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails (module does not exist yet).**

Run:

```bash
npx vitest run lib/__tests__/action-items-constants.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/action-items/constants'`.

- [ ] **Step 3: Create the constants module.**

Create `lib/action-items/constants.ts`:

```typescript
// Action Items — locked constants (spec §3, §4.1, §4.2, §6.4, §11.5)
//
// Every CHECK constraint in migration 102 has a counterpart here. When a
// constraint changes, both the SQL and this file move together. Tests in
// lib/__tests__/action-items-constants.test.ts enforce the invariants.

export const AGENCIES = [
  'GPL', 'GWI', 'GCAA', 'CJIA', 'MARAD', 'HCI', 'HA',
  'MPUA-DG', 'MPUA-Minister', 'MPUA-PS',
] as const;
export type Agency = (typeof AGENCIES)[number];

export const MEETING_TYPES = ['internal', 'agency', 'external'] as const;
export type MeetingType = (typeof MEETING_TYPES)[number];

export const MODALITIES = ['virtual', 'in_person', 'mixed'] as const;
export type Modality = (typeof MODALITIES)[number];

export const ITEM_STATUSES = [
  'open', 'in_progress', 'awaiting_verification',
  'complete', 'cancelled', 'superseded', 'disputed',
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const REVIEW_STATUSES = [
  'pending', 'in_review', 'complete', 'skipped', 'failed',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const PIPELINE_ACTIONS = [
  'extracted', 'skipped_out_of_scope', 'queued', 'failed', 'manually_processed',
] as const;
export type PipelineAction = (typeof PIPELINE_ACTIONS)[number];

export const VERB_CATEGORIES = [
  'correspondence', 'decision', 'information',
  'scheduling', 'project_update', 'analysis',
] as const;
export type VerbCategory = (typeof VERB_CATEGORIES)[number];

export const APPROVED_VERBS: Record<VerbCategory, readonly string[]> = {
  correspondence: ['write', 'issue', 'send', 'draft', 'publish', 'distribute'],
  decision:       ['approve', 'sign', 'authorize', 'clear', 'reject'],
  information:    ['obtain', 'verify', 'confirm', 'report', 'investigate'],
  scheduling:     ['schedule', 'convene', 'arrange', 'coordinate'],
  project_update: ['update', 'submit', 'mark', 'close', 'reopen'],
  analysis:       ['calculate', 'analyze', 'assess', 'compare', 'evaluate'],
};

export const BANNED_PHRASES = [
  'follow up on',
  'follow up with',
  'touch base',
  'circle back',
  'look into',
  'address the issue of',
  // 'handle' and 'work on' are excluded from the substring list because they
  // contain no approved-verb collisions and are matched as standalone tokens
  // by the validator (Plan 4) — keeping them here as substrings would block
  // legitimate sentences like "investigate handle valves".
] as const;
export type BannedPhrase = (typeof BANNED_PHRASES)[number];

export const SAFETY_KEYWORDS = [
  'safety', 'fire', 'accident', 'fatality', 'injury', 'hazard',
  'evacuation', 'emergency', 'outage', 'blackout', 'spill', 'contamination',
] as const;

export const CLOSURE_MODES = ['self_close', 'dg_managed'] as const;
export type ClosureMode = (typeof CLOSURE_MODES)[number];

export const VISIBILITY_SCOPES = ['agency_normal', 'dg_only'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const FAILURE_REASONS = [
  'claude_error', 'malformed_json', 'transcript_unavailable',
  'speaker_collapse_virtual', 'transcript_partial', 'quota_exceeded', 'other',
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export const EVENT_TYPES = [
  'created', 'accepted', 'edited', 'rejected', 'status_change',
  'dispute_raised', 'dispute_resolved', 'superseded_by', 'supersedes',
  'attribution_error_flagged',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
```

Note: the constants file deviates from the spec on `BANNED_PHRASES` — `handle` and `work on` are intentionally not in the substring list because they collide with legitimate text. The validator implementation in Plan 4 will treat them as whole-token matches via a separate code path. This is documented inline.

- [ ] **Step 4: Run the test to confirm it passes (and adjust the test if the deviation needs reflecting).**

Update `lib/__tests__/action-items-constants.test.ts` so the banned-phrase list matches reality. Replace the assertion in the "no banned phrase contains an approved verb as a whole word" test — it already passes with the trimmed list. Then run:

```bash
npx vitest run lib/__tests__/action-items-constants.test.ts
```

Expected: PASS, all 8 tests green.

- [ ] **Step 5: Type-check.**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add lib/action-items/constants.ts lib/__tests__/action-items-constants.test.ts
git commit -m "feat(action-items): constants module with locked enums + tests"
```

---

## Task 7: Types module

**Files:**
- Create: `lib/action-items/types.ts`

- [ ] **Step 1: Create the types module.**

Create `lib/action-items/types.ts`:

```typescript
import { z } from 'zod';
import {
  AGENCIES, MEETING_TYPES, MODALITIES, ITEM_STATUSES,
  REVIEW_STATUSES, PIPELINE_ACTIONS, VERB_CATEGORIES,
  CLOSURE_MODES, VISIBILITY_SCOPES, PRIORITIES,
  FAILURE_REASONS, EVENT_TYPES,
  type Agency, type MeetingType, type Modality, type ItemStatus,
  type ReviewStatus, type PipelineAction, type VerbCategory,
  type ClosureMode, type VisibilityScope, type Priority,
  type FailureReason, type EventType,
} from './constants';

// ============================================================================
// DB row types — mirror migration 102 column-for-column.
// ============================================================================

export interface ActionItemRow {
  id: string;
  source: 'extraction' | 'manual';
  extraction_id: string | null;
  extraction_item_idx: number | null;
  source_meeting_id: string | null;
  source_timestamp: string | null;
  source_quote: string | null;
  created_by: string | null;

  agency_name: Agency;
  owner_id: string;
  owner_name_raw: string;
  delegated_to_id: string | null;

  verb_category: VerbCategory;
  task: string;
  due_at: string | null;
  due_trigger: string | null;
  priority: Priority;

  status: ItemStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  completion_note: string | null;
  verified_by: string | null;
  verified_at: string | null;
  disputed_at: string | null;
  dispute_note: string | null;

  supersedes_id: string | null;

  confidence_overall: number | null;
  confidence_reasons: string[] | null;
  task_embedding: number[] | null;

  visibility_scope: VisibilityScope;

  created_at: string;
  updated_at: string;
}

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
  item_id: string;
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
// Zod schemas for runtime validation at API boundaries.
// ============================================================================

export const AgencyZ          = z.enum(AGENCIES);
export const MeetingTypeZ     = z.enum(MEETING_TYPES);
export const ModalityZ        = z.enum(MODALITIES);
export const ItemStatusZ      = z.enum(ITEM_STATUSES);
export const ReviewStatusZ    = z.enum(REVIEW_STATUSES);
export const PipelineActionZ  = z.enum(PIPELINE_ACTIONS);
export const VerbCategoryZ    = z.enum(VERB_CATEGORIES);
export const ClosureModeZ     = z.enum(CLOSURE_MODES);
export const VisibilityScopeZ = z.enum(VISIBILITY_SCOPES);
export const PriorityZ        = z.enum(PRIORITIES);
export const FailureReasonZ   = z.enum(FAILURE_REASONS);
export const EventTypeZ       = z.enum(EVENT_TYPES);

// Exported for sibling tasks; downstream plans extend this.
export type {
  Agency, MeetingType, Modality, ItemStatus, ReviewStatus,
  PipelineAction, VerbCategory, ClosureMode, VisibilityScope, Priority,
  FailureReason, EventType,
};
```

- [ ] **Step 2: Type-check.**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add lib/action-items/types.ts
git commit -m "feat(action-items): row types + Zod schemas matching migration 102"
```

---

## Task 8: Visibility helper

**Files:**
- Create: `lib/action-items/visibility.ts`
- Test: `lib/__tests__/action-items-visibility.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `lib/__tests__/action-items-visibility.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canSeeItem } from '@/lib/action-items/visibility';
import type { ActionItemRow, UserStaffFields } from '@/lib/action-items/types';

const baseItem: ActionItemRow = {
  id: 'i1', source: 'extraction',
  extraction_id: 'e1', extraction_item_idx: 0,
  source_meeting_id: 'm1', source_timestamp: '00:01:00', source_quote: 'q',
  created_by: null,
  agency_name: 'GPL', owner_id: 'u-kesh', owner_name_raw: 'Kesh',
  delegated_to_id: null,
  verb_category: 'correspondence', task: 'issue notice', due_at: null, due_trigger: null,
  priority: 'P2',
  status: 'open',
  reviewed_by: null, reviewed_at: null,
  completed_by: null, completed_at: null, completion_note: null,
  verified_by: null, verified_at: null,
  disputed_at: null, dispute_note: null,
  supersedes_id: null,
  confidence_overall: 0.9, confidence_reasons: null, task_embedding: null,
  visibility_scope: 'agency_normal',
  created_at: '2026-05-03T00:00:00Z', updated_at: '2026-05-03T00:00:00Z',
};

const u = (over: Partial<UserStaffFields>): UserStaffFields => ({
  id: 'u', email: 'x@example.com', name: 'X',
  role: 'officer', agency: null,
  aliases: [], closure_mode: 'self_close', is_agency_head: false,
  is_active: true, ...over,
});

describe('canSeeItem', () => {
  it('DG sees everything (agency_normal)', () => {
    expect(canSeeItem(u({ id: 'dg', role: 'dg' }), baseItem)).toBe(true);
  });

  it('DG sees dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'dg', role: 'dg' }), item)).toBe(true);
  });

  it('PS sees agency_normal items in any agency', () => {
    expect(canSeeItem(u({ id: 'ps', role: 'ps' }), baseItem)).toBe(true);
  });

  it('parl_sec is treated as PS for visibility', () => {
    expect(canSeeItem(u({ id: 'p', role: 'parl_sec' }), baseItem)).toBe(true);
  });

  it('PS does NOT see dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'ps', role: 'ps' }), item)).toBe(false);
  });

  it('Minister (read-only ministry role) sees agency_normal items', () => {
    expect(canSeeItem(u({ id: 'min', role: 'minister' }), baseItem)).toBe(true);
  });

  it('Minister does NOT see dg_only items', () => {
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(u({ id: 'min', role: 'minister' }), item)).toBe(false);
  });

  it('agency officer sees items where agency_name matches their home agency', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'GPL' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });

  it('agency officer does NOT see items in another agency', () => {
    const user = u({ id: 'mark', role: 'officer', agency: 'GWI' });
    expect(canSeeItem(user, baseItem)).toBe(false);
  });

  it('agency officer sees items they own even outside their home agency', () => {
    // Edge case: an officer assigned to GWI is owner of an item routed under MPUA-DG.
    const user = u({ id: 'kesh', role: 'officer', agency: 'GWI' });
    const item = { ...baseItem, agency_name: 'MPUA-DG' as const, owner_id: 'kesh' };
    expect(canSeeItem(user, item)).toBe(true);
  });

  it('agency officer does NOT see dg_only items in their own agency', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'GPL' });
    const item = { ...baseItem, visibility_scope: 'dg_only' as const };
    expect(canSeeItem(user, item)).toBe(false);
  });

  it('agency_admin behaves like officer for visibility', () => {
    const user = u({ id: 'a', role: 'agency_admin', agency: 'GPL' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });

  it('inactive user sees nothing', () => {
    const user = u({ id: 'dg', role: 'dg', is_active: false });
    expect(canSeeItem(user, baseItem)).toBe(false);
  });

  it('agency comparison is case-insensitive (matches existing canAccessAgency convention)', () => {
    const user = u({ id: 'kesh', role: 'officer', agency: 'gpl' });
    expect(canSeeItem(user, baseItem)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

Run:

```bash
npx vitest run lib/__tests__/action-items-visibility.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/action-items/visibility'`.

- [ ] **Step 3: Implement the visibility helper.**

Create `lib/action-items/visibility.ts`:

```typescript
import type { ActionItemRow, UserStaffFields } from './types';

const MINISTRY_ROLES = new Set(['dg', 'minister', 'ps', 'parl_sec']);

export function canSeeItem(user: UserStaffFields, item: ActionItemRow): boolean {
  if (!user.is_active) return false;

  if (item.visibility_scope === 'dg_only') {
    return user.role === 'dg';
  }

  // agency_normal:
  if (MINISTRY_ROLES.has(user.role)) return true;

  if (user.id === item.owner_id) return true;
  if (user.id === item.delegated_to_id) return true;

  if (user.agency && user.agency.toLowerCase() === item.agency_name.toLowerCase()) {
    return true;
  }

  return false;
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

Run:

```bash
npx vitest run lib/__tests__/action-items-visibility.test.ts
```

Expected: PASS, all 14 tests green.

- [ ] **Step 5: Type-check + lint.**

Run:

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add lib/action-items/visibility.ts lib/__tests__/action-items-visibility.test.ts
git commit -m "feat(action-items): canSeeItem visibility helper + tests"
```

---

## Task 9: Module README

**Files:**
- Create: `lib/action-items/README.md`

- [ ] **Step 1: Write the README.**

Create `lib/action-items/README.md`:

```markdown
# Action Items module

The canonical commitment layer for MPUA staff. Items originate from
Fireflies-extracted transcripts (later plans) or from DG manual entry
(Plan 2). All items, regardless of source, share schema, lifecycle, and
visibility rules.

## Spec

`docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` is the
authoritative source. Read it before changing this module. The locked
decisions in §0 are not negotiable — they propagate into the schema, the
UI, and every API contract.

## Structure (Plan 1 — foundation)

- `constants.ts` — frozen enums and lookup tables that mirror the
  CHECK constraints in migration 102.
- `types.ts` — TypeScript row types and Zod schemas for the 5 new tables
  plus the `users` staff fields.
- `visibility.ts` — `canSeeItem(user, item)` pure function. App-layer
  visibility enforcement, consistent with how the Tasks and Projects
  modules in DGOS gate reads. No Supabase RLS for this domain.

## Prompt versioning rule (anticipating Plan 4)

Prompts live in `lib/action-items/prompts/extraction-<modality>-vN.M.ts`.
**Never edit a versioned prompt file in place.** Any change — wording,
addendum, banned-phrase update — requires a new filename and a new
`prompt_version` string. Old extractions reference the prompt they ran
against; preserving the file is what makes per-prompt-version eval
possible.

## Attribution anchor

Every AI-generated action item is attributed to the meeting itself,
not to the AI and not to the DG. Card text is computed at render time
from `source` + lookup; never stored. This is locked decision §0.1
in the spec.
```

- [ ] **Step 2: Commit.**

```bash
git add lib/action-items/README.md
git commit -m "docs(action-items): module README + prompt versioning rule"
```

---

## Task 10: EmptyShell component

**Files:**
- Create: `components/action-items/EmptyShell.tsx`

- [ ] **Step 1: Create the empty-shell component.**

Create `components/action-items/EmptyShell.tsx`:

```tsx
import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  cta?: ReactNode;
}

export function EmptyShell({ title, subtitle, cta }: Props) {
  return (
    <div className="card-premium flex flex-col items-center justify-center min-h-[60vh] text-center p-12">
      <h1 className="stat-number text-4xl mb-4">{title}</h1>
      {subtitle && (
        <p className="text-[color:var(--navy-600)] max-w-xl mb-6">{subtitle}</p>
      )}
      {cta}
    </div>
  );
}
```

- [ ] **Step 2: Type-check.**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit.**

```bash
git add components/action-items/EmptyShell.tsx
git commit -m "feat(action-items): EmptyShell scaffold component"
```

---

## Task 11: Page shells (consumption views)

**Files:**
- Create: `app/action-items/page.tsx`
- Create: `app/action-items/mine/page.tsx`
- Create: `app/action-items/agency/[name]/page.tsx`
- Create: `app/action-items/[id]/page.tsx`
- Create: `app/action-items/new/page.tsx`

All pages auth-gate via the existing NextAuth session and render the EmptyShell. They serve only to confirm routing works and the sidebar link lands somewhere; feature implementations come in Plans 2–4.

- [ ] **Step 1: Create `app/action-items/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function ActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="Action Items"
      subtitle="The unified pipeline for tracking commitments across MPUA and the seven portfolio agencies. Coming online with Plan 2."
    />
  );
}
```

- [ ] **Step 2: Create `app/action-items/mine/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function MyActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="My Action Items"
      subtitle="Items where you are the owner. Closure flow lands in Plan 2."
    />
  );
}
```

- [ ] **Step 3: Create `app/action-items/agency/[name]/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';
import { AGENCIES, type Agency } from '@/lib/action-items/constants';

export default async function AgencyActionItemsPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { name } = await params;
  const isValid = (AGENCIES as readonly string[]).includes(name);

  return (
    <EmptyShell
      title={isValid ? `${name} — Action Items` : 'Unknown agency'}
      subtitle={
        isValid
          ? 'Per-agency view. Item rendering lands in Plan 2.'
          : `Recognized agencies: ${AGENCIES.join(', ')}`
      }
    />
  );
}
```

- [ ] **Step 4: Create `app/action-items/[id]/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function ActionItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { id } = await params;

  return (
    <EmptyShell
      title="Action Item detail"
      subtitle={`ID: ${id}. Detail rendering, event log, and supersession chain land in Plan 2.`}
    />
  );
}
```

- [ ] **Step 5: Create `app/action-items/new/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { EmptyShell } from '@/components/action-items/EmptyShell';

export default async function NewActionItemPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  return (
    <EmptyShell
      title="New Action Item"
      subtitle="Freestanding manual-add form. Lands in Plan 2."
    />
  );
}
```

- [ ] **Step 6: Type-check.**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add app/action-items/
git commit -m "feat(action-items): consumption-view page shells"
```

---

## Task 12: Page shells (review views)

**Files:**
- Create: `app/action-items/review/page.tsx`
- Create: `app/action-items/review/[extractionId]/page.tsx`

The review queue is gated behind ministry roles.

- [ ] **Step 1: Create `app/action-items/review/page.tsx`.**

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { EmptyShell } from '@/components/action-items/EmptyShell';

const MINISTRY_ROLES = new Set(['dg', 'ps', 'parl_sec']);

export default async function ReviewQueuePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!MINISTRY_ROLES.has(session.user.role)) {
    return (
      <EmptyShell
        title="Review queue"
        subtitle="Restricted to DG and Permanent Secretary."
      />
    );
  }

  return (
    <EmptyShell
      title="Review queue"
      subtitle="Meetings awaiting extraction review. Three-bucket review lands in Plan 4."
    />
  );
}
```

- [ ] **Step 2: Create `app/action-items/review/[extractionId]/page.tsx`.**

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { EmptyShell } from '@/components/action-items/EmptyShell';

const MINISTRY_ROLES = new Set(['dg', 'ps', 'parl_sec']);

export default async function ReviewExtractionPage({
  params,
}: {
  params: Promise<{ extractionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!MINISTRY_ROLES.has(session.user.role)) {
    return (
      <EmptyShell
        title="Review queue"
        subtitle="Restricted to DG and Permanent Secretary."
      />
    );
  }

  const { extractionId } = await params;

  return (
    <EmptyShell
      title="Review extraction"
      subtitle={`Extraction ID: ${extractionId}. Three-bucket review UI lands in Plan 4.`}
    />
  );
}
```

- [ ] **Step 3: Type-check.**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add app/action-items/review/
git commit -m "feat(action-items): review-queue page shells"
```

---

## Task 13: Sidebar link

**Files:**
- Modify: `components/layout/Sidebar.tsx`

The exact file structure of `Sidebar.tsx` is not assumed here — read the file first and add the Action Items entry under the Main Menu group between "Task Board" and "Oversight".

- [ ] **Step 1: Read the existing sidebar to find the insertion point.**

Run:

```bash
grep -n "Task Board\|Oversight\|/tasks\|/oversight" components/layout/Sidebar.tsx
```

Expected output: line numbers for the existing Task Board and Oversight links. Note them.

- [ ] **Step 2: Add the new link between Task Board and Oversight.**

The exact JSX shape depends on how Sidebar.tsx renders its items (likely an array config or repeated `<SidebarItem>` elements). Match the existing pattern. The new entry has:

- Label: `Action Items`
- Href: `/action-items`
- Icon: `ClipboardList` (or whichever Lucide icon the file imports for similar list-views; if no obvious match, use `ListTodo` and add it to the import block).
- No role-gating at the sidebar level — the page-level guards in Tasks 11–12 handle access.

After editing, run:

```bash
grep -n "/action-items" components/layout/Sidebar.tsx
```

Expected: at least one match for the new link.

- [ ] **Step 3: Type-check + lint.**

Run:

```bash
npx tsc --noEmit && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add components/layout/Sidebar.tsx
git commit -m "feat(action-items): sidebar entry under Main Menu"
```

---

## Task 14: End-to-end verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite.**

```bash
npm test
```

Expected: all tests pass, including the new constants and visibility tests. Pre-existing tests remain green.

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

Expected: build succeeds. The seven new pages appear in the Next.js route output.

- [ ] **Step 5: Manual smoke test.**

```bash
npm run dev
```

Open in browser:

- `/action-items` → renders "Action Items" empty shell.
- `/action-items/mine` → renders "My Action Items" empty shell.
- `/action-items/agency/GPL` → renders "GPL — Action Items".
- `/action-items/agency/UNKNOWN` → renders "Unknown agency".
- `/action-items/new` → renders "New Action Item".
- `/action-items/review` (as DG) → renders "Review queue".
- `/action-items/review` (as officer) → renders "Restricted" notice.
- Sidebar shows "Action Items" between Task Board and Oversight.

- [ ] **Step 6: Migration handoff.**

Surface to the user (post in chat or in PR description):

> Migration `supabase/migrations/102_action_items_v1.sql` is ready to run.
> Execute manually via Supabase Dashboard → SQL Editor against the project DB.
> Pre-flight: ensure pgvector extension is enabled (Database → Extensions).
> Verification queries are in `102_action_items_v1.README.md`.

This is the only manual step at end of Plan 1.

---

## Self-review

**Spec coverage** (skim against `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md`):

- §0 locked decisions → constants module + types reflect every enum; attribution anchor in module README.
- §1 v1 scope → page shells exist for every route listed; no feature logic.
- §3.1 users widening → Task 1.
- §3.2 extractions table → Task 2.
- §3.3 action_items table including `visibility_scope` → Task 3.
- §3.4 events table including `attribution_error_flagged` → Task 4.
- §3.5 meetings_seen → Task 4.
- §3.6 failed_extractions → Task 4.
- §11.5 visibility logic → Task 8.
- Sidebar link covered in Task 13.
- Manual migration execution rule → Task 5 + handoff in Task 14.

**Not in this plan (correctly deferred to later plans):** prompts (Plan 4), Fireflies client (Plan 3), extraction (Plan 4), validation (Plan 4), resolution (Plan 4), political-risk gate (Plan 4), supersession matcher (Plan 5), trust tracker (Plan 5), drift detector (Plan 5), closure/verification flow (Plan 2), dispute resolution (Plan 2), manual-add forms (Plan 2), daily digest (Plan 3), cron (Plan 3), agency-tree consumption UI (Plan 2).

**Placeholder scan:** every step has concrete code or a concrete command. No "TBD" or "implement appropriately."

**Type consistency:** `canSeeItem(user: UserStaffFields, item: ActionItemRow): boolean` matches in test (Task 8) and use sites assumed in later plans. Constants exported from `constants.ts` are imported with the same names in `types.ts` (Task 7) and the visibility test (Task 8).

---

## Decisions I made on your behalf

These are choices I made autonomously while writing this plan. Flag any that should have been escalated.

1. **Single migration file (`102_action_items_v1.sql`) rather than five separate files.** The spec's manual-Dashboard-execution model favors atomicity — one paste, one run, one commit. Splitting would create five Dashboard sessions to coordinate.
2. **Migration is idempotent** (`IF NOT EXISTS` everywhere, `ADD COLUMN IF NOT EXISTS`). Tradeoff: idempotent migrations let you re-run safely but make schema drift detection harder. Existing DGOS migrations (e.g., 022, 095) are not idempotent — I deviated because manual Dashboard execution makes safe re-run materially valuable.
3. **`BANNED_PHRASES` in constants.ts excludes `handle` and `work on`.** The spec lists them, but they collide with legitimate text via simple substring match. The constant tracks substring patterns; whole-token matches will be added in Plan 4's validator as a separate code path. Documented inline.
4. **No Supabase RLS on the new tables.** Spec §10.1 calls for app-layer enforcement consistent with the rest of DGOS. I did not add `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` even though the existing `tasks` table uses it (migration 022) — the spec is explicit, and mixing RLS with app-layer guards is a footgun.
5. **`canSeeItem` treats `parl_sec` as PS-equivalent.** The existing `requireRole` helper (`lib/auth-helpers.ts`) already does this. Matches the codebase convention.
6. **`canSeeItem` lets owners see their own items even outside their home agency.** This wasn't explicit in the spec but is the only sensible interpretation when a GWI officer is owner of an MPUA-DG-routed item. Test asserts this.
7. **Inactive users see nothing.** Defensive; not specified, but the existing `users.is_active` column is the natural gate.
8. **Plan 1 produces no API routes.** The spec lists many `/api/action-items/*` routes; they're all deferred to feature plans. Page-level auth via the existing NextAuth session is the only access control in Plan 1.
9. **Sidebar entry uses Lucide `ClipboardList` (or `ListTodo`)** without further design input — the existing sidebar already imports many Lucide icons; matching one is mechanical.
10. **EmptyShell uses existing utility classes** (`card-premium`, `stat-number`, `--navy-600`) without adding new design tokens. Consistent with CLAUDE.md's design system.
11. **Task 14 step 6 ("Migration handoff") requires the engineer to message the user**, not run the migration. Honors the project rule that SQL migrations are never auto-executed.
12. **No new dependencies.** pgvector is enabled at the database level (extension), not via npm. Zod and date-fns are already in `package.json`.

If any of these should have been a question, tell me and I'll revise.
