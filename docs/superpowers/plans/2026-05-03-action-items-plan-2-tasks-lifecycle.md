# Action Items — Plan 2 (rev 2026-05-03b): Tasks Lifecycle + Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (rev 2026-05-03b — read the changelog first).
**Predecessor:** `docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md` (rev b, committed). Migration 102 (corrected), constants, types, and `canSeeTask` are assumed live and imported from `@/lib/action-items/...`.

**Goal:** Extend the existing Tasks/War Room module to carry the closure-and-verification flow defined by the spec. Owners can self-close (with one-line completion note) → `awaiting_verification`; DG can one-tap **Confirm** → `done`, or **Dispute** → back to `active` with a logged note + push to owner; owners can re-attempt completion or push back via comment which surfaces in DG's verification queue. Bulk-close extends the existing bulk PATCH to handle the new status. A verification surface (top section of War Room when viewer is DG) renders both queues. Validation runs on the task-creation and task-update paths. The inline manual-add component used by Plan 4's review queue is built and unit-tested but not wired anywhere in this plan.

**Architecture:** A small migration amendment (in-place edit of migration 102) widens `tasks.source_meeting_id` from UUID to TEXT so Fireflies meeting IDs land cleanly. A pure-logic validation module is built first (TDD), then the events log helper, then four lifecycle route handlers under `/api/tasks/[id]/{complete,verify,dispute,pushback}/route.ts`. The existing PATCH route's status enum is widened. The bulk PATCH endpoint gains a code path that closes `awaiting_verification` rows with `verified_by`/`verified_at` set. New components mount above the existing Kanban board on `/tasks` when the viewer is DG. The provenance badge is a non-invasive addition to the existing task card.

**Tech Stack:** Next.js 16 App Router, Supabase JS (`supabaseAdmin` from `lib/db.ts`), Zod, Vitest, Tailwind v4, existing notifications stack (`insertNotification` from `lib/notifications.ts`).

---

## Conventions for this plan

- **Tests live in** `lib/__tests__/`. Pure-logic modules (validation, formatting helpers) are TDD: failing test first, then implementation. Route handlers and components are exercised end-to-end in Task 9, not unit-tested.
- **Auth on every route:** route handlers call `requireRole([...])` at the top. Lifecycle endpoints scope by ownership/role (owner-only for `/complete` and `/pushback`; DG-only for `/verify` and `/dispute`). The existing `/api/tasks/*` route handlers continue to enforce app-layer permissions (RLS was disabled in Plan 1's migration 102 in favor of app-layer guards, consistent with the rest of DGOS).
- **Status state machine:** the only valid transitions touched by this plan are
  - `new|active → awaiting_verification` (owner self-close, sets `completion_note`, `completed_by`, `completed_at`),
  - `awaiting_verification → done` (DG verify or DG bulk-close, sets `verified_by`, `verified_at`),
  - `awaiting_verification → active` (DG dispute, sets `dispute_note`, `disputed_at`, clears `completed_*` from the live row — preserved in events).
  All other status transitions remain governed by the existing `app/api/tasks/[id]/route.ts` PATCH handler. Direct `PATCH status=awaiting_verification` and `PATCH status=done` from `awaiting_verification` are blocked by the PATCH handler — clients are forced through the lifecycle endpoints so the side-effect bookkeeping (notes, notifications, events) cannot be skipped.
- **Validation policy** (per spec §6.1 + the prompt's "regardless of source" instruction): banned-phrase and required-field checks are hard-blocked for **both** sources (manual and extraction). Verb-taxonomy is hard-blocked only when `verb_category` is set, which it always is for extraction and is optional for manual tasks (the existing War Room Add Task form does not collect it). This keeps existing War Room flows working while enforcing the substantive checks across the board. Documented as autonomous decision below.
- **Events log:** every status change writes a row to `action_item_events` via `logEvent()`. Writes happen *after* the live row update so a failed event-write leaves the live row consistent. Event-write failures are logged, not user-blocking.
- **Notifications:** dispute notifies the owner; pushback notifies all active DG users. Use `insertNotification` from `lib/notifications.ts` with `type='task_disputed'` / `type='task_pushback'`. Push delivery failures are logged, not user-blocking. (`insertNotification` already throws `NotificationDeliveryError` on preference-lookup failures; lifecycle endpoints catch and continue.)
- **Component placement:** the verification surface lives at the top of War Room (`/tasks`) for DG viewers — autonomous decision, rationale below. Mission Control was the alternate option in the prompt; War Room won because the canonical commitment surface should be the single destination.
- **Type safety:** every Supabase row read goes through `as TaskWithExtensions` (or the appropriate row type from `@/lib/action-items/types`) at the boundary; downstream code stays typed.
- **Commits:** small, frequent. `feat:`, `test:`, `refactor:`, `docs:`. Type-check (`npx tsc --noEmit`) passes before each commit.
- **No AI, no Fireflies, no extraction** code in this plan. `source='extraction'` writes are anticipated but never executed — Plan 4 wires those.

---

## File map

**Modified — schema:**

- `supabase/migrations/102_action_items_v1.sql` — append a single `ALTER COLUMN tasks.source_meeting_id TYPE TEXT USING source_meeting_id::text` block, plus a comment justifying the widen.
- `supabase/migrations/102_action_items_v1.README.md` — add the new column type to the verification queries.

**Modified — existing API routes:**

- `app/api/tasks/[id]/route.ts` — widen the status enum on the zod schema to accept `awaiting_verification` and `superseded`; add a guard that rejects direct PATCH transitions through the lifecycle states (forces clients through the new endpoints).
- `app/api/tasks/route.ts` — call `validateTaskDraft` on POST before the insert; return structured 400 on validation failure.
- `app/api/tasks/bulk/route.ts` — widen the status enum; when `status='done'` and a target row's status is `awaiting_verification`, also set `verified_by` and `verified_at`; write `action_item_events` rows for the affected tasks.
- `lib/task-types.ts` — extend `TaskStatus` to include `awaiting_verification` and `superseded`; add the new lifecycle columns to `TASK_COLUMNS`.

**Created — lib (pure logic + data layer):**

- `lib/action-items/validation.ts` — `validateTaskDraft(draft)` returns `{ ok: true } | { ok: false, issues: ValidationIssue[] }`. Source-agnostic checks per the validation policy above.
- `lib/action-items/events.ts` — `logEvent({ taskId, eventType, actorId, payload })` insert helper.
- `lib/__tests__/action-items-validation.test.ts`
- `lib/__tests__/action-items-events.test.ts` (smoke; verifies the helper writes a row with the right shape)

**Created — lifecycle API:**

- `app/api/tasks/[id]/complete/route.ts` — `POST` owner self-close.
- `app/api/tasks/[id]/verify/route.ts` — `POST` DG one-tap confirm.
- `app/api/tasks/[id]/dispute/route.ts` — `POST` DG dispute (note ≥20 chars + push to owner).
- `app/api/tasks/[id]/pushback/route.ts` — `POST` owner pushback comment (≥20 chars + push to DG).

**Created — components:**

- `components/action-items/CompleteDialog.tsx` — modal for owner self-close.
- `components/action-items/DisputeDialog.tsx` — modal for DG dispute.
- `components/action-items/PushbackDialog.tsx` — modal for owner pushback.
- `components/action-items/VerificationSurface.tsx` — server component that fetches `awaiting_verification` items + pushback queue and renders both. DG-only; renders nothing for other roles.
- `components/action-items/VerificationQueueList.tsx` — client component, lists awaiting items, hosts Confirm/Dispute buttons.
- `components/action-items/PushbackQueueList.tsx` — client component, lists items in pushback state with side-by-side dispute_note + pushback comment.
- `components/action-items/SourceProvenanceBadge.tsx` — small badge shown on extracted tasks; expands on click to show source quote, meeting title, and a link.
- `components/action-items/InlineExtractionAddItem.tsx` — reusable controlled component used by Plan 4's review queue. Posts to `POST /api/tasks` with extraction-source defaults pre-filled. **Built but not wired in this plan.**

**Modified — components:**

- `app/tasks/page.tsx` — mount `<VerificationSurface />` above the Kanban board.
- `components/tasks/TaskCard.tsx` (or whichever component renders a task in the Kanban — confirmed by `grep` in Task 8) — render `<SourceProvenanceBadge>` when `task.source === 'extraction'`.

---

## Task 1: Migration 102 amendment — widen `tasks.source_meeting_id` to TEXT

**Files:**
- Modify: `supabase/migrations/102_action_items_v1.sql`
- Modify: `supabase/migrations/102_action_items_v1.README.md`

The existing `tasks.source_meeting_id` column was created by migration 022 as UUID and is currently used by the meetings module to soft-link tasks to meetings (UUIDs from the `meetings` table; no FK constraint). Fireflies meeting IDs are not UUIDs (e.g., `01HG5XYZ...`). Plan 1's autonomous decision #5 surfaced this for resolution here. Widening to TEXT via `ALTER COLUMN ... TYPE TEXT USING source_meeting_id::text` is backward-compatible (UUIDs cast losslessly to text; existing equality comparisons keep working since both sides are TEXT) and avoids a coordinated app-layer change.

This migration has not yet been executed against the live database (manual Dashboard execution model). Editing migration 102 in place is consistent with Plan 1's established pattern.

- [ ] **Step 1: Append the ALTER COLUMN block to the migration.**

Append, after the tasks-widening block (immediately before the `action_item_events` CREATE TABLE):

```sql
-- ----------------------------------------------------------------------------
-- Widen tasks.source_meeting_id from UUID to TEXT.
-- The existing column (migration 022) carries DGOS meeting UUIDs from the
-- meetings table — no FK constraint. Fireflies meeting IDs are not UUIDs.
-- Casting UUID → TEXT is lossless; existing equality comparisons continue to
-- work because both sides are now TEXT (the supabase JS client stringifies
-- UUIDs at the wire boundary regardless).
--
-- Idempotency: the type cast is a no-op when the column is already TEXT.
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks'
      AND column_name = 'source_meeting_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE tasks
      ALTER COLUMN source_meeting_id TYPE TEXT USING source_meeting_id::text;
  END IF;
END$$;

COMMENT ON COLUMN tasks.source_meeting_id IS
  'TEXT — carries DGOS meeting UUIDs (legacy) or Fireflies meeting IDs (extraction).';
```

Place the block **after** all of the tasks `ADD COLUMN` lines and the new `extraction_provenance_required` constraint, but **before** the `DROP POLICY tasks_access` block — the policy drop is the last statement of the tasks-widening section.

- [ ] **Step 2: Update the README verification queries.**

In `supabase/migrations/102_action_items_v1.README.md`, in the **Verification** section, append:

```sql
-- source_meeting_id widened to TEXT
SELECT data_type FROM information_schema.columns
WHERE table_name='tasks' AND column_name='source_meeting_id';
-- expected: text
```

- [ ] **Step 3: Sanity check.**

```bash
grep -n "source_meeting_id" supabase/migrations/102_action_items_v1.sql
```

Expected: at least two hits — the `ADD COLUMN IF NOT EXISTS` line is **gone** (it was a Plan 1 leftover that would have created a second column if 022's UUID column didn't exist; the in-place ALTER above replaces it), the `extraction_provenance_required` CHECK clause line, and the new `DO` block + `COMMENT`.

If the `ADD COLUMN IF NOT EXISTS source_meeting_id TEXT;` line from Plan 1 still exists, **delete it** — it's redundant once the ALTER COLUMN is in place. The column is guaranteed to exist (created by migration 022) and the type widen handles the UUID-to-TEXT migration.

- [ ] **Step 4: Commit.**

```bash
git add supabase/migrations/102_action_items_v1.sql supabase/migrations/102_action_items_v1.README.md
git commit -m "feat(action-items): widen tasks.source_meeting_id to TEXT for Fireflies IDs"
```

---

## Task 2: Validation module (TDD)

**Files:**
- Create: `lib/action-items/validation.ts`
- Create: `lib/__tests__/action-items-validation.test.ts`

Validation is the gate that runs on every accepted task — manual or extraction-sourced — so it must be pure, exhaustively tested, and have no DB dependencies. Resolution and confidence checks belong to Plan 4; this plan implements the source-agnostic checks per spec §6.1.

Per the validation policy in this plan's Conventions: banned phrases + required fields hard-block both sources; verb-taxonomy hard-blocks only when `verb_category` is set (manual tasks may omit it).

- [ ] **Step 1: Write the failing test.**

Create `lib/__tests__/action-items-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateTaskDraft, type TaskDraft } from '@/lib/action-items/validation';

const baseManual: TaskDraft = {
  source: 'manual',
  title: 'Issue notification of termination to InterEnergy',
  agency: 'GPL',
  owner_user_id: 'u-kesh',
  owner_name_raw: null,
  verb_category: null,
};

const baseExtraction: TaskDraft = {
  source: 'extraction',
  title: 'Issue notification of termination to InterEnergy',
  agency: 'GPL',
  owner_user_id: 'u-kesh',
  owner_name_raw: 'Kesh',
  verb_category: 'correspondence',
};

describe('validateTaskDraft', () => {
  it('accepts a clean manual task', () => {
    expect(validateTaskDraft(baseManual)).toEqual({ ok: true });
  });

  it('accepts a clean extraction task', () => {
    expect(validateTaskDraft(baseExtraction)).toEqual({ ok: true });
  });

  it('rejects empty title for both sources', () => {
    const m = validateTaskDraft({ ...baseManual, title: '' });
    const e = validateTaskDraft({ ...baseExtraction, title: '' });
    expect(m.ok).toBe(false);
    expect(e.ok).toBe(false);
  });

  it('rejects missing owner_user_id', () => {
    const r = validateTaskDraft({ ...baseManual, owner_user_id: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'owner_user_id')).toBe(true);
  });

  it('rejects missing agency', () => {
    const r = validateTaskDraft({ ...baseManual, agency: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'agency')).toBe(true);
  });

  it('rejects banned substring "follow up on" (case-insensitive)', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Follow up on the InterEnergy issue' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'banned_phrase')).toBe(true);
  });

  it('rejects banned token "handle" as whole word', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Handle the Berbice site' });
    expect(r.ok).toBe(false);
  });

  it('does NOT reject "handle" as a substring inside another sentence', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Investigate handle valves at Kingston substation' });
    expect(r.ok).toBe(true);
  });

  it('rejects banned token "work on"', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Work on the procurement schedule' });
    expect(r.ok).toBe(false);
  });

  it('skips verb-taxonomy check when verb_category is null (manual default)', () => {
    // "Approve" is a decision verb; verb_category is null — manual creates without
    // a category should not be blocked by taxonomy.
    const r = validateTaskDraft({ ...baseManual, title: 'Approve the InterEnergy contract' });
    expect(r.ok).toBe(true);
  });

  it('rejects verb-taxonomy mismatch when verb_category is set', () => {
    const r = validateTaskDraft({
      ...baseExtraction,
      verb_category: 'correspondence',
      title: 'Approve the InterEnergy contract',  // "approve" is decision
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'verb_taxonomy')).toBe(true);
  });

  it('accepts verb-taxonomy match when verb_category is set', () => {
    const r = validateTaskDraft({
      ...baseExtraction,
      verb_category: 'decision',
      title: 'Approve the InterEnergy contract',
    });
    expect(r.ok).toBe(true);
  });

  it('rejects title longer than 500 chars', () => {
    const r = validateTaskDraft({ ...baseManual, title: 'Issue ' + 'x'.repeat(600) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'title_too_long')).toBe(true);
  });

  it('extraction with missing owner_name_raw is rejected', () => {
    const r = validateTaskDraft({ ...baseExtraction, owner_name_raw: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'owner_name_raw')).toBe(true);
  });

  it('manual with missing owner_name_raw is accepted (extraction-only field)', () => {
    expect(validateTaskDraft(baseManual)).toEqual({ ok: true });
  });

  it('returns multiple issues at once', () => {
    const r = validateTaskDraft({
      ...baseManual,
      owner_user_id: null,
      agency: null,
      title: 'Follow up on stuff',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

```bash
npx vitest run lib/__tests__/action-items-validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `validation.ts`.**

```typescript
import {
  APPROVED_VERBS, BANNED_PHRASES,
  type VerbCategory,
} from './constants';

export interface TaskDraft {
  source: 'manual' | 'extraction';
  title: string;
  agency: string | null;
  owner_user_id: string | null;
  owner_name_raw: string | null;
  verb_category: VerbCategory | null;
}

export type ValidationIssueCode =
  | 'required'
  | 'title_too_long'
  | 'banned_phrase'
  | 'verb_taxonomy';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: 'title' | 'owner_user_id' | 'agency' | 'verb_category' | 'owner_name_raw';
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

// Whole-token banned verbs: rejected via word-boundary match so "handle valves"
// (noun) survives but "Handle the Berbice site" doesn't. Per Plan 1 decision #3.
const BANNED_TOKENS = ['handle', 'work on'];

export function validateTaskDraft(draft: TaskDraft): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!draft.title || draft.title.trim().length === 0) {
    issues.push({ code: 'required', field: 'title', message: 'Title is required.' });
  } else if (draft.title.length > 500) {
    issues.push({ code: 'title_too_long', field: 'title', message: 'Title must be ≤500 characters.' });
  }
  if (!draft.owner_user_id) {
    issues.push({ code: 'required', field: 'owner_user_id', message: 'Owner is required.' });
  }
  if (!draft.agency) {
    issues.push({ code: 'required', field: 'agency', message: 'Agency is required.' });
  }
  // owner_name_raw is required for extraction (the as-spoken name is provenance);
  // optional for manual (the existing Add Task form does not collect it).
  if (draft.source === 'extraction' && (!draft.owner_name_raw || draft.owner_name_raw.trim().length === 0)) {
    issues.push({ code: 'required', field: 'owner_name_raw', message: 'Owner name as spoken is required for extraction.' });
  }

  if (draft.title) {
    const lower = draft.title.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'banned_phrase', field: 'title',
          message: `Banned phrase "${phrase}" — rewrite with a specific deliverable.`,
        });
      }
    }
    for (const token of BANNED_TOKENS) {
      const re = new RegExp(`\\b${token.replace(/ /g, '\\s+')}\\b`, 'i');
      if (re.test(draft.title)) {
        issues.push({
          code: 'banned_phrase', field: 'title',
          message: `Banned verb "${token}" — rewrite with an approved verb and specific deliverable.`,
        });
      }
    }
  }

  // Verb taxonomy only checked when verb_category is set. Manual tasks may omit
  // it (existing War Room flow); extraction always sets it.
  if (draft.title && draft.verb_category) {
    const firstWord = draft.title.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    const allowed = APPROVED_VERBS[draft.verb_category];
    if (firstWord && allowed && !allowed.includes(firstWord)) {
      issues.push({
        code: 'verb_taxonomy', field: 'title',
        message: `First verb "${firstWord}" is not in category "${draft.verb_category}". Allowed: ${allowed.join(', ')}.`,
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
```

- [ ] **Step 4: Run the test.**

```bash
npx vitest run lib/__tests__/action-items-validation.test.ts
```

Expected: PASS, all 16 tests green.

- [ ] **Step 5: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/validation.ts lib/__tests__/action-items-validation.test.ts
git commit -m "feat(action-items): validateTaskDraft — banned phrases, verbs, required fields"
```

---

## Task 3: Events helper + extend existing PATCH/bulk-PATCH zod enums + task-types updates

**Files:**
- Create: `lib/action-items/events.ts`
- Create: `lib/__tests__/action-items-events.test.ts`
- Modify: `lib/task-types.ts`
- Modify: `app/api/tasks/[id]/route.ts`
- Modify: `app/api/tasks/bulk/route.ts`
- Modify: `app/api/tasks/route.ts` (validation hook on POST)

This task does plumbing in three places:

1. The events log helper (used by every lifecycle endpoint in Tasks 4–5 and by bulk-close in Task 6).
2. Updates to `lib/task-types.ts` so `TaskStatus` includes the two new values and `TASK_COLUMNS` selects the new lifecycle columns the UI surfaces will need.
3. Two existing PATCH endpoints accept the wider status enum, but reject *direct* transitions through the lifecycle states — clients must use `/api/tasks/[id]/{complete,verify,dispute}`. Bulk PATCH gets a controlled exception: it can transition `awaiting_verification → done` because that's exactly the spec's bulk-close path (§10.3).
4. The `POST /api/tasks` create path runs `validateTaskDraft` before insert.

- [ ] **Step 1: Create the events helper.**

`lib/action-items/events.ts`:

```typescript
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import type { EventType } from './constants';
import { logger } from '@/lib/logger';

export interface LogEventInput {
  taskId: string;
  eventType: EventType;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const { error } = await supabaseAdmin.from('action_item_events').insert({
    task_id: input.taskId,
    event_type: input.eventType,
    actor_id: input.actorId,
    payload: input.payload,
  });
  if (error) {
    logger.error({ err: error, taskId: input.taskId, eventType: input.eventType },
      'action_item_events insert failed');
  }
}
```

- [ ] **Step 2: Write a smoke test for the helper.**

`lib/__tests__/action-items-events.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import type { LogEventInput } from '@/lib/action-items/events';

// Mock supabase admin so the test runs without a live DB.
vi.mock('@/lib/db', () => {
  const insert = vi.fn(async () => ({ error: null }));
  return { supabaseAdmin: { from: () => ({ insert }) }, __mocks: { insert } };
});

describe('logEvent', () => {
  it('inserts a row with task_id (not item_id)', async () => {
    const { logEvent } = await import('@/lib/action-items/events');
    const dbMod = await import('@/lib/db') as unknown as { __mocks: { insert: ReturnType<typeof vi.fn> } };

    const input: LogEventInput = {
      taskId: 't-1', eventType: 'status_change',
      actorId: 'u-dg', payload: { from: 'new', to: 'awaiting_verification' },
    };
    await logEvent(input);

    expect(dbMod.__mocks.insert).toHaveBeenCalledWith({
      task_id: 't-1',
      event_type: 'status_change',
      actor_id: 'u-dg',
      payload: { from: 'new', to: 'awaiting_verification' },
    });
  });
});
```

Run:

```bash
npx vitest run lib/__tests__/action-items-events.test.ts
```

Expected: PASS.

- [ ] **Step 3: Widen `TaskStatus` and `TASK_COLUMNS` in `lib/task-types.ts`.**

In `lib/task-types.ts`:

Replace:

```typescript
export type TaskStatus = 'new' | 'active' | 'blocked' | 'done';
```

with:

```typescript
export type TaskStatus = 'new' | 'active' | 'blocked' | 'done' | 'awaiting_verification' | 'superseded';
```

Replace the `TASK_COLUMNS` constant to add the new lifecycle and provenance columns the UI will read:

```typescript
export const TASK_COLUMNS = 'id, title, description, status, priority, due_date, agency, role, owner_user_id, assigned_by_user_id, source_meeting_id, blocked_reason, completed_at, created_at, updated_at, source, extraction_id, source_quote, source_timestamp, owner_name_raw, delegated_to_id, verb_category, completion_note, completed_by, verified_by, verified_at, dispute_note, disputed_at, supersedes_id, visibility_scope, confidence_overall';
```

Update the `Task` interface to include matching nullable fields:

```typescript
export interface Task {
  // existing fields unchanged
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  due_date: string | null;
  agency: string | null;
  role: string | null;
  blocked_reason: string | null;
  completed_at: string | null;
  owner_user_id: string;
  owner_name_raw: string | null;
  assigned_by_user_id: string | null;
  source_meeting_id: string | null;
  created_at: string;
  updated_at: string;
  // new from migration 102
  source: 'manual' | 'extraction';
  extraction_id: string | null;
  source_quote: string | null;
  source_timestamp: string | null;
  delegated_to_id: string | null;
  verb_category: 'correspondence' | 'decision' | 'information' | 'scheduling' | 'project_update' | 'analysis' | null;
  completion_note: string | null;
  completed_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  dispute_note: string | null;
  disputed_at: string | null;
  supersedes_id: string | null;
  visibility_scope: 'agency_normal' | 'dg_only';
  confidence_overall: number | null;
  // owner_name comes from join (existing flatten helper)
  owner_name: string | null;
}
```

- [ ] **Step 4: Widen the PATCH zod enum in `app/api/tasks/[id]/route.ts`.**

Replace:

```typescript
status: z.enum(['new', 'active', 'blocked', 'done']).optional(),
```

with:

```typescript
status: z.enum(['new', 'active', 'blocked', 'done', 'awaiting_verification', 'superseded']).optional(),
```

Then immediately after the existing `if (!task) ...` 404 guard, add a guard that forces clients through the lifecycle endpoints:

```typescript
// Lifecycle states are managed by /api/tasks/[id]/{complete,verify,dispute}.
// Direct PATCH transitions through them are blocked so the side-effect
// bookkeeping (notes, notifications, events) cannot be skipped.
if (data.status !== undefined) {
  const tryingToEnterLifecycle = data.status === 'awaiting_verification';
  const tryingToLeaveLifecycle = task.status === 'awaiting_verification' && data.status !== 'awaiting_verification';
  if (tryingToEnterLifecycle || tryingToLeaveLifecycle) {
    return apiError(
      'INVALID_TRANSITION',
      'Use /api/tasks/[id]/{complete,verify,dispute} for verification-flow transitions.',
      409,
    );
  }
}
```

- [ ] **Step 5: Widen the bulk PATCH zod enum and add the `awaiting_verification → done` path.**

In `app/api/tasks/bulk/route.ts`, replace the `status` enum:

```typescript
status: z.enum(['new', 'active', 'blocked', 'done', 'awaiting_verification', 'superseded']).optional(),
```

The existing handler already sets `completed_at` when status='done'. Add (right after the existing `completed_at` assignment for done):

```typescript
if (data.updates.status === 'done') {
  // For tasks already in awaiting_verification, the bulk close also stamps
  // verification fields per spec §10.3 — DG-direct close skips the round-trip.
  updatePayload.verified_by = session.user.id;
  updatePayload.verified_at = new Date().toISOString();
}
```

…where `session` is obtained from the existing `requireRole` result. (The current handler already destructures `result`; if it doesn't expose `session`, adjust to `const { session } = result;` after the auth check.)

After the existing bulk update, append an event-write loop (this requires importing `logEvent`):

```typescript
// Log status changes to action_item_events. Best-effort; failures are not fatal.
if (data.updates.status !== undefined) {
  const { logEvent } = await import('@/lib/action-items/events');
  for (const id of data.taskIds) {
    await logEvent({
      taskId: id, eventType: 'status_change', actorId: session.user.id,
      payload: { to: data.updates.status, via: 'bulk' },
    });
  }
}
```

- [ ] **Step 6: Hook validation into POST `/api/tasks/route.ts`.**

In the POST handler, immediately before the Supabase `insert` call:

```typescript
const { validateTaskDraft } = await import('@/lib/action-items/validation');
const v = validateTaskDraft({
  source: 'manual',  // POST /api/tasks is the manual-create path; extraction inserts use the same endpoint with source='extraction' set explicitly
  title: data.title,
  agency: data.agency ?? null,
  owner_user_id: ownerId,
  owner_name_raw: null,
  verb_category: null,
});
if (!v.ok) {
  return NextResponse.json({ error: 'Validation failed', issues: v.issues }, { status: 400 });
}
```

Where `ownerId` is the resolved owner from the existing handler. If the handler doesn't resolve owner before insert, run validation against the raw input instead.

The PATCH handler does **not** run validation in this plan — the existing 93 manual tasks have been editable forever and adding validation to PATCH would block edits on rows that violate a banned-phrase check. (Future plans can tighten this by adding a `validate=true` query param.)

- [ ] **Step 7: Type-check + run all tests.**

```bash
npx tsc --noEmit && npm test
```

Expected: clean.

- [ ] **Step 8: Commit.**

```bash
git add lib/action-items/events.ts lib/__tests__/action-items-events.test.ts lib/task-types.ts app/api/tasks/[id]/route.ts app/api/tasks/bulk/route.ts app/api/tasks/route.ts
git commit -m "feat(action-items): events helper + widen task statuses + validation hook"
```

---

## Task 4: Lifecycle API — `/complete` and `/verify`

**Files:**
- Create: `app/api/tasks/[id]/complete/route.ts`
- Create: `app/api/tasks/[id]/verify/route.ts`

- [ ] **Step 1: `POST /api/tasks/[id]/complete` — owner self-close.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

const BodyZ = z.object({ note: z.string().min(10).max(500) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 10–500 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, owner_user_id, status').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // dg_managed users (Minister, PS, parl_sec, President) cannot self-close (spec §10.4).
  const { data: owner } = await supabaseAdmin
    .from('users').select('closure_mode').eq('id', task.owner_user_id).maybeSingle();
  if (owner?.closure_mode === 'dg_managed') {
    return NextResponse.json({ error: 'This task is DG-managed; only DG can close it.' }, { status: 403 });
  }

  if (task.owner_user_id !== session.user.id) {
    return NextResponse.json({ error: 'Not your task' }, { status: 403 });
  }
  if (!['new', 'active'].includes(task.status as string)) {
    return NextResponse.json({ error: `Cannot complete from status "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'awaiting_verification',
      completed_by: session.user.id,
      completed_at: now,
      completion_note: parsed.data.note,
      // Re-attempt after a dispute clears the dispute markers (history preserved in events).
      dispute_note: null,
      disputed_at: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    taskId: id, eventType: 'status_change', actorId: session.user.id,
    payload: { from: task.status, to: 'awaiting_verification', via: 'owner_self_close', completion_note: parsed.data.note },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `POST /api/tasks/[id]/verify` — DG one-tap confirm.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, status').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot verify from "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'done',
      verified_by: auth.session.user.id,
      verified_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  await logEvent({
    taskId: id, eventType: 'status_change', actorId: auth.session.user.id,
    payload: { from: 'awaiting_verification', to: 'done', via: 'dg_verify' },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add 'app/api/tasks/[id]/complete/route.ts' 'app/api/tasks/[id]/verify/route.ts'
git commit -m "feat(action-items): /complete (owner self-close) + /verify (DG confirm) routes"
```

---

## Task 5: Lifecycle API — `/dispute` and `/pushback`

**Files:**
- Create: `app/api/tasks/[id]/dispute/route.ts`
- Create: `app/api/tasks/[id]/pushback/route.ts`

Both endpoints write events and queue a notification. Notification failures are non-fatal.

- [ ] **Step 1: `POST /api/tasks/[id]/dispute` — DG dispute, ≥20 chars + push to owner.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const BodyZ = z.object({ note: z.string().min(20).max(1000) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 20–1000 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('id, status, owner_user_id, title, completion_note, completed_at')
    .eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot dispute from "${task.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('tasks')
    .update({
      status: 'active',
      dispute_note: parsed.data.note,
      disputed_at: now,
      // Per spec §10.5 step 3: clear completion fields from live row (preserved in event).
      completed_by: null, completed_at: null, completion_note: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    taskId: id, eventType: 'dispute_raised', actorId: auth.session.user.id,
    payload: {
      completion_note: task.completion_note,
      dispute_note: parsed.data.note,
      prior_completed_at: task.completed_at,
    },
  });

  try {
    const titleShort = (task.title as string).slice(0, 60);
    await insertNotification({
      user_id: task.owner_user_id as string,
      type: 'task_disputed',
      title: `Task disputed: ${titleShort}`,
      body: parsed.data.note.slice(0, 120),
      icon: null,
      priority: 'high',
      reference_type: 'task',
      reference_id: id,
      reference_url: `/tasks?focus=${id}`,
      scheduled_for: now,
      category: 'tasks',
      source_module: 'action-items',
      action_required: true,
      actor_id: auth.session.user.id,
      event_type: 'task_disputed',
      importance_tier: 'critical',
      entity_type: 'task',
      entity_id: id,
    });
  } catch (err) {
    logger.error({ err, taskId: id }, 'dispute notification failed (non-fatal)');
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `POST /api/tasks/[id]/pushback` — owner pushback comment, ≥20 chars + push to DG.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';
import { insertNotification } from '@/lib/notifications';
import { logger } from '@/lib/logger';

const BodyZ = z.object({ text: z.string().min(20).max(1000) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Comment must be 20–1000 chars' }, { status: 400 });

  const { data: task } = await supabaseAdmin
    .from('tasks').select('id, status, owner_user_id, dispute_note, title').eq('id', id).maybeSingle();
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (task.owner_user_id !== session.user.id) return NextResponse.json({ error: 'Not your task' }, { status: 403 });
  if (task.status !== 'active' || !task.dispute_note) {
    return NextResponse.json({ error: 'Task is not in a disputed state' }, { status: 409 });
  }

  // Pushback only logs an event (spec §10.5 owner option B). No live-row mutation.
  await logEvent({
    taskId: id, eventType: 'dispute_resolved', actorId: session.user.id,
    payload: { action: 'pushback', text: parsed.data.text },
  });

  const { data: dgUsers } = await supabaseAdmin
    .from('users').select('id').eq('role', 'dg').eq('is_active', true);
  const now = new Date().toISOString();
  for (const dg of dgUsers ?? []) {
    try {
      await insertNotification({
        user_id: dg.id as string,
        type: 'task_pushback',
        title: `Pushback: ${(task.title as string).slice(0, 60)}`,
        body: parsed.data.text.slice(0, 120),
        icon: null,
        priority: 'high',
        reference_type: 'task',
        reference_id: id,
        reference_url: `/tasks?focus=${id}`,
        scheduled_for: now,
        category: 'tasks',
        source_module: 'action-items',
        action_required: true,
        actor_id: session.user.id,
        event_type: 'task_pushback',
        importance_tier: 'important',
        entity_type: 'task',
        entity_id: id,
      });
    } catch (err) {
      logger.error({ err, taskId: id, dg: dg.id }, 'pushback notification failed (non-fatal)');
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add 'app/api/tasks/[id]/dispute/route.ts' 'app/api/tasks/[id]/pushback/route.ts'
git commit -m "feat(action-items): /dispute + /pushback routes with notifications"
```

> **Compatibility note for the agent:** `insertNotification` accepts a richer object than other DGOS notification helpers; the call shape above matches the type in `lib/notifications.ts:194`. If a particular field is rejected at runtime (older notifications schema), fall back to setting `event_type: undefined` and `importance_tier: undefined` — both are optional in the type.

---

## Task 6: Verification surface — components + War Room embed

**Files:**
- Create: `components/action-items/CompleteDialog.tsx`
- Create: `components/action-items/DisputeDialog.tsx`
- Create: `components/action-items/PushbackDialog.tsx`
- Create: `components/action-items/VerificationSurface.tsx`
- Create: `components/action-items/VerificationQueueList.tsx`
- Create: `components/action-items/PushbackQueueList.tsx`
- Modify: `app/tasks/page.tsx`

The verification surface lives at the top of War Room when the viewer is DG. Two queues: (1) `awaiting_verification` items with one-tap Confirm and Dispute, (2) tasks in pushback state — `status='active'` with non-null `dispute_note` and a most-recent `dispute_resolved` event whose payload `action='pushback'` — with the original dispute_note and pushback comment side-by-side. Non-DG viewers see nothing — the surface returns `null`.

Pushback identification rule: a task is "in pushback awaiting DG attention" iff
- `tasks.status = 'active'` AND
- `tasks.dispute_note IS NOT NULL` AND
- the most recent `action_item_events` row for the task with `event_type='dispute_resolved'` has `payload.action='pushback'` AND
- there is no later `event_type='dispute_raised'` for the same task.

This is the same logic the deleted Plan 2 used; implemented here as a single function in `VerificationSurface.tsx` since it's the only call site in this plan.

- [ ] **Step 1: Dialogs.**

`components/action-items/CompleteDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function CompleteDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Mark complete" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Completion note (≥10 chars). DG verifies before close.</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || note.trim().length < 10}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/complete`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ note }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Submit</button>
      </div>
    </Modal>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-navy-900 border border-navy-800 rounded-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg mb-2 text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

`components/action-items/DisputeDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Modal } from './CompleteDialog';

export function DisputeDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Dispute completion" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Substantive reason (≥20 chars). Owner is notified and can re-attempt or push back.</p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || note.trim().length < 20}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/dispute`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ note }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Dispute</button>
      </div>
    </Modal>
  );
}
```

`components/action-items/PushbackDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Modal } from './CompleteDialog';

export function PushbackDialog({ taskId, onClose, onDone }: { taskId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Push back on dispute" onClose={onClose}>
      <p className="text-sm text-navy-600 mb-2">Comment (≥20 chars). Task stays open. DG sees this in their verification queue.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3}
        className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      {err && <div className="text-xs text-red-500 mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="px-3 py-1.5 text-xs border border-navy-800 rounded">Cancel</button>
        <button
          disabled={busy || text.trim().length < 20}
          className="px-3 py-1.5 text-xs bg-gold-500 text-navy-950 rounded disabled:opacity-50"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/tasks/${taskId}/pushback`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ text }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>Send</button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: `VerificationQueueList.tsx`.**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DisputeDialog } from './DisputeDialog';

export interface AwaitingItem {
  id: string;
  title: string;
  agency: string | null;
  owner_name: string | null;
  completion_note: string | null;
  completed_at: string | null;
}

export function VerificationQueueList({ items }: { items: AwaitingItem[] }) {
  const router = useRouter();
  const [disputeId, setDisputeId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">
        Awaiting your verification <span className="text-xs text-navy-600">({items.length})</span>
      </h2>
      {items.map(it => (
        <div key={it.id} className="bg-navy-900 border border-navy-800 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="text-xs text-navy-600 mb-1">{it.agency ?? '—'} · {it.owner_name ?? '(unknown)'}</div>
              <div className="text-sm text-white">{it.title}</div>
              {it.completion_note && (
                <div className="text-xs mt-1 border-l-2 border-gold-500 pl-2 text-navy-300">
                  Owner says: {it.completion_note}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <button
                className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded"
                onClick={async () => {
                  await fetch(`/api/tasks/${it.id}/verify`, { method: 'POST' });
                  router.refresh();
                }}>
                Confirm
              </button>
              <button
                className="px-2 py-1 text-xs border border-navy-800 rounded"
                onClick={() => setDisputeId(it.id)}>
                Dispute
              </button>
            </div>
          </div>
        </div>
      ))}
      {disputeId && (
        <DisputeDialog
          taskId={disputeId}
          onClose={() => setDisputeId(null)}
          onDone={() => { setDisputeId(null); router.refresh(); }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: `PushbackQueueList.tsx`.**

```tsx
'use client';
import { useRouter } from 'next/navigation';

export interface PushbackEntry {
  id: string;
  title: string;
  agency: string | null;
  owner_name: string | null;
  dispute_note: string;
  pushback_text: string;
  pushback_at: string;
}

export function PushbackQueueList({ items }: { items: PushbackEntry[] }) {
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2 mt-4">
      <h2 className="text-base font-semibold text-white">
        Pushbacks needing your attention <span className="text-xs text-navy-600">({items.length})</span>
      </h2>
      {items.map(p => (
        <div key={p.id} className="bg-navy-900 border border-gold-500/40 rounded-lg p-3">
          <div className="text-xs text-navy-600 mb-1">{p.agency ?? '—'} · {p.owner_name ?? '(unknown)'}</div>
          <div className="text-sm text-white mb-2">{p.title}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="border-l-2 border-red-500 pl-2">
              <div className="uppercase text-navy-600 mb-0.5">Your dispute</div>
              <div>{p.dispute_note}</div>
            </div>
            <div className="border-l-2 border-gold-500 pl-2">
              <div className="uppercase text-navy-600 mb-0.5">Owner pushback</div>
              <div>{p.pushback_text}</div>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              className="px-2 py-1 text-xs bg-gold-500 text-navy-950 rounded"
              onClick={async () => {
                // Accept pushback = bulk-close shortcut (treated as DG-direct close per spec §10.5).
                await fetch('/api/tasks/bulk', {
                  method: 'PATCH', headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ taskIds: [p.id], updates: { status: 'done' } }),
                });
                router.refresh();
              }}>
              Accept (mark done)
            </button>
            <a href={`/tasks?focus=${p.id}`} className="px-2 py-1 text-xs border border-navy-800 rounded">
              Open task
            </a>
          </div>
        </div>
      ))}
    </section>
  );
}
```

> **Note on "re-affirm dispute":** spec §10.5 lets DG re-fire the dispute on a re-completed task. There is no dedicated re-affirm action here — when the owner re-completes (status returns to `awaiting_verification`), the item appears again in `VerificationQueueList` and DG presses Dispute again, which appends another `dispute_raised` event. Reuses the existing flow.

- [ ] **Step 4: `VerificationSurface.tsx` (server component).**

```tsx
import 'server-only';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { VerificationQueueList, type AwaitingItem } from './VerificationQueueList';
import { PushbackQueueList, type PushbackEntry } from './PushbackQueueList';

export async function VerificationSurface() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== 'dg') return null;

  // 1) awaiting_verification items
  const { data: awaitingRaw } = await supabaseAdmin
    .from('tasks')
    .select('id, title, agency, owner_user_id, completion_note, completed_at, owner:users!owner_user_id(name)')
    .eq('status', 'awaiting_verification')
    .order('completed_at', { ascending: true })
    .limit(50);

  const awaiting: AwaitingItem[] = (awaitingRaw ?? []).map(r => ({
    id: r.id as string, title: r.title as string, agency: r.agency as string | null,
    owner_name: ((r as Record<string, unknown>).owner as { name?: string } | null)?.name ?? null,
    completion_note: r.completion_note as string | null,
    completed_at: r.completed_at as string | null,
  }));

  // 2) pushback queue: status='active' AND dispute_note IS NOT NULL,
  //    most recent dispute_resolved event has payload.action='pushback' AND
  //    no later dispute_raised event.
  const { data: candidates } = await supabaseAdmin
    .from('tasks')
    .select('id, title, agency, dispute_note, owner:users!owner_user_id(name)')
    .eq('status', 'active')
    .not('dispute_note', 'is', null)
    .limit(100);

  const ids = (candidates ?? []).map(c => c.id as string);
  const pushbacks: PushbackEntry[] = [];
  if (ids.length > 0) {
    const { data: events } = await supabaseAdmin
      .from('action_item_events')
      .select('task_id, event_type, payload, occurred_at')
      .in('task_id', ids)
      .order('occurred_at', { ascending: false });

    const latestDisputeRaised = new Map<string, string>();
    const latestPushback = new Map<string, { ts: string; text: string }>();
    for (const e of (events ?? []) as Array<{ task_id: string; event_type: string; payload: { action?: string; text?: string }; occurred_at: string }>) {
      if (e.event_type === 'dispute_raised') {
        const cur = latestDisputeRaised.get(e.task_id);
        if (!cur || cur < e.occurred_at) latestDisputeRaised.set(e.task_id, e.occurred_at);
      } else if (e.event_type === 'dispute_resolved' && e.payload?.action === 'pushback') {
        const cur = latestPushback.get(e.task_id);
        if (!cur || cur.ts < e.occurred_at) latestPushback.set(e.task_id, { ts: e.occurred_at, text: e.payload.text ?? '' });
      }
    }

    for (const c of candidates ?? []) {
      const id = c.id as string;
      const pb = latestPushback.get(id);
      if (!pb) continue;
      const redispute = latestDisputeRaised.get(id);
      if (redispute && redispute > pb.ts) continue;  // re-disputed since pushback; not pending
      pushbacks.push({
        id, title: c.title as string, agency: c.agency as string | null,
        owner_name: ((c as Record<string, unknown>).owner as { name?: string } | null)?.name ?? null,
        dispute_note: c.dispute_note as string,
        pushback_text: pb.text,
        pushback_at: pb.ts,
      });
    }
  }

  if (awaiting.length === 0 && pushbacks.length === 0) return null;

  return (
    <div className="bg-navy-900/50 border border-gold-500/30 rounded-xl p-4 space-y-4">
      <VerificationQueueList items={awaiting} />
      <PushbackQueueList items={pushbacks} />
    </div>
  );
}
```

- [ ] **Step 5: Mount the surface in `app/tasks/page.tsx`.**

The current page is a client component (`'use client';` at top). Wrap or restructure so `<VerificationSurface />` (a server component) can render. The cleanest approach: split the page into a thin server component that renders the surface plus the existing client `<KanbanBoard />` below.

Replace `app/tasks/page.tsx`:

```tsx
import Link from 'next/link';
import { ArrowLeft, CheckSquare } from 'lucide-react';
import { KanbanBoard } from '@/components/tasks/KanbanBoard';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { VerificationSurface } from '@/components/action-items/VerificationSurface';

export default async function TasksPage() {
  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center flex-wrap gap-3 md:gap-4">
        <Link href="/" className="p-2 rounded-lg text-navy-600 hover:text-white hover:bg-navy-900 transition-colors touch-active" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gold-500/20 flex items-center justify-center">
            <CheckSquare className="h-4 w-4 md:h-5 md:w-5 text-gold-500" />
          </div>
          <div>
            <h1 className="text-lg md:text-xl font-bold text-white">War Room</h1>
            <p className="text-xs md:text-sm text-navy-600">Task management</p>
          </div>
        </div>
      </div>

      {/* DG-only verification surface; renders null for other roles */}
      <VerificationSurface />

      <ErrorBoundary>
        <KanbanBoard />
      </ErrorBoundary>
    </div>
  );
}
```

- [ ] **Step 6: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/CompleteDialog.tsx components/action-items/DisputeDialog.tsx components/action-items/PushbackDialog.tsx components/action-items/VerificationQueueList.tsx components/action-items/PushbackQueueList.tsx components/action-items/VerificationSurface.tsx app/tasks/page.tsx
git commit -m "feat(action-items): verification + pushback surface mounted in War Room"
```

---

## Task 7: InlineExtractionAddItem component (built, not wired)

**Files:**
- Create: `components/action-items/InlineExtractionAddItem.tsx`

A reusable controlled component used by Plan 4's review queue. Wraps `POST /api/tasks` with extraction-source defaults pre-filled. The form collects the same canonical fields the existing Add Task form does, plus the four extraction-source provenance fields (`extraction_id`, `source_meeting_id`, `source_timestamp`, `source_quote`). The `verb_category` field is exposed as a dropdown so the validator can run end-to-end.

This component is **not rendered anywhere in Plan 2.** Plan 4 wires it inside the review queue.

- [ ] **Step 1: Implement.**

```tsx
'use client';
import { useState, type FormEvent } from 'react';
import { VERB_CATEGORIES, AGENCIES, type VerbCategory, type Agency } from '@/lib/action-items/constants';

interface UserOption { id: string; name: string; agency: string | null; }

export interface InlineExtractionDefaults {
  extraction_id: string;            // required for source='extraction'
  extraction_item_idx: number;      // required for source='extraction'
  source_meeting_id: string;        // Fireflies meeting id
  source_timestamp?: string;
  source_quote?: string;
  agency?: Agency;
  owner_user_id?: string;
  owner_name_raw?: string;
  verb_category?: VerbCategory;
  title?: string;
  description?: string;
  due_date?: string;
  confidence_overall?: number;
}

interface Props {
  defaults: InlineExtractionDefaults;
  ownerOptions: UserOption[];
  onCreated: (taskId: string) => void;
  onCancel?: () => void;
}

export function InlineExtractionAddItem({ defaults, ownerOptions, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    agency: (defaults.agency ?? '') as Agency | '',
    owner_user_id: defaults.owner_user_id ?? '',
    owner_name_raw: defaults.owner_name_raw ?? '',
    verb_category: (defaults.verb_category ?? '') as VerbCategory | '',
    title: defaults.title ?? '',
    description: defaults.description ?? '',
    due_date: defaults.due_date ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [topErr, setTopErr] = useState<string | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(s => ({ ...s, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTopErr(null); setIssues({});
    setBusy(true);
    const res = await fetch('/api/tasks', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: form.title,
        description: form.description || null,
        agency: form.agency || null,
        assignee_id: form.owner_user_id || undefined,
        due_date: form.due_date || undefined,
        // extraction provenance
        source: 'extraction',
        extraction_id: defaults.extraction_id,
        extraction_item_idx: defaults.extraction_item_idx,
        source_meeting_id: defaults.source_meeting_id,
        source_timestamp: defaults.source_timestamp ?? null,
        source_quote: defaults.source_quote ?? null,
        owner_name_raw: form.owner_name_raw,
        verb_category: form.verb_category || null,
        confidence_overall: defaults.confidence_overall ?? 1.0,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setTopErr(body.error ?? 'Failed');
      const map: Record<string, string> = {};
      for (const it of body.issues ?? []) map[it.field] = it.message;
      setIssues(map);
      return;
    }
    const { task } = await res.json();
    onCreated(task?.id ?? '');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {topErr && <div className="text-xs text-red-500">{topErr}</div>}
      <Field label="Title" error={issues.title}>
        <textarea required maxLength={500} rows={2} value={form.title}
          onChange={e => set('title', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-3 py-2 text-sm" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Agency" error={issues.agency}>
          <select required value={form.agency} onChange={e => set('agency', e.target.value as Agency)}
            className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
            <option value="">Select…</option>
            {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Verb category" error={issues.verb_category}>
          <select required value={form.verb_category} onChange={e => set('verb_category', e.target.value as VerbCategory)}
            className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
            <option value="">Select…</option>
            {VERB_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Owner" error={issues.owner_user_id}>
        <select required value={form.owner_user_id} onChange={e => set('owner_user_id', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm">
          <option value="">Select…</option>
          {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}{o.agency ? ` (${o.agency})` : ''}</option>)}
        </select>
      </Field>
      <Field label="Owner name (as spoken)" error={issues.owner_name_raw}>
        <input required value={form.owner_name_raw} onChange={e => set('owner_name_raw', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm" />
      </Field>
      <Field label="Due date">
        <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)}
          className="w-full bg-navy-900 border border-navy-800 rounded px-2 py-1 text-sm" />
      </Field>
      {defaults.source_quote && (
        <div className="text-xs border-l-2 border-gold-500 pl-2 italic text-navy-300">
          “{defaults.source_quote}”
          {defaults.source_timestamp && <span className="text-navy-600"> @ {defaults.source_timestamp}</span>}
        </div>
      )}
      <div className="flex gap-2 justify-end">
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1 text-xs border border-navy-800 rounded">Cancel</button>}
        <button type="submit" disabled={busy} className="px-3 py-1 text-xs bg-gold-500 text-navy-950 rounded">
          {busy ? 'Saving…' : 'Add to bucket'}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-navy-600 mb-0.5">{label}</span>
      {children}
      {error && <span className="block text-xs text-red-500 mt-0.5">{error}</span>}
    </label>
  );
}
```

> **Compatibility note:** the existing `POST /api/tasks` zod schema does not yet accept the extraction-provenance fields (`extraction_id`, `extraction_item_idx`, `source_quote`, `source_timestamp`, `owner_name_raw`, `verb_category`, `confidence_overall`). Plan 4 widens the schema and wires the insert. In Plan 2, this component is built but unwired — it will return a 400 if invoked end-to-end against the current API. That's fine: Plan 2's smoke test exercises the verification flow on manually-created tasks only.

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/InlineExtractionAddItem.tsx
git commit -m "feat(action-items): InlineExtractionAddItem reusable component (unwired)"
```

---

## Task 8: Source provenance badge in the existing task list

**Files:**
- Create: `components/action-items/SourceProvenanceBadge.tsx`
- Modify: the existing task-card component (find via grep)

A small badge that renders next to the task title when `task.source === 'extraction'`. Click expands a popover showing the source quote, timestamp, and a link to the meetings list (Plan 3) or the source meeting if available.

- [ ] **Step 1: Implement the badge.**

```tsx
'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';

export interface ProvenanceProps {
  source: 'manual' | 'extraction';
  source_meeting_id: string | null;
  source_timestamp: string | null;
  source_quote: string | null;
}

export function SourceProvenanceBadge({ source, source_meeting_id, source_timestamp, source_quote }: ProvenanceProps) {
  const [open, setOpen] = useState(false);
  if (source !== 'extraction') return null;
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="text-[10px] uppercase tracking-wide bg-gold-500/20 text-gold-500 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
        title="Generated from a meeting">
        <Sparkles className="h-3 w-3" /> from meeting
      </button>
      {open && (
        <div className="absolute z-10 left-0 top-full mt-1 w-72 bg-navy-900 border border-navy-800 rounded-lg p-3 text-xs shadow-xl">
          <div className="text-navy-600 mb-1">Source quote</div>
          <blockquote className="border-l-2 border-gold-500 pl-2 italic">
            {source_quote ?? '(no quote stored)'}
          </blockquote>
          <div className="mt-2 text-navy-600">
            Meeting: {source_meeting_id ?? '—'}
            {source_timestamp && <> · @ {source_timestamp}</>}
          </div>
        </div>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Find the task-card component used in the Kanban.**

```bash
grep -rln "owner_user_id\|task.title" components/tasks/ | head -5
```

The Kanban likely renders cards via a component such as `components/tasks/TaskCard.tsx` or inline inside `KanbanBoard.tsx`. Identify the file that renders the task title and import the badge there. Render it next to the title when `task.source === 'extraction'`:

```tsx
import { SourceProvenanceBadge } from '@/components/action-items/SourceProvenanceBadge';
// ...
<div className="flex items-center gap-2">
  <SourceProvenanceBadge
    source={task.source}
    source_meeting_id={task.source_meeting_id}
    source_timestamp={task.source_timestamp}
    source_quote={task.source_quote}
  />
  <span className="text-sm">{task.title}</span>
</div>
```

If `task` does not yet carry these fields in the type used by the Kanban, extend the type to match the updated `lib/task-types.ts` from Task 3.

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/SourceProvenanceBadge.tsx components/tasks/
git commit -m "feat(action-items): from-meeting badge on extracted tasks in War Room"
```

---

## Task 9: End-to-end verification

**Files:** none modified.

This task assembles all the pieces and exercises them locally.

- [ ] **Step 1: Run the test suite.**

```bash
npm test
```

Expected: all tests pass — Plan 1's plus the new `validation` and `events` tests.

- [ ] **Step 2: Type-check + lint + build.**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 3: Manual smoke (against the Supabase migration 102 already executed in Plan 1).**

Pre-condition: `users` has at least one row with `role='dg'` and one with `role='officer'` and `agency='gpl'` (or any value matching some task row).

```bash
npm run dev
```

Walk through:

1. Sign in as DG. Visit `/tasks`. War Room renders. Verification surface above Kanban shows nothing yet (no `awaiting_verification` items in DB).
2. Sign out, sign in as officer. Open one of their existing tasks (`status='active'` or `'new'`). Use the existing UI to mark complete via the new completion flow — wire-up: there is no UI in Plan 2 that exposes the `/api/tasks/[id]/complete` endpoint to officers via War Room. **For the smoke test, call the API directly:**

```bash
curl -X POST http://localhost:3000/api/tasks/<task-id>/complete \
  -H 'cookie: <officer session cookie>' \
  -H 'content-type: application/json' \
  -d '{"note":"delivered to legal counsel"}'
```

Expected: 200 OK, status changes to `awaiting_verification`.

> **Note:** Adding the "Mark complete (with note)" button to the existing task-detail UI is a small UX addition that this plan deliberately leaves to a future plan. The endpoint, the validation, and the verification surface all work end-to-end; only the officer-side trigger button is missing. Surface this to the user at end of Plan 2.

3. Sign in as DG. Visit `/tasks`. The Awaiting your verification section now lists the task. Click **Confirm**. The task disappears from the queue; status is `done`; `verified_by` and `verified_at` are set.
4. Repeat the cycle but click **Dispute** with a 20+ char note. Status reverts to `active`; `dispute_note` is set; the officer receives a `task_disputed` notification (verify in `notifications` table or browser).
5. As officer, call the pushback endpoint:

```bash
curl -X POST http://localhost:3000/api/tasks/<task-id>/pushback \
  -H 'cookie: <officer session cookie>' \
  -H 'content-type: application/json' \
  -d '{"text":"legal told us they were the registered counterparty"}'
```

Expected: 200 OK; an `action_item_events` row with `event_type='dispute_resolved'`, `payload.action='pushback'`. DG receives a `task_pushback` notification.

6. As DG, visit `/tasks`. The Pushbacks needing your attention section shows the task with dispute_note + pushback comment side-by-side. Click **Accept (mark done)**. Task transitions to `done` via bulk PATCH; `verified_by`/`verified_at` are set.
7. Visit any task detail. Confirm the `action_item_events` for that task contain at least: `status_change → awaiting_verification`, `dispute_raised`, `dispute_resolved (pushback)`, `status_change → done (via bulk)`.
8. (Optional) Insert a manual task whose `source='extraction'` via SQL to exercise the `SourceProvenanceBadge` rendering in the Kanban. Confirm the badge appears and the popover shows the source quote.

- [ ] **Step 4: Officer-side completion-button gap surfaced.**

Surface to the user at end of Plan 2:

> Plan 2's lifecycle endpoint `/api/tasks/[id]/complete` is implemented and tested. The existing War Room task-detail UI does not yet expose a "Mark complete (with note)" button to officers — it currently uses direct status-PATCH which is now blocked from entering `awaiting_verification`. Adding that button is a small UI task; recommended as a Plan 2.1 follow-up or rolled into Plan 4 alongside the extraction wiring.

---

## Self-review

**Spec coverage** (against rev b):

- §6.1 validation (banned phrases, verb taxonomy, required fields) → Task 2.
- §10.1 owner self-close → Task 4.
- §10.2 DG verification (Confirm + Dispute) → Tasks 4–5 + Task 6 verification surface.
- §10.3 DG bulk-close (skips awaiting_verification round-trip) → Task 3 bulk-PATCH extension.
- §10.4 dg_managed users (Minister/PS/parl_sec/President skip self-close) → Task 4 step 1 enforces the closure_mode='dg_managed' guard.
- §10.5 dispute resolution loop (re-attempt + pushback path with full event log + accept-pushback) → Tasks 4–5 (re-attempt reuses /complete; pushback endpoint logs `dispute_resolved` event without status change) + Task 6 (PushbackQueueList accepts via bulk-close).
- §10.6 delegation visibility — `canSeeTask` from Plan 1 already checks `delegated_to_id`; no new code needed in Plan 2.
- §11.3 visibility on War Room — RLS already disabled in Plan 1; the existing `app/api/tasks/*` route handlers continue to enforce app-layer guards. The verification surface uses `supabaseAdmin` because the page-level guard (`session.user.role === 'dg'`) is the gate.
- §3.4 events with `task_id` → Task 3 (events helper) + every lifecycle write.
- Inline manual-add component (used by Plan 4 review queue) — Task 7 (built, unwired).
- Provenance badge — Task 8.

**Not in this plan (correctly deferred):**

- Plan 3: Fireflies polling, `meetings_seen` population, daily digest, `/action-items/meetings` list, "Process manually" CTA → War Room Add Task with query-param prefill.
- Plan 4: extraction (Anthropic), prompt files, validation hook for extraction-specific fields (`source_quote` substring), three-bucket review UI, keyboard shortcuts, political-risk gate, supersession suggestion display, manual extraction trigger, eval data capture.
- Plan 5: supersession matcher, drift detector, earned-trust tracker, eval dashboard.
- Officer-side "Mark complete (with note)" button in War Room task-detail UI — surfaced as a gap; recommended for Plan 2.1 or rolled into Plan 4.

**Placeholder scan:** every step has concrete code or a concrete command. No "TBD".

**Type consistency:**

- `validateTaskDraft(draft: TaskDraft): ValidationResult` — same signature in Task 2 and at every call site in Task 3.
- `logEvent({ taskId, eventType, actorId, payload })` — same shape in Tasks 3, 4, 5, 6.
- `TaskStatus` includes `awaiting_verification` and `superseded` — used by `lib/task-types.ts`, the PATCH zod, the bulk-PATCH zod, and the lifecycle endpoints.
- `task_id` (not `item_id`) on `action_item_events` writes — matches the column name in migration 102.
- `tasks.source ∈ {'manual','extraction'}` matches the migration CHECK and the `Task.source` literal type.

---

## Decisions I made on your behalf

These are choices made autonomously while writing this plan. Flag any that should have been escalated.

1. **Source-meeting-id widen via `ALTER COLUMN ... TYPE TEXT USING source_meeting_id::text`** in migration 102 (in-place edit). Cleanest of the three options I considered (drop+recreate, follow-up migration, in-place ALTER COLUMN). UUIDs cast losslessly to text; existing meetings-module code keeps working because supabase-js stringifies UUIDs at the wire boundary anyway. The Plan 1 `ADD COLUMN IF NOT EXISTS source_meeting_id TEXT` line (which would have done nothing because the UUID column already exists) is removed — the in-place ALTER replaces it.
2. **Verification surface placement: top of War Room, DG-only.** The user's prompt offered War Room or Mission Control. War Room won because it's the canonical commitment surface and the verification queue is a personal DG queue that should sit next to the items it acts on. Mission Control is admin/oversight, a different role profile.
3. **Validation policy: hard-block banned phrases + required fields for both sources; verb-taxonomy hard-block only when `verb_category` is set.** The spec says "regardless of source," but the existing 93 manual tasks in War Room never had verb_category and the existing Add Task UI doesn't collect it. Hard-blocking verb-taxonomy on manual creates would break War Room without spec-driven UI changes that are out of scope here. Verb-taxonomy still hard-blocks every extraction insert (extraction always sets the category) — the spec's intent is preserved on the extraction path; the manual path is permissive at v1 and can tighten in v1.5 if/when Add Task gains a verb_category dropdown.
4. **Validation hook only on POST `/api/tasks`, not on PATCH.** PATCH would block edits on existing rows that already violate the banned-phrase check. v1 keeps PATCH unrestricted; future plans can add `?validate=true` opt-in.
5. **Direct PATCH transitions through `awaiting_verification` are blocked at the existing PATCH route** with HTTP 409. Forces clients through the lifecycle endpoints so notes, notifications, and events are not skipped. The bulk PATCH gets a controlled exception: bulk `awaiting_verification → done` is allowed because that's exactly the spec's bulk-close path and stamps `verified_by`/`verified_at` correctly.
6. **Pushback identification rule lives inline in `VerificationSurface.tsx`, not as a shared queries module.** Single call site in this plan; extracting prematurely would be YAGNI. Plan 5 (drift detector) may justify a shared queries module later.
7. **"Re-affirm dispute" is the existing dispute action, re-fired** when an owner re-completes after a dispute. No dedicated re-affirm endpoint or UI. Keeps the state machine narrow.
8. **"Accept pushback" reuses bulk-close** (`PATCH /api/tasks/bulk` with `status='done'`). Spec §10.5 says accept-pushback is treated as DG-direct close; the bulk endpoint already does that with `verified_by`/`verified_at` stamping after Task 3's extension.
9. **Notifications use `insertNotification` with the rich tier-system shape** (`event_type`, `importance_tier`, `entity_type`, `entity_id`). If the live notifications schema doesn't carry the tier columns yet, the call's `importance_tier`/`event_type` fields will be silently ignored — they're optional in the type. Functional correctness does not depend on them.
10. **No officer-side "Mark complete (with note)" button in War Room in this plan.** The endpoint is built, but the existing task-detail UI surfaces the lifecycle gap. Surfaced explicitly at end of Plan 2 — a small, well-bounded follow-up. I judged that adding it here would balloon scope into the existing War Room UI, which the spec is deliberately keeping at arm's length.
11. **`InlineExtractionAddItem` component sends fields the existing POST `/api/tasks` does not yet accept** (`extraction_id`, `extraction_item_idx`, `source_quote`, etc.). Plan 4 widens the POST schema. This component is unwired in Plan 2 and unit-tested only as a build-and-typecheck artifact.
12. **Bulk-close events log writes one row per task ID via a loop**, not a single aggregate event. Per-task event rows make the audit trail queryable per-task without payload-decoding. Volume is low (handful of bulk closes per session).

If any of these should have been a question, tell me and I'll revise.
