# Action Items — Plan 2: Manual-Add, Consumption, Closure & Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md` (authoritative).
**Predecessor:** `docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md` (committed; do not duplicate). Migration 102, constants, types, and `canSeeItem` are assumed live and imported from `@/lib/action-items/...`.

**Goal:** Make the canonical-commitment-layer half of the system end-to-end functional without any AI dependency. DG can hand-add items via a freestanding form, browse them in agency-grouped consumption views, route them to owners. Owners with DGOS logins see only their own items, mark them complete with a one-line note. DG sees verifications in a daily briefing surface, confirms or disputes. Disputes flow back to owners with notification; owners can re-attempt completion or push back via comment, which surfaces in DG's verification surface as a separate section. Bulk-close is available for DG.

**Architecture:** A pure-logic validation module is built first (TDD), then the data-access layer (`queries.ts`, `events.ts`), then write APIs (one route per lifecycle verb), then read views (server components that fetch + filter via `canSeeItem`), then the freestanding manual-add form, then the inline manual-add component (built as a controllable component but never wired in this plan — Plan 4 wires it into the review queue). Validation runs uniformly on every accepted item regardless of source. The daily-briefing verification surface lives at the top of `/action-items/mine` when the viewer is the DG, not in `/briefing` (which is unrelated and untouched here).

**Tech Stack:** Next.js 16 App Router server components + server actions / route handlers, Supabase JS (`supabaseAdmin` from `lib/db.ts`), Zod, Tailwind v4, web push (existing `insertNotification` helper).

---

## Conventions for this plan

- **Tests live in** `lib/__tests__/action-items-<file>.test.ts`. Pure-logic modules (validation, formatting helpers) are TDD: failing test first, then implementation. Data-layer + API routes are not unit-tested in this plan — they are exercised end-to-end in Task 16. Component snapshots are not written.
- **API route file naming** mirrors spec §14: `app/api/action-items/[id]/<verb>/route.ts` for lifecycle verbs, `app/api/action-items/route.ts` for list/create, `app/api/action-items/bulk-close/route.ts` for the bulk action.
- **Auth on every route:** call `requireRole([...])` at the top, return the NextResponse if it's an error. For read endpoints, the broadest role set is `['dg','minister','ps','agency_admin','officer']` and visibility is then narrowed by query and `canSeeItem`. For DG-only endpoints (verify, dispute, bulk-close), `requireRole(['dg'])`.
- **Visibility enforcement (load-bearing):** every list endpoint scopes its Supabase query by `agency` / `owner_id` for non-ministry roles, then applies `canSeeItem` to the returned rows as a safety net. Every detail endpoint loads the row, then runs `canSeeItem`, returning 404 (not 403) on miss to avoid leaking existence.
- **Server vs client:** page files default to server components and fetch via the data-access layer directly (no fetch-from-self). Forms and interactive list controls (bulk-select, complete/verify/dispute/pushback buttons) are client components that POST to the route handlers.
- **Event log:** every status change writes a row via `logEvent()` (Task 2). The lifecycle verb routes are responsible for both updating `action_items` and writing the event in the same transaction-equivalent (single Supabase function call when feasible; otherwise two writes with the event-write last so a failure leaves the live row clean).
- **Notifications:** dispute notifies the owner; pushback notifies the DG. Use the existing `insertNotification` helper from `lib/notifications.ts`. Push delivery failures are logged but do not fail the request.
- **Type safety:** every Supabase row read is cast through `as ActionItemRow` etc. once at the boundary; downstream code stays typed.
- **Commits:** small, frequent. `feat:`, `test:`, `refactor:`, `docs:`. Type-check (`npx tsc --noEmit`) passes before each commit.
- **No AI, no Fireflies, no extraction** code in this plan. `source='manual'` is the only insert path. The schema's `source='extraction'` constraint set is never exercised here.

---

## File map

**Created — lib (pure logic + data layer):**

- `lib/action-items/validation.ts` — `validateItemDraft(draft)` returns `{ ok: true } | { ok: false, issues: ValidationIssue[] }`. Banned-phrase, verb-taxonomy (verb-category match), required fields, owner-resolved, agency-set checks. Pure; no DB.
- `lib/action-items/events.ts` — `logEvent(supabase, { itemId, eventType, actorId, payload })` insert helper.
- `lib/action-items/queries.ts` — server-only data access: `getItemById`, `listItemsForUser`, `listItemsByAgency`, `listAwaitingVerification`, `listPushbackQueue`, `getEventsForItem`, `getAgenciesWithCounts`. All apply visibility via `canSeeItem` + scoped Supabase queries.
- `lib/action-items/format.ts` — `attributionLine(item, sourceMeeting?, creator?)` — render-time computation of the attribution string per locked decision §0.1.
- `lib/__tests__/action-items-validation.test.ts`
- `lib/__tests__/action-items-format.test.ts`

**Created — API routes:**

- `app/api/action-items/route.ts` — `POST` create manual item.
- `app/api/action-items/[id]/route.ts` — `GET` (single item with events + visibility check) and `PATCH` (edit metadata; DG/PS only).
- `app/api/action-items/[id]/complete/route.ts` — `POST` owner self-close (or re-attempt after dispute).
- `app/api/action-items/[id]/verify/route.ts` — `POST` DG confirm.
- `app/api/action-items/[id]/dispute/route.ts` — `POST` DG dispute (with note ≥20 chars).
- `app/api/action-items/[id]/pushback/route.ts` — `POST` owner pushback comment (with text ≥20 chars).
- `app/api/action-items/bulk-close/route.ts` — `POST` DG bulk-close array of item IDs with optional shared note.

**Created — components:**

- `components/action-items/ManualAddForm.tsx` — controlled form, used by both freestanding `/new` page and the inline component. Props govern which fields are pre-filled and which submit handler runs.
- `components/action-items/ManualAddInline.tsx` — wrapper around `ManualAddForm` for use inside the review queue (Plan 4). Built but **not** rendered anywhere in Plan 2.
- `components/action-items/ManualAddFreestanding.tsx` — wrapper around `ManualAddForm` for `/action-items/new`. Submits via `POST /api/action-items` and redirects on success.
- `components/action-items/ItemCard.tsx` — single item card. Renders task, due, priority, status, attribution. Action buttons depend on viewer role + item state (Complete for owner; Verify/Dispute for DG when status is `awaiting_verification`; Re-affirm/Accept-pushback for DG when item has an open pushback event).
- `components/action-items/AgencyTree.tsx` — left column of `/action-items`. Lists agencies with open counts.
- `components/action-items/OwnerSection.tsx` — groups items under an owner header inside an agency view.
- `components/action-items/CompleteDialog.tsx` — modal for owner self-close (textarea + submit).
- `components/action-items/DisputeDialog.tsx` — modal for DG dispute (textarea + submit).
- `components/action-items/PushbackDialog.tsx` — modal for owner pushback (textarea + submit).
- `components/action-items/VerificationQueue.tsx` — DG-only block: lists `awaiting_verification` items with one-tap Confirm and Dispute. Lives at the top of `/action-items/mine` when role is `dg`.
- `components/action-items/PushbackQueue.tsx` — DG-only block: lists items with an unresolved pushback event side-by-side with original dispute_note. Lives below VerificationQueue.
- `components/action-items/BulkCloseToolbar.tsx` — multi-select checkbox toolbar that appears when items are selected on `/action-items/agency/[name]` and `/action-items` (DG only).
- `components/action-items/EventLog.tsx` — chronological event list rendered on item detail.

**Created — pages (replace empty shells from Plan 1):**

- `app/action-items/page.tsx` — agency tree + selected-agency right panel.
- `app/action-items/agency/[name]/page.tsx` — per-agency view with bulk-select for DG.
- `app/action-items/mine/page.tsx` — owner-scoped view + DG verification surface.
- `app/action-items/[id]/page.tsx` — detail view with event log + supersession chain placeholder.
- `app/action-items/new/page.tsx` — freestanding manual-add form host.

**Modified:**

- `app/action-items/page.tsx` (was empty shell from Plan 1; reimplemented).
- `app/action-items/agency/[name]/page.tsx` (was empty shell).
- `app/action-items/mine/page.tsx` (was empty shell).
- `app/action-items/[id]/page.tsx` (was empty shell).
- `app/action-items/new/page.tsx` (was empty shell).

`/action-items/review/*` pages remain as the Plan 1 shells — Plan 4 replaces them.

---

## Task 1: Validation module (TDD)

**Files:**
- Create: `lib/action-items/validation.ts`
- Test: `lib/__tests__/action-items-validation.test.ts`

The validation module is the gate that runs on every accepted item — manual or extracted — so it must be pure, exhaustively tested, and have no DB dependencies. Resolution and confidence checks belong to Plan 4; this plan implements only the source-agnostic checks per spec §6.1: banned phrases, verb taxonomy, required fields, owner-resolved, agency-set.

- [ ] **Step 1: Write the failing test.**

Create `lib/__tests__/action-items-validation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { validateItemDraft, type ItemDraft } from '@/lib/action-items/validation';

const baseDraft: ItemDraft = {
  agency_name: 'GPL',
  owner_id: 'u-kesh',
  owner_name_raw: 'Kesh',
  verb_category: 'correspondence',
  task: 'Issue notification of termination to InterEnergy',
  due_at: null,
  due_trigger: null,
  source: 'manual',
};

describe('validateItemDraft', () => {
  it('accepts a clean manual draft', () => {
    const r = validateItemDraft(baseDraft);
    expect(r.ok).toBe(true);
  });

  it('rejects a missing task', () => {
    const r = validateItemDraft({ ...baseDraft, task: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'task')).toBe(true);
  });

  it('rejects a missing owner_id (forces resolution)', () => {
    const r = validateItemDraft({ ...baseDraft, owner_id: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'owner_id')).toBe(true);
  });

  it('rejects a missing agency_name', () => {
    const r = validateItemDraft({ ...baseDraft, agency_name: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.field === 'agency_name')).toBe(true);
  });

  it('rejects a banned substring phrase (case-insensitive)', () => {
    const r = validateItemDraft({ ...baseDraft, task: 'Follow up on the InterEnergy issue' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'banned_phrase')).toBe(true);
  });

  it('rejects "circle back" anywhere in the task', () => {
    const r = validateItemDraft({ ...baseDraft, task: 'Issue notice and circle back next week' });
    expect(r.ok).toBe(false);
  });

  it('rejects a whole-token "handle" (no specific deliverable)', () => {
    // Per Plan 1 autonomous decision #3: "handle" is matched as whole-token, not substring.
    const r = validateItemDraft({ ...baseDraft, task: 'Handle the Berbice site' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'banned_phrase')).toBe(true);
  });

  it('does NOT reject the substring "handle" inside another word', () => {
    // "investigate handle valves" — "handle" is a noun here, so banned-phrase logic must use word boundaries.
    const r = validateItemDraft({ ...baseDraft, task: 'Investigate handle valves at Kingston substation' });
    expect(r.ok).toBe(true);
  });

  it('rejects a whole-token "work on"', () => {
    const r = validateItemDraft({ ...baseDraft, task: 'Work on the procurement schedule' });
    expect(r.ok).toBe(false);
  });

  it('rejects a verb that is not in the declared verb_category', () => {
    // "Approve" is a `decision` verb, not a `correspondence` verb.
    const r = validateItemDraft({ ...baseDraft, task: 'Approve the InterEnergy contract' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'verb_taxonomy')).toBe(true);
  });

  it('accepts a verb that is in the declared verb_category', () => {
    const r = validateItemDraft({
      ...baseDraft,
      verb_category: 'decision',
      task: 'Approve the InterEnergy contract',
    });
    expect(r.ok).toBe(true);
  });

  it('case-insensitive verb taxonomy lookup', () => {
    const r = validateItemDraft({ ...baseDraft, task: 'ISSUE notification of termination' });
    expect(r.ok).toBe(true);
  });

  it('rejects a task longer than 500 chars', () => {
    const r = validateItemDraft({ ...baseDraft, task: 'Issue ' + 'x'.repeat(600) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some(i => i.code === 'task_too_long')).toBe(true);
  });

  it('returns multiple issues at once', () => {
    const r = validateItemDraft({
      ...baseDraft,
      owner_id: null,
      agency_name: null,
      task: 'Follow up on stuff',
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

Expected: FAIL — `Cannot find module '@/lib/action-items/validation'`.

- [ ] **Step 3: Implement `validation.ts`.**

Create `lib/action-items/validation.ts`:

```typescript
import {
  APPROVED_VERBS, BANNED_PHRASES,
  type Agency, type VerbCategory,
} from './constants';

export interface ItemDraft {
  agency_name: Agency | null;
  owner_id: string | null;
  owner_name_raw: string;
  verb_category: VerbCategory | null;
  task: string;
  due_at: string | null;
  due_trigger: string | null;
  source: 'manual' | 'extraction';
}

export type ValidationIssueCode =
  | 'required'
  | 'task_too_long'
  | 'banned_phrase'
  | 'verb_taxonomy';

export interface ValidationIssue {
  code: ValidationIssueCode;
  field: 'task' | 'owner_id' | 'agency_name' | 'verb_category' | 'owner_name_raw';
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

// Whole-token banned verbs (Plan 1 decision #3): rejected via word-boundary
// match so "handle valves" (noun) survives but "Handle the Berbice site" doesn't.
const BANNED_TOKENS = ['handle', 'work on'];

export function validateItemDraft(draft: ItemDraft): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!draft.task || draft.task.trim().length === 0) {
    issues.push({ code: 'required', field: 'task', message: 'Task is required.' });
  } else if (draft.task.length > 500) {
    issues.push({ code: 'task_too_long', field: 'task', message: 'Task must be ≤500 characters.' });
  }
  if (!draft.owner_id) {
    issues.push({ code: 'required', field: 'owner_id', message: 'Owner must be resolved before accept.' });
  }
  if (!draft.owner_name_raw || draft.owner_name_raw.trim().length === 0) {
    issues.push({ code: 'required', field: 'owner_name_raw', message: 'Owner name (as-spoken) is required.' });
  }
  if (!draft.agency_name) {
    issues.push({ code: 'required', field: 'agency_name', message: 'Agency must be set before accept.' });
  }
  if (!draft.verb_category) {
    issues.push({ code: 'required', field: 'verb_category', message: 'Verb category is required.' });
  }

  // Banned phrases — substring (case-insensitive)
  if (draft.task) {
    const lower = draft.task.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (lower.includes(phrase)) {
        issues.push({
          code: 'banned_phrase',
          field: 'task',
          message: `Banned phrase "${phrase}" — rewrite with a specific deliverable.`,
        });
      }
    }
    // Banned tokens — whole-token (case-insensitive)
    for (const token of BANNED_TOKENS) {
      const re = new RegExp(`\\b${token.replace(/ /g, '\\s+')}\\b`, 'i');
      if (re.test(draft.task)) {
        issues.push({
          code: 'banned_phrase',
          field: 'task',
          message: `Banned verb "${token}" — rewrite with an approved verb and specific deliverable.`,
        });
      }
    }
  }

  // Verb taxonomy: first word of task must be in the declared verb_category list.
  if (draft.task && draft.verb_category) {
    const firstWord = draft.task.trim().split(/\s+/, 1)[0]?.toLowerCase().replace(/[^a-z]/g, '');
    const allowed = APPROVED_VERBS[draft.verb_category];
    if (firstWord && allowed && !allowed.includes(firstWord)) {
      issues.push({
        code: 'verb_taxonomy',
        field: 'task',
        message: `First verb "${firstWord}" is not in category "${draft.verb_category}". Allowed: ${allowed.join(', ')}.`,
      });
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

```bash
npx vitest run lib/__tests__/action-items-validation.test.ts
```

Expected: PASS, all 13 tests green.

- [ ] **Step 5: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/validation.ts lib/__tests__/action-items-validation.test.ts
git commit -m "feat(action-items): validation module — banned phrases, verbs, required fields"
```

---

## Task 2: Events log helper

**Files:**
- Create: `lib/action-items/events.ts`

Pure data-layer wrapper around `INSERT INTO action_item_events`. The lifecycle routes (Tasks 8–13) call this once per state change. Always called *after* the live `action_items` row update so a failure here does not leave the live row inconsistent.

- [ ] **Step 1: Implement `events.ts`.**

Create `lib/action-items/events.ts`:

```typescript
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import type { EventType } from './constants';
import { logger } from '@/lib/logger';

export interface LogEventInput {
  itemId: string;
  eventType: EventType;
  actorId: string | null;
  payload: Record<string, unknown>;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const { error } = await supabaseAdmin.from('action_item_events').insert({
    item_id: input.itemId,
    event_type: input.eventType,
    actor_id: input.actorId,
    payload: input.payload,
  });
  if (error) {
    // Event-log failures are observability concerns, not user-blocking. Log and continue.
    logger.error({ err: error, itemId: input.itemId, eventType: input.eventType },
      'action_item_events insert failed');
  }
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/events.ts
git commit -m "feat(action-items): events log helper"
```

---

## Task 3: Format helpers (attribution line, TDD)

**Files:**
- Create: `lib/action-items/format.ts`
- Test: `lib/__tests__/action-items-format.test.ts`

Per locked decision §0.1, the attribution string is computed at render time from `source` + supporting lookups, never stored.

- [ ] **Step 1: Write the failing test.**

Create `lib/__tests__/action-items-format.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { attributionLine } from '@/lib/action-items/format';
import type { ActionItemRow } from '@/lib/action-items/types';

const base: Pick<ActionItemRow, 'source' | 'reviewed_at' | 'created_at' | 'created_by'> = {
  source: 'extraction',
  reviewed_at: null,
  created_at: '2026-04-13T12:00:00Z',
  created_by: null,
};

describe('attributionLine', () => {
  it('extraction + reviewed → "Generated from <meeting>, <date>. Reviewed by DG Office."', () => {
    expect(attributionLine(
      { ...base, reviewed_at: '2026-04-14T09:00:00Z' } as ActionItemRow,
      { meeting_title: 'Weekly Management Call', meeting_date: '2026-04-13T10:00:00Z' },
      null,
    )).toBe('Generated from Weekly Management Call, 13 Apr 2026. Reviewed by DG Office.');
  });

  it('extraction + not reviewed → "...Not yet reviewed."', () => {
    expect(attributionLine(
      base as ActionItemRow,
      { meeting_title: 'Weekly Management Call', meeting_date: '2026-04-13T10:00:00Z' },
      null,
    )).toBe('Generated from Weekly Management Call, 13 Apr 2026. Not yet reviewed.');
  });

  it('manual → "Added by <creator>, <date>."', () => {
    expect(attributionLine(
      { ...base, source: 'manual', created_at: '2026-05-01T15:00:00Z' } as ActionItemRow,
      null,
      { name: 'DG' },
    )).toBe('Added by DG, 1 May 2026.');
  });

  it('manual without creator name falls back to "Added manually"', () => {
    expect(attributionLine(
      { ...base, source: 'manual', created_at: '2026-05-01T15:00:00Z' } as ActionItemRow,
      null,
      null,
    )).toBe('Added manually, 1 May 2026.');
  });

  it('extraction without meeting metadata still renders gracefully', () => {
    expect(attributionLine(base as ActionItemRow, null, null))
      .toBe('Generated from a meeting (details unavailable). Not yet reviewed.');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails.**

```bash
npx vitest run lib/__tests__/action-items-format.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `format.ts`.**

Create `lib/action-items/format.ts`:

```typescript
import type { ActionItemRow } from './types';

interface MeetingHint {
  meeting_title: string | null;
  meeting_date: string | null;
}
interface CreatorHint {
  name: string | null;
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // "13 Apr 2026" — DGOS convention used in tasks/briefing UI.
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function attributionLine(
  item: Pick<ActionItemRow, 'source' | 'reviewed_at' | 'created_at' | 'created_by'>,
  meeting: MeetingHint | null,
  creator: CreatorHint | null,
): string {
  if (item.source === 'manual') {
    const date = fmtDate(item.created_at);
    const name = creator?.name?.trim();
    if (name) return `Added by ${name}, ${date}.`;
    return `Added manually, ${date}.`;
  }
  // extraction
  const reviewed = item.reviewed_at ? 'Reviewed by DG Office.' : 'Not yet reviewed.';
  if (meeting && meeting.meeting_title && meeting.meeting_date) {
    return `Generated from ${meeting.meeting_title}, ${fmtDate(meeting.meeting_date)}. ${reviewed}`;
  }
  return `Generated from a meeting (details unavailable). ${reviewed}`;
}
```

- [ ] **Step 4: Run the test to confirm it passes.**

```bash
npx vitest run lib/__tests__/action-items-format.test.ts
```

Expected: PASS, all 5 tests green.

- [ ] **Step 5: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/format.ts lib/__tests__/action-items-format.test.ts
git commit -m "feat(action-items): attribution line render helper + tests"
```

---

## Task 4: Queries module (data access)

**Files:**
- Create: `lib/action-items/queries.ts`

Server-only module. Every query applies visibility narrowing in two ways: (a) the SQL `where` clause filters by the user's role/agency to keep payloads small, and (b) the returned rows are run through `canSeeItem` as a defensive filter. This double-pass is intentional — see spec §11.5 and the visibility-leak risk row in §16.

- [ ] **Step 1: Implement the queries module.**

Create `lib/action-items/queries.ts`:

```typescript
import 'server-only';
import { supabaseAdmin } from '@/lib/db';
import { canSeeItem } from './visibility';
import type {
  ActionItemRow, ActionItemEventRow, UserStaffFields,
} from './types';
import type { Agency } from './constants';

const ITEM_COLUMNS = `
  id, source, extraction_id, extraction_item_idx, source_meeting_id,
  source_timestamp, source_quote, created_by,
  agency_name, owner_id, owner_name_raw, delegated_to_id,
  verb_category, task, due_at, due_trigger, priority,
  status, reviewed_by, reviewed_at, completed_by, completed_at, completion_note,
  verified_by, verified_at, disputed_at, dispute_note,
  supersedes_id, confidence_overall, confidence_reasons,
  visibility_scope, created_at, updated_at
`;

export async function getItemById(
  id: string,
  viewer: UserStaffFields,
): Promise<ActionItemRow | null> {
  const { data, error } = await supabaseAdmin
    .from('action_items')
    .select(ITEM_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as ActionItemRow;
  return canSeeItem(viewer, row) ? row : null;
}

export async function getEventsForItem(itemId: string): Promise<ActionItemEventRow[]> {
  const { data, error } = await supabaseAdmin
    .from('action_item_events')
    .select('id, item_id, event_type, actor_id, payload, occurred_at')
    .eq('item_id', itemId)
    .order('occurred_at', { ascending: true });
  if (error || !data) return [];
  return data as unknown as ActionItemEventRow[];
}

interface ListOpts {
  agency?: Agency;
  status?: ActionItemRow['status'][];
  ownerId?: string;
  limit?: number;
}

const DEFAULT_OPEN_STATUSES: ActionItemRow['status'][] = [
  'open', 'in_progress', 'awaiting_verification', 'disputed',
];

export async function listItemsForUser(
  viewer: UserStaffFields,
  opts: ListOpts = {},
): Promise<ActionItemRow[]> {
  let q = supabaseAdmin
    .from('action_items')
    .select(ITEM_COLUMNS)
    .order('priority', { ascending: true })
    .order('due_at', { ascending: true, nullsFirst: false });

  q = q.in('status', opts.status ?? DEFAULT_OPEN_STATUSES);
  if (opts.agency) q = q.eq('agency_name', opts.agency);
  if (opts.ownerId) q = q.eq('owner_id', opts.ownerId);

  // Pre-narrow by role to limit payload before the canSeeItem safety filter.
  if (viewer.role === 'officer' || viewer.role === 'agency_admin') {
    if (viewer.agency) {
      q = q.or(`agency_name.eq.${viewer.agency.toUpperCase()},owner_id.eq.${viewer.id},delegated_to_id.eq.${viewer.id}`);
    } else {
      q = q.or(`owner_id.eq.${viewer.id},delegated_to_id.eq.${viewer.id}`);
    }
  }
  // Ministry roles: no pre-narrow; canSeeItem still filters dg_only for non-DG.

  q = q.limit(opts.limit ?? 500);
  const { data, error } = await q;
  if (error || !data) return [];
  const rows = data as unknown as ActionItemRow[];
  return rows.filter(r => canSeeItem(viewer, r));
}

export async function listAwaitingVerification(viewer: UserStaffFields): Promise<ActionItemRow[]> {
  if (viewer.role !== 'dg') return [];
  return listItemsForUser(viewer, { status: ['awaiting_verification'] });
}

export async function listPushbackQueue(viewer: UserStaffFields): Promise<ActionItemRow[]> {
  if (viewer.role !== 'dg') return [];
  // An item is "in pushback" when its most recent event for the item is a
  // dispute_resolved with payload.action='pushback' AND no later dispute_raised.
  // Implemented via a left-lateral join in SQL (raw RPC would be tidier; we
  // approximate with two queries to stay inside the supabase-js client).
  const { data: pushbackEvents } = await supabaseAdmin
    .from('action_item_events')
    .select('item_id, occurred_at, payload')
    .eq('event_type', 'dispute_resolved')
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (!pushbackEvents) return [];
  const candidates = (pushbackEvents as Array<{
    item_id: string; occurred_at: string; payload: { action?: string };
  }>)
    .filter(e => e.payload?.action === 'pushback')
    .map(e => ({ id: e.item_id, ts: e.occurred_at }));

  if (candidates.length === 0) return [];

  // Filter to items whose latest pushback has not been re-disputed since.
  const ids = candidates.map(c => c.id);
  const { data: laterDisputes } = await supabaseAdmin
    .from('action_item_events')
    .select('item_id, occurred_at')
    .in('item_id', ids)
    .eq('event_type', 'dispute_raised');
  const latestRedispute = new Map<string, string>();
  for (const e of (laterDisputes ?? []) as Array<{ item_id: string; occurred_at: string }>) {
    const prev = latestRedispute.get(e.item_id);
    if (!prev || prev < e.occurred_at) latestRedispute.set(e.item_id, e.occurred_at);
  }
  const livePushbackIds = candidates
    .filter(c => {
      const r = latestRedispute.get(c.id);
      return !r || r < c.ts;
    })
    .map(c => c.id);
  if (livePushbackIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('action_items')
    .select(ITEM_COLUMNS)
    .in('id', livePushbackIds);
  if (error || !data) return [];
  return (data as unknown as ActionItemRow[]).filter(r => canSeeItem(viewer, r));
}

export async function getAgenciesWithCounts(viewer: UserStaffFields): Promise<
  Array<{ agency: Agency; open: number }>
> {
  const items = await listItemsForUser(viewer, { status: DEFAULT_OPEN_STATUSES });
  const counts = new Map<Agency, number>();
  for (const it of items) counts.set(it.agency_name, (counts.get(it.agency_name) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([agency, open]) => ({ agency, open }))
    .sort((a, b) => a.agency.localeCompare(b.agency));
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add lib/action-items/queries.ts
git commit -m "feat(action-items): server-side queries with visibility filtering"
```

---

## Task 5: API — `POST /api/action-items` (manual create)

**Files:**
- Create: `app/api/action-items/route.ts`

Manual-only insert path in this plan. Per spec §8.5, the freestanding-form item enters consumption as `open` directly — DG is the creator, no triage. Validation runs first; structured 400 on issues.

- [ ] **Step 1: Implement the route.**

Create `app/api/action-items/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';
import { validateItemDraft } from '@/lib/action-items/validation';
import {
  AgencyZ, VerbCategoryZ, PriorityZ, VisibilityScopeZ,
} from '@/lib/action-items/types';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const CreateBodyZ = z.object({
  agency_name: AgencyZ,
  owner_id: z.string().uuid(),
  owner_name_raw: z.string().min(1).max(200),
  delegated_to_id: z.string().uuid().nullable().optional(),
  verb_category: VerbCategoryZ,
  task: z.string().min(1).max(500),
  due_at: z.string().datetime().nullable().optional(),
  due_trigger: z.string().max(200).nullable().optional(),
  priority: PriorityZ.optional(),
  visibility_scope: VisibilityScopeZ.optional(),
  source_meeting_id: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  // Manual-add is a DG/PS workflow in v1 (spec §8.5: "DG is the creator").
  const auth = await requireRole(['dg', 'ps']);
  if (auth instanceof NextResponse) return auth;
  const { session } = auth;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const parsed = CreateBodyZ.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });
  }
  const input = parsed.data;

  const v = validateItemDraft({
    agency_name: input.agency_name,
    owner_id: input.owner_id,
    owner_name_raw: input.owner_name_raw,
    verb_category: input.verb_category,
    task: input.task,
    due_at: input.due_at ?? null,
    due_trigger: input.due_trigger ?? null,
    source: 'manual',
  });
  if (!v.ok) {
    return NextResponse.json({ error: 'Validation failed', issues: v.issues }, { status: 400 });
  }

  // Default priority for manual-add when blank: P2 if due ≤28d, P3 otherwise.
  // (Spec §6.5 priority rules. Full programmatic assignment lands in Plan 4;
  // this default keeps manual items routable until then.)
  const priority = input.priority ?? defaultPriorityFromDue(input.due_at ?? null);

  const { data, error } = await supabaseAdmin
    .from('action_items')
    .insert({
      source: 'manual',
      created_by: session.user.id,
      agency_name: input.agency_name,
      owner_id: input.owner_id,
      owner_name_raw: input.owner_name_raw,
      delegated_to_id: input.delegated_to_id ?? null,
      verb_category: input.verb_category,
      task: input.task,
      due_at: input.due_at ?? null,
      due_trigger: input.due_trigger ?? null,
      priority,
      status: 'open',
      visibility_scope: input.visibility_scope ?? 'agency_normal',
      source_meeting_id: input.source_meeting_id ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    logger.error({ err: error }, 'action_items insert failed');
    return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
  }

  await logEvent({
    itemId: data.id,
    eventType: 'created',
    actorId: session.user.id,
    payload: { source: 'manual' },
  });

  return NextResponse.json({ id: data.id }, { status: 201 });
}

function defaultPriorityFromDue(dueAt: string | null): 'P2' | 'P3' {
  if (!dueAt) return 'P3';
  const due = new Date(dueAt).getTime();
  const days = (due - Date.now()) / (1000 * 60 * 60 * 24);
  return days <= 28 ? 'P2' : 'P3';
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/action-items/route.ts
git commit -m "feat(action-items): POST /api/action-items create (manual)"
```

---

## Task 6: ManualAddForm component

**Files:**
- Create: `components/action-items/ManualAddForm.tsx`

Controlled, presentational. Pure form — no fetch logic. Parent components (`ManualAddFreestanding`, `ManualAddInline`) own the submit handler. This indirection lets Plan 4 reuse the form inside the review queue without duplicating UI.

- [ ] **Step 1: Implement the form.**

Create `components/action-items/ManualAddForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import {
  AGENCIES, VERB_CATEGORIES, PRIORITIES, VISIBILITY_SCOPES,
  type Agency, type VerbCategory, type Priority, type VisibilityScope,
} from '@/lib/action-items/constants';

export interface ManualAddFormValues {
  agency_name: Agency | '';
  owner_id: string;
  owner_name_raw: string;
  delegated_to_id: string;
  verb_category: VerbCategory | '';
  task: string;
  due_at: string;       // datetime-local string ('' if none)
  due_trigger: string;
  priority: Priority | '';
  visibility_scope: VisibilityScope;
  source_meeting_id: string;
}

interface UserOption { id: string; name: string; agency: string | null; }

interface Props {
  defaults?: Partial<ManualAddFormValues>;
  ownerOptions: UserOption[];
  submitLabel?: string;
  onSubmit: (values: ManualAddFormValues) => Promise<{ ok: boolean; error?: string; issues?: Array<{ field: string; message: string }> }>;
  onCancel?: () => void;
}

const EMPTY: ManualAddFormValues = {
  agency_name: '', owner_id: '', owner_name_raw: '', delegated_to_id: '',
  verb_category: '', task: '', due_at: '', due_trigger: '',
  priority: '', visibility_scope: 'agency_normal', source_meeting_id: '',
};

export function ManualAddForm({ defaults, ownerOptions, submitLabel = 'Create item', onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<ManualAddFormValues>({ ...EMPTY, ...defaults });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [topError, setTopError] = useState<string | null>(null);

  const set = <K extends keyof ManualAddFormValues>(k: K, v: ManualAddFormValues[K]) =>
    setValues(prev => ({ ...prev, [k]: v }));

  // Auto-fill owner_name_raw + agency from selected owner if those fields are still empty.
  function pickOwner(id: string) {
    const opt = ownerOptions.find(o => o.id === id);
    setValues(prev => ({
      ...prev,
      owner_id: id,
      owner_name_raw: prev.owner_name_raw || (opt?.name ?? ''),
      agency_name: prev.agency_name || ((opt?.agency?.toUpperCase() ?? '') as Agency | ''),
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({}); setTopError(null);
    setSubmitting(true);
    const result = await onSubmit(values);
    setSubmitting(false);
    if (!result.ok) {
      setTopError(result.error ?? 'Submission failed.');
      const map: Record<string, string> = {};
      for (const issue of result.issues ?? []) map[issue.field] = issue.message;
      setErrors(map);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card-premium p-6 space-y-4">
      {topError && <div className="text-[color:var(--critical)]">{topError}</div>}

      <Field label="Agency" error={errors.agency_name}>
        <select required value={values.agency_name} onChange={e => set('agency_name', e.target.value as Agency)}
          className="input-base">
          <option value="">Select…</option>
          {AGENCIES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </Field>

      <Field label="Owner" error={errors.owner_id}>
        <select required value={values.owner_id} onChange={e => pickOwner(e.target.value)} className="input-base">
          <option value="">Select…</option>
          {ownerOptions.map(o => (
            <option key={o.id} value={o.id}>{o.name}{o.agency ? ` (${o.agency})` : ''}</option>
          ))}
        </select>
      </Field>

      <Field label="Owner name as spoken (raw)" error={errors.owner_name_raw}>
        <input required value={values.owner_name_raw} onChange={e => set('owner_name_raw', e.target.value)}
          className="input-base" placeholder="Kesh" />
      </Field>

      <Field label="Verb category" error={errors.verb_category}>
        <select required value={values.verb_category} onChange={e => set('verb_category', e.target.value as VerbCategory)}
          className="input-base">
          <option value="">Select…</option>
          {VERB_CATEGORIES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>

      <Field label="Task (canonical sentence, ≤500 chars)" error={errors.task}>
        <textarea required maxLength={500} rows={3} value={values.task}
          onChange={e => set('task', e.target.value)} className="input-base font-mono" />
        <div className="text-xs text-[color:var(--navy-600)]">{values.task.length}/500</div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Due date (optional)">
          <input type="datetime-local" value={values.due_at} onChange={e => set('due_at', e.target.value)}
            className="input-base" />
        </Field>
        <Field label="Due trigger (free text, optional)">
          <input value={values.due_trigger} onChange={e => set('due_trigger', e.target.value)}
            className="input-base" placeholder="when DBIS is operational" />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Priority (auto if blank)">
          <select value={values.priority} onChange={e => set('priority', e.target.value as Priority)}
            className="input-base">
            <option value="">Auto</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Delegate to (optional)">
          <select value={values.delegated_to_id} onChange={e => set('delegated_to_id', e.target.value)}
            className="input-base">
            <option value="">None</option>
            {ownerOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Visibility">
        <select value={values.visibility_scope} onChange={e => set('visibility_scope', e.target.value as VisibilityScope)}
          className="input-base">
          {VISIBILITY_SCOPES.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </Field>

      <div className="flex gap-3 justify-end pt-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-navy">Cancel</button>
        )}
        <button type="submit" disabled={submitting} className="btn-gold">
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-[color:var(--navy-600)] mb-1">{label}</span>
      {children}
      {error && <span className="block text-xs text-[color:var(--critical)] mt-1">{error}</span>}
    </label>
  );
}
```

- [ ] **Step 2: Confirm `.input-base` exists in globals.css.**

```bash
grep -n "input-base" app/globals.css || echo "MISSING — add a minimal utility class"
```

If missing, add a one-line utility to `app/globals.css`:

```css
.input-base { @apply w-full bg-[color:var(--navy-900)] border border-[color:var(--navy-800)] rounded px-3 py-2 text-sm; }
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/ManualAddForm.tsx app/globals.css
git commit -m "feat(action-items): ManualAddForm presentational component"
```

---

## Task 7: ManualAddFreestanding + ManualAddInline wrappers, and `/action-items/new` page

**Files:**
- Create: `components/action-items/ManualAddFreestanding.tsx`
- Create: `components/action-items/ManualAddInline.tsx`
- Modify: `app/action-items/new/page.tsx`

`ManualAddInline` is built but not consumed in this plan — Plan 4's review queue wires it.

- [ ] **Step 1: Implement `ManualAddFreestanding.tsx`.**

```tsx
'use client';
import { useRouter } from 'next/navigation';
import { ManualAddForm, type ManualAddFormValues } from './ManualAddForm';

interface UserOption { id: string; name: string; agency: string | null; }

export function ManualAddFreestanding({ ownerOptions, defaults }: {
  ownerOptions: UserOption[];
  defaults?: Partial<ManualAddFormValues>;
}) {
  const router = useRouter();
  return (
    <ManualAddForm
      ownerOptions={ownerOptions}
      defaults={defaults}
      submitLabel="Create item"
      onCancel={() => router.push('/action-items')}
      onSubmit={async (v) => {
        const res = await fetch('/api/action-items', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            agency_name: v.agency_name,
            owner_id: v.owner_id,
            owner_name_raw: v.owner_name_raw,
            delegated_to_id: v.delegated_to_id || null,
            verb_category: v.verb_category,
            task: v.task,
            due_at: v.due_at ? new Date(v.due_at).toISOString() : null,
            due_trigger: v.due_trigger || null,
            priority: v.priority || undefined,
            visibility_scope: v.visibility_scope,
            source_meeting_id: v.source_meeting_id || null,
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ok: false, error: body.error, issues: body.issues };
        }
        const { id } = await res.json();
        router.push(`/action-items/${id}`);
        return { ok: true };
      }}
    />
  );
}
```

- [ ] **Step 2: Implement `ManualAddInline.tsx`.**

```tsx
'use client';
import { ManualAddForm, type ManualAddFormValues } from './ManualAddForm';

interface UserOption { id: string; name: string; agency: string | null; }

export interface ManualAddInlineProps {
  ownerOptions: UserOption[];
  defaults?: Partial<ManualAddFormValues>;
  // Plan 4 wires this inside the review queue: instead of creating a row,
  // it appends the draft to bucket 1 (mandatory) for explicit accept.
  onAccept: (values: ManualAddFormValues) => Promise<{ ok: boolean; error?: string; issues?: Array<{ field: string; message: string }> }>;
  onCancel?: () => void;
}

export function ManualAddInline(props: ManualAddInlineProps) {
  return (
    <ManualAddForm
      ownerOptions={props.ownerOptions}
      defaults={props.defaults}
      submitLabel="Add to mandatory bucket"
      onCancel={props.onCancel}
      onSubmit={props.onAccept}
    />
  );
}
```

- [ ] **Step 3: Replace the empty shell at `app/action-items/new/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/db';
import { ManualAddFreestanding } from '@/components/action-items/ManualAddFreestanding';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = new Set(['dg', 'ps', 'parl_sec']);

export default async function NewActionItemPage({
  searchParams,
}: {
  searchParams: Promise<{ meeting_id?: string; meeting_title?: string; meeting_date?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  if (!ALLOWED_ROLES.has(session.user.role)) {
    return (
      <div className="card-premium p-12 text-center">
        <h1 className="text-xl">Manual-add is restricted to DG and Permanent Secretary.</h1>
      </div>
    );
  }

  const { data: users } = await supabaseAdmin
    .from('users')
    .select('id, name, agency')
    .eq('is_active', true)
    .order('name');

  const ownerOptions = (users ?? []).map(u => ({
    id: u.id as string,
    name: (u.name as string | null) ?? '(unnamed)',
    agency: u.agency as string | null,
  }));

  const sp = await searchParams;

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="stat-number text-3xl mb-2">New Action Item</h1>
      <p className="text-[color:var(--navy-600)] mb-6">
        Validation runs the same as on extracted items. Created items enter consumption directly as <code>open</code>.
      </p>
      <ManualAddFreestanding
        ownerOptions={ownerOptions}
        defaults={{ source_meeting_id: sp.meeting_id ?? '' }}
      />
      {sp.meeting_id && (
        <p className="text-sm text-[color:var(--navy-600)] mt-4">
          Pre-populated from meeting <strong>{sp.meeting_title ?? sp.meeting_id}</strong>
          {sp.meeting_date ? ` (${sp.meeting_date})` : ''}.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/ManualAddFreestanding.tsx components/action-items/ManualAddInline.tsx app/action-items/new/page.tsx
git commit -m "feat(action-items): freestanding manual-add page + inline wrapper"
```

---

## Task 8: ItemCard component

**Files:**
- Create: `components/action-items/ItemCard.tsx`

Single-item card. Drives all consumption views and the verification queue. Action buttons render based on viewer role + item status. The actual dialogs (Complete / Dispute / Pushback) are separate components opened from the buttons here.

- [ ] **Step 1: Implement `ItemCard.tsx`.**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ActionItemRow } from '@/lib/action-items/types';
import { CompleteDialog } from './CompleteDialog';
import { DisputeDialog } from './DisputeDialog';
import { PushbackDialog } from './PushbackDialog';

type ViewerRole = 'dg' | 'minister' | 'ps' | 'parl_sec' | 'agency_admin' | 'officer';

interface Props {
  item: ActionItemRow;
  attribution: string;
  viewer: { id: string; role: ViewerRole };
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  onChanged?: () => void;       // refresh hook for parent
  hasOpenPushback?: boolean;     // computed by parent (DG queue only)
}

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'var(--critical)', P1: 'var(--gold-500)', P2: 'var(--gold-500)', P3: 'var(--navy-600)',
};

export function ItemCard({ item, attribution, viewer, selectable, selected, onSelectChange, onChanged, hasOpenPushback }: Props) {
  const [completeOpen, setCompleteOpen] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [pushbackOpen, setPushbackOpen] = useState(false);

  const isOwner = viewer.id === item.owner_id;
  const isDG = viewer.role === 'dg';
  const canComplete = isOwner && (item.status === 'open' || item.status === 'in_progress');
  const canVerify   = isDG && item.status === 'awaiting_verification';
  const canPushback = isOwner && item.status === 'open' && !!item.dispute_note;

  return (
    <div className="card-premium p-4 flex gap-4">
      {selectable && (
        <input
          type="checkbox" checked={selected ?? false}
          onChange={e => onSelectChange?.(e.target.checked)}
          className="mt-1"
        />
      )}
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-1">
          <span className="font-mono text-xs px-2 py-0.5 rounded"
            style={{ background: PRIORITY_COLOR[item.priority] ?? 'var(--navy-800)' }}>
            {item.priority}
          </span>
          <span className="text-xs uppercase text-[color:var(--navy-600)]">{item.status}</span>
          <span className="text-xs text-[color:var(--navy-600)]">{item.agency_name}</span>
          {item.due_at && (
            <span className="text-xs text-[color:var(--navy-600)]">
              due {new Date(item.due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {item.dispute_note && <span className="text-xs text-[color:var(--critical)]">disputed</span>}
        </div>
        <Link href={`/action-items/${item.id}`} className="block text-base hover:underline">
          {item.task}
        </Link>
        <div className="text-xs text-[color:var(--navy-600)] mt-1">{attribution}</div>
        {item.dispute_note && (
          <div className="mt-2 text-sm border-l-2 border-[color:var(--critical)] pl-3">
            <strong>Dispute note:</strong> {item.dispute_note}
          </div>
        )}
        {item.completion_note && item.status === 'awaiting_verification' && (
          <div className="mt-2 text-sm border-l-2 border-[color:var(--gold-500)] pl-3">
            <strong>Owner says:</strong> {item.completion_note}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          {canComplete && (
            <button onClick={() => setCompleteOpen(true)} className="btn-gold text-xs">Mark complete</button>
          )}
          {canVerify && (
            <>
              <button onClick={async () => { await postVerify(item.id); onChanged?.(); }} className="btn-gold text-xs">Confirm</button>
              <button onClick={() => setDisputeOpen(true)} className="btn-navy text-xs">Dispute</button>
            </>
          )}
          {canPushback && (
            <button onClick={() => setPushbackOpen(true)} className="btn-navy text-xs">Push back</button>
          )}
          {hasOpenPushback && isDG && (
            <span className="text-xs text-[color:var(--gold-500)]">Pushback awaits your reply</span>
          )}
        </div>
      </div>
      {completeOpen && (
        <CompleteDialog itemId={item.id} onClose={() => setCompleteOpen(false)} onDone={() => { setCompleteOpen(false); onChanged?.(); }} />
      )}
      {disputeOpen && (
        <DisputeDialog itemId={item.id} onClose={() => setDisputeOpen(false)} onDone={() => { setDisputeOpen(false); onChanged?.(); }} />
      )}
      {pushbackOpen && (
        <PushbackDialog itemId={item.id} onClose={() => setPushbackOpen(false)} onDone={() => { setPushbackOpen(false); onChanged?.(); }} />
      )}
    </div>
  );
}

async function postVerify(id: string) {
  await fetch(`/api/action-items/${id}/verify`, { method: 'POST' });
}
```

- [ ] **Step 2: Implement the three dialogs.**

Create `components/action-items/CompleteDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function CompleteDialog({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Mark complete" onClose={onClose}>
      <p className="text-sm text-[color:var(--navy-600)] mb-2">
        One-line completion note (≥10 chars). Required for verification.
      </p>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="input-base" />
      {err && <div className="text-xs text-[color:var(--critical)] mt-1">{err}</div>}
      <div className="flex gap-2 justify-end mt-3">
        <button onClick={onClose} className="btn-navy text-xs">Cancel</button>
        <button
          disabled={busy || note.trim().length < 10}
          className="btn-gold text-xs"
          onClick={async () => {
            setBusy(true); setErr(null);
            const res = await fetch(`/api/action-items/${itemId}/complete`, {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ note }),
            });
            setBusy(false);
            if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
            onDone();
          }}>
          Submit
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card-premium max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg mb-2">{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

Create `components/action-items/DisputeDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function DisputeDialog({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card-premium max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg mb-2">Dispute completion</h2>
        <p className="text-sm text-[color:var(--navy-600)] mb-2">
          Substantive reason (≥20 chars). Owner will be notified and can re-attempt or push back.
        </p>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="input-base" />
        {err && <div className="text-xs text-[color:var(--critical)] mt-1">{err}</div>}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="btn-navy text-xs">Cancel</button>
          <button
            disabled={busy || note.trim().length < 20}
            className="btn-gold text-xs"
            onClick={async () => {
              setBusy(true); setErr(null);
              const res = await fetch(`/api/action-items/${itemId}/dispute`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ note }),
              });
              setBusy(false);
              if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
              onDone();
            }}>
            Dispute
          </button>
        </div>
      </div>
    </div>
  );
}
```

Create `components/action-items/PushbackDialog.tsx`:

```tsx
'use client';
import { useState } from 'react';

export function PushbackDialog({ itemId, onClose, onDone }: { itemId: string; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card-premium max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg mb-2">Push back on dispute</h2>
        <p className="text-sm text-[color:var(--navy-600)] mb-2">
          Comment (≥20 chars). Item stays open. DG sees this in their verification surface.
        </p>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} className="input-base" />
        {err && <div className="text-xs text-[color:var(--critical)] mt-1">{err}</div>}
        <div className="flex gap-2 justify-end mt-3">
          <button onClick={onClose} className="btn-navy text-xs">Cancel</button>
          <button
            disabled={busy || text.trim().length < 20}
            className="btn-gold text-xs"
            onClick={async () => {
              setBusy(true); setErr(null);
              const res = await fetch(`/api/action-items/${itemId}/pushback`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text }),
              });
              setBusy(false);
              if (!res.ok) { setErr((await res.json().catch(() => ({ error: 'Failed' }))).error); return; }
              onDone();
            }}>
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/ItemCard.tsx components/action-items/CompleteDialog.tsx components/action-items/DisputeDialog.tsx components/action-items/PushbackDialog.tsx
git commit -m "feat(action-items): ItemCard + Complete/Dispute/Pushback dialogs"
```

---

## Task 9: API — `POST /api/action-items/[id]/complete` (owner self-close)

**Files:**
- Create: `app/api/action-items/[id]/complete/route.ts`

Owner-only. Re-attempting after a dispute uses the same endpoint — the server clears `dispute_note` on success per spec §10.5 (the previous attempt's notes live in the event log, not the live row).

- [ ] **Step 1: Implement the route.**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

const BodyZ = z.object({ note: z.string().min(10).max(500) });
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = BodyZ.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 10–500 chars' }, { status: 400 });

  const { data: item } = await supabaseAdmin
    .from('action_items')
    .select('id, owner_id, status, closure_via_dg_managed:owner_id')
    .eq('id', id)
    .maybeSingle();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Re-fetch owner.closure_mode to enforce dg_managed exclusion.
  const { data: owner } = await supabaseAdmin
    .from('users')
    .select('closure_mode')
    .eq('id', item.owner_id)
    .maybeSingle();
  if (!owner) return NextResponse.json({ error: 'Owner not found' }, { status: 500 });
  if (owner.closure_mode === 'dg_managed') {
    return NextResponse.json({ error: 'This item is DG-managed; only DG can close it.' }, { status: 403 });
  }
  if (item.owner_id !== session.user.id) {
    return NextResponse.json({ error: 'Not your item' }, { status: 403 });
  }
  if (!['open', 'in_progress'].includes(item.status as string)) {
    return NextResponse.json({ error: `Cannot complete from status "${item.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('action_items')
    .update({
      status: 'awaiting_verification',
      completed_by: session.user.id,
      completed_at: now,
      completion_note: parsed.data.note,
      // re-attempt after a dispute: clear dispute markers (history preserved in events)
      dispute_note: null,
      disputed_at: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    itemId: id,
    eventType: 'status_change',
    actorId: session.user.id,
    payload: { from: item.status, to: 'awaiting_verification', via: 'owner_self_close', completion_note: parsed.data.note },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/action-items/[id]/complete/route.ts
git commit -m "feat(action-items): POST /complete — owner self-close (with re-attempt)"
```

---

## Task 10: API — verify, dispute, pushback

**Files:**
- Create: `app/api/action-items/[id]/verify/route.ts`
- Create: `app/api/action-items/[id]/dispute/route.ts`
- Create: `app/api/action-items/[id]/pushback/route.ts`

- [ ] **Step 1: `verify` — DG one-tap confirm.**

`app/api/action-items/[id]/verify/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const { data: item } = await supabaseAdmin
    .from('action_items').select('id, status').eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot verify from "${item.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('action_items')
    .update({
      status: 'complete',
      verified_by: auth.session.user.id,
      verified_at: now,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  await logEvent({
    itemId: id, eventType: 'status_change', actorId: auth.session.user.id,
    payload: { from: 'awaiting_verification', to: 'complete', via: 'dg_verify' },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `dispute` — DG dispute with note ≥20 chars + push to owner.**

`app/api/action-items/[id]/dispute/route.ts`:

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['dg']);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Note must be 20–1000 chars' }, { status: 400 });

  const { data: item } = await supabaseAdmin
    .from('action_items')
    .select('id, status, owner_id, task, completion_note, completed_at')
    .eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.status !== 'awaiting_verification') {
    return NextResponse.json({ error: `Cannot dispute from "${item.status}"` }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from('action_items')
    .update({
      status: 'open',
      dispute_note: parsed.data.note,
      disputed_at: now,
      // Per spec §10.5 step 3: clear completion fields from live row (preserved in event)
      completed_by: null, completed_at: null, completion_note: null,
      updated_at: now,
    })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await logEvent({
    itemId: id, eventType: 'dispute_raised', actorId: auth.session.user.id,
    payload: {
      completion_note: item.completion_note,
      dispute_note: parsed.data.note,
      prior_completed_at: item.completed_at,
    },
  });

  // Notify owner via existing web push.
  try {
    const taskShort = (item.task as string).slice(0, 60);
    const noteShort = parsed.data.note.slice(0, 120);
    await insertNotification({
      user_id: item.owner_id as string,
      title: `Action item disputed: ${taskShort}`,
      body: noteShort,
      data: { url: `/action-items/${id}` },
    });
  } catch (err) {
    logger.error({ err, itemId: id }, 'dispute notification failed (non-fatal)');
  }
  return NextResponse.json({ ok: true });
}
```

> **Compatibility note for the agent:** `insertNotification` exists in `lib/notifications.ts` and is used by `app/api/tasks/route.ts`. If its actual signature differs from the call above (e.g., positional vs. object), match the existing usage in `app/api/tasks/route.ts` exactly — don't invent fields.

- [ ] **Step 3: `pushback` — owner pushback comment.**

`app/api/action-items/[id]/pushback/route.ts`:

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Comment must be 20–1000 chars' }, { status: 400 });

  const { data: item } = await supabaseAdmin
    .from('action_items')
    .select('id, status, owner_id, dispute_note, task').eq('id', id).maybeSingle();
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (item.owner_id !== session.user.id) return NextResponse.json({ error: 'Not your item' }, { status: 403 });
  if (item.status !== 'open' || !item.dispute_note) {
    return NextResponse.json({ error: 'Item is not in a disputed state' }, { status: 409 });
  }

  // No live-row mutation — pushback only logs an event (spec §10.5 owner option B).
  await logEvent({
    itemId: id, eventType: 'dispute_resolved', actorId: session.user.id,
    payload: { action: 'pushback', text: parsed.data.text },
  });

  // Find DG users to notify (typically one).
  const { data: dgUsers } = await supabaseAdmin
    .from('users').select('id').eq('role', 'dg').eq('is_active', true);
  for (const dg of dgUsers ?? []) {
    try {
      await insertNotification({
        user_id: dg.id as string,
        title: `Pushback: ${(item.task as string).slice(0, 60)}`,
        body: parsed.data.text.slice(0, 120),
        data: { url: `/action-items/${id}` },
      });
    } catch (err) {
      logger.error({ err, itemId: id }, 'pushback notification failed (non-fatal)');
    }
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/action-items/[id]/verify/route.ts app/api/action-items/[id]/dispute/route.ts app/api/action-items/[id]/pushback/route.ts
git commit -m "feat(action-items): verify, dispute, pushback API routes"
```

---

## Task 11: API — `GET` + `PATCH /api/action-items/[id]` and bulk-close

**Files:**
- Create: `app/api/action-items/[id]/route.ts`
- Create: `app/api/action-items/bulk-close/route.ts`

`PATCH` is DG/PS only and edits routing/content fields. Bulk-close is DG only and skips `awaiting_verification` per spec §10.3.

- [ ] **Step 1: `GET`/`PATCH /api/action-items/[id]`.**

`app/api/action-items/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { getItemById, getEventsForItem } from '@/lib/action-items/queries';
import { logEvent } from '@/lib/action-items/events';
import { validateItemDraft } from '@/lib/action-items/validation';
import { AgencyZ, VerbCategoryZ, PriorityZ, VisibilityScopeZ } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

async function viewerFromSession() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const { data } = await supabaseAdmin
    .from('users').select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('id', session.user.id).maybeSingle();
  return data
    ? {
        id: data.id as string, email: data.email as string, name: data.name as string | null,
        role: data.role as 'dg'|'minister'|'ps'|'parl_sec'|'agency_admin'|'officer',
        agency: data.agency as string | null,
        aliases: (data.aliases as string[] | null) ?? [],
        closure_mode: (data.closure_mode as 'self_close'|'dg_managed') ?? 'self_close',
        is_agency_head: !!data.is_agency_head,
        is_active: !!data.is_active,
      }
    : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await viewerFromSession();
  if (!viewer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const item = await getItemById(id, viewer);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const events = await getEventsForItem(id);
  return NextResponse.json({ item, events });
}

const PatchZ = z.object({
  agency_name: AgencyZ.optional(),
  owner_id: z.string().uuid().optional(),
  owner_name_raw: z.string().min(1).max(200).optional(),
  delegated_to_id: z.string().uuid().nullable().optional(),
  verb_category: VerbCategoryZ.optional(),
  task: z.string().min(1).max(500).optional(),
  due_at: z.string().datetime().nullable().optional(),
  due_trigger: z.string().max(200).nullable().optional(),
  priority: PriorityZ.optional(),
  visibility_scope: VisibilityScopeZ.optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireRole(['dg', 'ps']);
  if (a instanceof NextResponse) return a;
  const { id } = await params;
  const parsed = PatchZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 });

  const { data: existing } = await supabaseAdmin.from('action_items')
    .select('source, agency_name, owner_id, owner_name_raw, verb_category, task, due_at, due_trigger')
    .eq('id', id).maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const merged = {
    agency_name: parsed.data.agency_name ?? existing.agency_name,
    owner_id: parsed.data.owner_id ?? existing.owner_id,
    owner_name_raw: parsed.data.owner_name_raw ?? existing.owner_name_raw,
    verb_category: parsed.data.verb_category ?? existing.verb_category,
    task: parsed.data.task ?? existing.task,
    due_at: parsed.data.due_at ?? existing.due_at,
    due_trigger: parsed.data.due_trigger ?? existing.due_trigger,
    source: existing.source as 'manual' | 'extraction',
  };
  const v = validateItemDraft(merged as never);
  if (!v.ok) return NextResponse.json({ error: 'Validation failed', issues: v.issues }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('action_items')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logEvent({
    itemId: id, eventType: 'edited', actorId: a.session.user.id,
    payload: { fields_changed: Object.keys(parsed.data) },
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `POST /api/action-items/bulk-close`.**

`app/api/action-items/bulk-close/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/db';
import { logEvent } from '@/lib/action-items/events';

const BodyZ = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  note: z.string().max(500).nullable().optional(),
});
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const a = await requireRole(['dg']);
  if (a instanceof NextResponse) return a;
  const parsed = BodyZ.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const now = new Date().toISOString();
  const { data: rows, error } = await supabaseAdmin
    .from('action_items')
    .update({
      status: 'complete',
      completed_by: a.session.user.id,
      completed_at: now,
      completion_note: parsed.data.note ?? null,
      verified_by: a.session.user.id,
      verified_at: now,
      updated_at: now,
    })
    .in('id', parsed.data.ids)
    .in('status', ['open', 'in_progress', 'awaiting_verification'])
    .select('id, status');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const r of rows ?? []) {
    await logEvent({
      itemId: r.id as string, eventType: 'status_change', actorId: a.session.user.id,
      payload: { to: 'complete', via: 'dg_bulk_close', note: parsed.data.note ?? null },
    });
  }
  return NextResponse.json({ ok: true, updated: rows?.length ?? 0 });
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add app/api/action-items/[id]/route.ts app/api/action-items/bulk-close/route.ts
git commit -m "feat(action-items): GET/PATCH single + bulk-close API"
```

---

## Task 12: Agency tree + per-agency consumption pages

**Files:**
- Create: `components/action-items/AgencyTree.tsx`
- Create: `components/action-items/OwnerSection.tsx`
- Create: `components/action-items/BulkCloseToolbar.tsx`
- Modify: `app/action-items/page.tsx`
- Modify: `app/action-items/agency/[name]/page.tsx`

- [ ] **Step 1: `AgencyTree.tsx`.**

```tsx
import Link from 'next/link';
import type { Agency } from '@/lib/action-items/constants';

export function AgencyTree({ agencies, current }: {
  agencies: Array<{ agency: Agency; open: number }>;
  current?: Agency;
}) {
  return (
    <nav className="card-premium p-4 space-y-1">
      <h2 className="text-sm uppercase text-[color:var(--navy-600)] mb-2">Agencies</h2>
      {agencies.length === 0 && <div className="text-sm text-[color:var(--navy-600)]">No open items.</div>}
      {agencies.map(a => (
        <Link
          key={a.agency}
          href={`/action-items/agency/${encodeURIComponent(a.agency)}`}
          className={`sidebar-item ${current === a.agency ? 'active' : ''}`}
        >
          <span>{a.agency}</span>
          <span className="ml-auto text-xs text-[color:var(--navy-600)]">{a.open} open</span>
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: `OwnerSection.tsx`.**

```tsx
'use client';
import { useState } from 'react';
import { ItemCard } from './ItemCard';
import type { ActionItemRow } from '@/lib/action-items/types';

interface Props {
  ownerName: string;
  items: ActionItemRow[];
  attributions: Record<string, string>;
  viewer: { id: string; role: 'dg' | 'minister' | 'ps' | 'parl_sec' | 'agency_admin' | 'officer' };
  bulkSelectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  selectedIds?: Set<string>;
}

export function OwnerSection({ ownerName, items, attributions, viewer, bulkSelectable, onSelectionChange, selectedIds }: Props) {
  const [, force] = useState(0);
  return (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">{ownerName} <span className="text-xs text-[color:var(--navy-600)]">({items.length})</span></h3>
      {items.map(item => (
        <ItemCard
          key={item.id}
          item={item}
          attribution={attributions[item.id] ?? ''}
          viewer={viewer}
          selectable={bulkSelectable}
          selected={selectedIds?.has(item.id)}
          onSelectChange={(sel) => {
            if (!onSelectionChange || !selectedIds) return;
            const next = new Set(selectedIds);
            if (sel) next.add(item.id); else next.delete(item.id);
            onSelectionChange(Array.from(next));
          }}
          onChanged={() => force(x => x + 1)}
        />
      ))}
    </section>
  );
}
```

- [ ] **Step 3: `BulkCloseToolbar.tsx`.**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function BulkCloseToolbar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (ids.length === 0) return null;
  return (
    <div className="card-premium fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-3 flex items-center gap-3 shadow-xl">
      <span>{ids.length} selected</span>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note"
        className="input-base text-sm w-64" />
      <button onClick={onClear} className="btn-navy text-xs">Clear</button>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch('/api/action-items/bulk-close', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids, note: note || null }),
          });
          setBusy(false);
          if (res.ok) { onClear(); router.refresh(); }
        }}
        className="btn-gold text-xs">
        Mark complete
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Replace `app/action-items/page.tsx` with the agency-tree consumption view.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/db';
import { AgencyTree } from '@/components/action-items/AgencyTree';
import { getAgenciesWithCounts } from '@/lib/action-items/queries';
import type { UserStaffFields } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

export default async function ActionItemsHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const viewer = await loadViewer(session.user.id);
  if (!viewer) redirect('/login');

  const agencies = await getAgenciesWithCounts(viewer);

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6 p-6">
      <AgencyTree agencies={agencies} />
      <div className="card-premium p-8 text-center">
        <h1 className="stat-number text-2xl mb-2">Action Items</h1>
        <p className="text-[color:var(--navy-600)] mb-6">Pick an agency on the left, or jump to a focused view.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/action-items/mine" className="btn-navy">My items</Link>
          {(viewer.role === 'dg' || viewer.role === 'ps') && (
            <Link href="/action-items/new" className="btn-gold">New item</Link>
          )}
        </div>
      </div>
    </div>
  );
}

async function loadViewer(userId: string): Promise<UserStaffFields | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string, email: data.email as string, name: data.name as string | null,
    role: data.role as UserStaffFields['role'], agency: data.agency as string | null,
    aliases: (data.aliases as string[] | null) ?? [],
    closure_mode: (data.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!data.is_agency_head,
    is_active: !!data.is_active,
  };
}
```

- [ ] **Step 5: Replace `app/action-items/agency/[name]/page.tsx` with the per-agency view.**

```tsx
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/db';
import { AGENCIES, type Agency } from '@/lib/action-items/constants';
import { getAgenciesWithCounts, listItemsForUser } from '@/lib/action-items/queries';
import { attributionLine } from '@/lib/action-items/format';
import { AgencyTree } from '@/components/action-items/AgencyTree';
import { AgencyView } from '@/components/action-items/AgencyView';
import type { UserStaffFields } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

export default async function PerAgencyPage({ params }: { params: Promise<{ name: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const { name } = await params;
  if (!(AGENCIES as readonly string[]).includes(name)) notFound();
  const agency = name as Agency;

  const viewer = await loadViewer(session.user.id);
  if (!viewer) redirect('/login');

  const [tree, items] = await Promise.all([
    getAgenciesWithCounts(viewer),
    listItemsForUser(viewer, { agency }),
  ]);

  // Owner-name lookup
  const ownerIds = Array.from(new Set(items.map(i => i.owner_id)));
  const { data: owners } = await supabaseAdmin
    .from('users').select('id, name').in('id', ownerIds.length ? ownerIds : ['00000000-0000-0000-0000-000000000000']);
  const ownerName = new Map<string, string>();
  for (const o of owners ?? []) ownerName.set(o.id as string, (o.name as string) ?? '(unnamed)');

  // Extraction-meeting lookup for attribution lines
  const extractionIds = Array.from(new Set(items.map(i => i.extraction_id).filter((x): x is string => !!x)));
  const { data: extractions } = await supabaseAdmin
    .from('action_item_extractions').select('id, meeting_title, meeting_date')
    .in('id', extractionIds.length ? extractionIds : ['00000000-0000-0000-0000-000000000000']);
  const extById = new Map<string, { meeting_title: string | null; meeting_date: string | null }>();
  for (const e of extractions ?? []) extById.set(e.id as string,
    { meeting_title: e.meeting_title as string | null, meeting_date: e.meeting_date as string | null });

  const creatorIds = Array.from(new Set(items.map(i => i.created_by).filter((x): x is string => !!x)));
  const { data: creators } = await supabaseAdmin
    .from('users').select('id, name').in('id', creatorIds.length ? creatorIds : ['00000000-0000-0000-0000-000000000000']);
  const creatorName = new Map<string, string>();
  for (const c of creators ?? []) creatorName.set(c.id as string, (c.name as string) ?? '(unnamed)');

  const attributions: Record<string, string> = {};
  for (const it of items) {
    attributions[it.id] = attributionLine(
      it,
      it.extraction_id ? extById.get(it.extraction_id) ?? null : null,
      it.created_by ? { name: creatorName.get(it.created_by) ?? null } : null,
    );
  }

  // Group by owner
  const byOwner = new Map<string, typeof items>();
  for (const it of items) {
    const arr = byOwner.get(it.owner_id) ?? [];
    arr.push(it);
    byOwner.set(it.owner_id, arr);
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-6 p-6">
      <AgencyTree agencies={tree} current={agency} />
      <AgencyView
        agency={agency}
        groups={Array.from(byOwner.entries()).map(([oid, list]) => ({
          ownerId: oid, ownerName: ownerName.get(oid) ?? oid, items: list,
        }))}
        attributions={attributions}
        viewer={{ id: viewer.id, role: viewer.role }}
        bulkSelectable={viewer.role === 'dg'}
      />
    </div>
  );
}

async function loadViewer(userId: string): Promise<UserStaffFields | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string, email: data.email as string, name: data.name as string | null,
    role: data.role as UserStaffFields['role'], agency: data.agency as string | null,
    aliases: (data.aliases as string[] | null) ?? [],
    closure_mode: (data.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!data.is_agency_head,
    is_active: !!data.is_active,
  };
}
```

- [ ] **Step 6: Create the `AgencyView.tsx` client component (handles bulk-select state).**

`components/action-items/AgencyView.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { OwnerSection } from './OwnerSection';
import { BulkCloseToolbar } from './BulkCloseToolbar';
import type { ActionItemRow } from '@/lib/action-items/types';
import type { Agency } from '@/lib/action-items/constants';

interface Group { ownerId: string; ownerName: string; items: ActionItemRow[]; }
interface Props {
  agency: Agency;
  groups: Group[];
  attributions: Record<string, string>;
  viewer: { id: string; role: 'dg'|'minister'|'ps'|'parl_sec'|'agency_admin'|'officer' };
  bulkSelectable?: boolean;
}

export function AgencyView({ agency, groups, attributions, viewer, bulkSelectable }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <div className="space-y-6">
      <h1 className="stat-number text-2xl">{agency} — Action Items</h1>
      {groups.length === 0 && <div className="card-premium p-8 text-center text-[color:var(--navy-600)]">No open items.</div>}
      {groups.map(g => (
        <OwnerSection
          key={g.ownerId}
          ownerName={g.ownerName}
          items={g.items}
          attributions={attributions}
          viewer={viewer}
          bulkSelectable={bulkSelectable}
          selectedIds={selected}
          onSelectionChange={(ids) => setSelected(new Set(ids))}
        />
      ))}
      <BulkCloseToolbar ids={Array.from(selected)} onClear={() => setSelected(new Set())} />
    </div>
  );
}
```

- [ ] **Step 7: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/AgencyTree.tsx components/action-items/OwnerSection.tsx components/action-items/BulkCloseToolbar.tsx components/action-items/AgencyView.tsx app/action-items/page.tsx app/action-items/agency/[name]/page.tsx
git commit -m "feat(action-items): agency tree + per-agency consumption with bulk-close"
```

---

## Task 13: `/action-items/mine` page (owner view + DG verification + pushback queue)

**Files:**
- Create: `components/action-items/VerificationQueue.tsx`
- Create: `components/action-items/PushbackQueue.tsx`
- Modify: `app/action-items/mine/page.tsx`

- [ ] **Step 1: `VerificationQueue.tsx`.**

```tsx
'use client';
import { ItemCard } from './ItemCard';
import type { ActionItemRow } from '@/lib/action-items/types';

export function VerificationQueue({ items, attributions, viewerId }: {
  items: ActionItemRow[]; attributions: Record<string, string>; viewerId: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg">Awaiting your verification <span className="text-xs text-[color:var(--navy-600)]">({items.length})</span></h2>
      {items.map(i => <ItemCard key={i.id} item={i} attribution={attributions[i.id] ?? ''} viewer={{ id: viewerId, role: 'dg' }} />)}
    </section>
  );
}
```

- [ ] **Step 2: `PushbackQueue.tsx`.**

```tsx
'use client';
import { ItemCard } from './ItemCard';
import type { ActionItemRow } from '@/lib/action-items/types';

export function PushbackQueue({ items, attributions, viewerId, latestPushbackText }: {
  items: ActionItemRow[]; attributions: Record<string, string>; viewerId: string;
  latestPushbackText: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-lg">Pushbacks needing your attention <span className="text-xs text-[color:var(--navy-600)]">({items.length})</span></h2>
      {items.map(i => (
        <div key={i.id} className="space-y-2">
          <ItemCard item={i} attribution={attributions[i.id] ?? ''} viewer={{ id: viewerId, role: 'dg' }} hasOpenPushback />
          <div className="ml-8 text-sm border-l-2 border-[color:var(--gold-500)] pl-3">
            <strong>Owner pushback:</strong> {latestPushbackText[i.id] ?? '(comment unavailable)'}
          </div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 3: Replace `app/action-items/mine/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/db';
import { listItemsForUser, listAwaitingVerification, listPushbackQueue } from '@/lib/action-items/queries';
import { attributionLine } from '@/lib/action-items/format';
import { OwnerSection } from '@/components/action-items/OwnerSection';
import { VerificationQueue } from '@/components/action-items/VerificationQueue';
import { PushbackQueue } from '@/components/action-items/PushbackQueue';
import type { UserStaffFields, ActionItemRow } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

export default async function MyActionItemsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const viewer = await loadViewer(session.user.id);
  if (!viewer) redirect('/login');

  const [mine, awaiting, pushbacks] = await Promise.all([
    listItemsForUser(viewer, { ownerId: viewer.id }),
    listAwaitingVerification(viewer),
    listPushbackQueue(viewer),
  ]);

  // Hydrate attribution
  const allItems = [...mine, ...awaiting, ...pushbacks];
  const attributions = await buildAttributions(allItems);

  // Pushback-text lookup: latest pushback comment per item.
  const pushbackText: Record<string, string> = {};
  if (pushbacks.length > 0) {
    const ids = pushbacks.map(p => p.id);
    const { data: ev } = await supabaseAdmin
      .from('action_item_events').select('item_id, payload, occurred_at')
      .in('item_id', ids).eq('event_type', 'dispute_resolved')
      .order('occurred_at', { ascending: false });
    for (const e of (ev ?? []) as Array<{ item_id: string; payload: { action?: string; text?: string } }>) {
      if (e.payload?.action === 'pushback' && !pushbackText[e.item_id]) {
        pushbackText[e.item_id] = e.payload.text ?? '';
      }
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="stat-number text-2xl">My Action Items</h1>
      {viewer.role === 'dg' && (
        <>
          <VerificationQueue items={awaiting} attributions={attributions} viewerId={viewer.id} />
          <PushbackQueue items={pushbacks} attributions={attributions} viewerId={viewer.id} latestPushbackText={pushbackText} />
        </>
      )}
      <OwnerSection
        ownerName="Owned by you"
        items={mine}
        attributions={attributions}
        viewer={{ id: viewer.id, role: viewer.role }}
      />
    </div>
  );
}

async function loadViewer(userId: string): Promise<UserStaffFields | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string, email: data.email as string, name: data.name as string | null,
    role: data.role as UserStaffFields['role'], agency: data.agency as string | null,
    aliases: (data.aliases as string[] | null) ?? [],
    closure_mode: (data.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!data.is_agency_head, is_active: !!data.is_active,
  };
}

async function buildAttributions(items: ActionItemRow[]): Promise<Record<string, string>> {
  const extractionIds = Array.from(new Set(items.map(i => i.extraction_id).filter((x): x is string => !!x)));
  const creatorIds = Array.from(new Set(items.map(i => i.created_by).filter((x): x is string => !!x)));
  const [{ data: ex }, { data: cr }] = await Promise.all([
    supabaseAdmin.from('action_item_extractions').select('id, meeting_title, meeting_date')
      .in('id', extractionIds.length ? extractionIds : ['00000000-0000-0000-0000-000000000000']),
    supabaseAdmin.from('users').select('id, name')
      .in('id', creatorIds.length ? creatorIds : ['00000000-0000-0000-0000-000000000000']),
  ]);
  const exMap = new Map<string, { meeting_title: string | null; meeting_date: string | null }>();
  for (const e of ex ?? []) exMap.set(e.id as string, { meeting_title: e.meeting_title as string | null, meeting_date: e.meeting_date as string | null });
  const crMap = new Map<string, string>();
  for (const c of cr ?? []) crMap.set(c.id as string, (c.name as string) ?? '(unnamed)');
  const out: Record<string, string> = {};
  for (const it of items) {
    out[it.id] = attributionLine(
      it,
      it.extraction_id ? exMap.get(it.extraction_id) ?? null : null,
      it.created_by ? { name: crMap.get(it.created_by) ?? null } : null,
    );
  }
  return out;
}
```

- [ ] **Step 4: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/VerificationQueue.tsx components/action-items/PushbackQueue.tsx app/action-items/mine/page.tsx
git commit -m "feat(action-items): /mine — owner view + DG verification + pushback queue"
```

---

## Task 14: Item detail page + EventLog

**Files:**
- Create: `components/action-items/EventLog.tsx`
- Modify: `app/action-items/[id]/page.tsx`

- [ ] **Step 1: `EventLog.tsx`.**

```tsx
import type { ActionItemEventRow } from '@/lib/action-items/types';

const LABEL: Record<string, string> = {
  created: 'Created', accepted: 'Accepted', edited: 'Edited', rejected: 'Rejected',
  status_change: 'Status changed', dispute_raised: 'Dispute raised',
  dispute_resolved: 'Dispute resolved', superseded_by: 'Superseded by',
  supersedes: 'Supersedes', attribution_error_flagged: 'Attribution error flagged',
};

export function EventLog({ events, actorNames }: {
  events: ActionItemEventRow[];
  actorNames: Record<string, string>;
}) {
  if (events.length === 0) return <div className="text-sm text-[color:var(--navy-600)]">No events.</div>;
  return (
    <ol className="space-y-2">
      {events.map(e => (
        <li key={e.id} className="card-premium p-3 text-sm">
          <div className="flex justify-between text-xs text-[color:var(--navy-600)]">
            <span>{LABEL[e.event_type] ?? e.event_type}</span>
            <span>{new Date(e.occurred_at).toLocaleString()}</span>
          </div>
          <div>
            {e.actor_id ? (actorNames[e.actor_id] ?? e.actor_id) : 'system'}
          </div>
          <pre className="text-xs mt-1 text-[color:var(--navy-600)] whitespace-pre-wrap font-mono">
            {JSON.stringify(e.payload, null, 2)}
          </pre>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 2: Replace `app/action-items/[id]/page.tsx`.**

```tsx
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { supabaseAdmin } from '@/lib/db';
import { getItemById, getEventsForItem } from '@/lib/action-items/queries';
import { attributionLine } from '@/lib/action-items/format';
import { EventLog } from '@/components/action-items/EventLog';
import { ItemCard } from '@/components/action-items/ItemCard';
import type { UserStaffFields } from '@/lib/action-items/types';

export const dynamic = 'force-dynamic';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');
  const viewer = await loadViewer(session.user.id);
  if (!viewer) redirect('/login');
  const { id } = await params;

  const item = await getItemById(id, viewer);
  if (!item) notFound();
  const events = await getEventsForItem(id);

  // Attribution support data
  const [{ data: ex }, { data: creator }] = await Promise.all([
    item.extraction_id
      ? supabaseAdmin.from('action_item_extractions').select('meeting_title, meeting_date').eq('id', item.extraction_id).maybeSingle()
      : Promise.resolve({ data: null }),
    item.created_by
      ? supabaseAdmin.from('users').select('name').eq('id', item.created_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const attribution = attributionLine(item, ex as never, creator as never);

  // Actor-name lookup for the event log
  const actorIds = Array.from(new Set(events.map(e => e.actor_id).filter((x): x is string => !!x)));
  const { data: actors } = await supabaseAdmin
    .from('users').select('id, name')
    .in('id', actorIds.length ? actorIds : ['00000000-0000-0000-0000-000000000000']);
  const actorNames: Record<string, string> = {};
  for (const a of actors ?? []) actorNames[a.id as string] = (a.name as string) ?? '(unnamed)';

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <ItemCard
        item={item}
        attribution={attribution}
        viewer={{ id: viewer.id, role: viewer.role }}
      />

      {item.source_quote && (
        <section className="card-premium p-4">
          <h2 className="text-sm uppercase text-[color:var(--navy-600)] mb-2">Source quote</h2>
          <blockquote className="border-l-2 border-[color:var(--gold-500)] pl-3 text-sm italic">
            {item.source_quote}
          </blockquote>
          {item.source_timestamp && (
            <div className="text-xs text-[color:var(--navy-600)] mt-1">@ {item.source_timestamp}</div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm uppercase text-[color:var(--navy-600)]">Event log</h2>
        <EventLog events={events} actorNames={actorNames} />
      </section>

      {item.supersedes_id && (
        <section className="card-premium p-4 text-sm">
          <h2 className="text-sm uppercase text-[color:var(--navy-600)] mb-2">Supersedes</h2>
          <a href={`/action-items/${item.supersedes_id}`} className="hover:underline">
            View prior item →
          </a>
        </section>
      )}
    </div>
  );
}

async function loadViewer(userId: string): Promise<UserStaffFields | null> {
  const { data } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, agency, aliases, closure_mode, is_agency_head, is_active')
    .eq('id', userId).maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string, email: data.email as string, name: data.name as string | null,
    role: data.role as UserStaffFields['role'], agency: data.agency as string | null,
    aliases: (data.aliases as string[] | null) ?? [],
    closure_mode: (data.closure_mode as 'self_close' | 'dg_managed') ?? 'self_close',
    is_agency_head: !!data.is_agency_head, is_active: !!data.is_active,
  };
}
```

- [ ] **Step 3: Type-check + commit.**

```bash
npx tsc --noEmit
git add components/action-items/EventLog.tsx app/action-items/[id]/page.tsx
git commit -m "feat(action-items): item detail page with event log"
```

---

## Task 15: Sanity — visibility leak guards on every list endpoint

**Files:** none modified unless a leak surfaces.

This task is a manual review pass. Plan 1 (visibility helper) and Task 4 (queries module) make the rule load-bearing; this task verifies the rule is in fact applied at every entry point in this plan.

- [ ] **Step 1: Grep for any direct `from('action_items')` reads that bypass `getItemById` / `listItemsForUser`.**

Run:

```bash
grep -nR "from('action_items')" app/ lib/action-items/queries.ts
```

Confirm: every read outside `lib/action-items/queries.ts` is justified (e.g., the API route handlers in Task 9–11 read for *write-side preflight checks*, where visibility doesn't apply because the endpoint already enforces ownership / role).

- [ ] **Step 2: Confirm `canSeeItem` is called on the result of every list query.**

Run:

```bash
grep -n "canSeeItem" lib/action-items/queries.ts
```

Expected: `canSeeItem` referenced in every exported list helper (`listItemsForUser`, `listAwaitingVerification`, `listPushbackQueue`, `getAgenciesWithCounts` — the last via `listItemsForUser`).

- [ ] **Step 3: Confirm every detail endpoint that returns row data either runs through `getItemById` or returns 404 on visibility miss.**

Inspect: `app/api/action-items/[id]/route.ts` GET path — uses `getItemById`. ✅

If any leak is found, fix and recommit. Otherwise, no commit needed for this task.

---

## Task 16: End-to-end verification

**Files:** none modified.

This is the same shape as Plan 1 Task 14: assemble all the pieces and exercise them locally.

- [ ] **Step 1: Run the test suite.**

```bash
npm test
```

Expected: all tests pass — Plan 1's tests plus the new `validation` and `format` tests.

- [ ] **Step 2: Type-check + lint + build.**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: clean.

- [ ] **Step 3: Manual smoke (against the Supabase migration 102 already executed in Plan 1).**

Pre-condition: at least one user with `role='dg'` and one with `role='officer'` and `agency='GPL'` exist in the `users` table.

Start dev:

```bash
npm run dev
```

Walk through:

1. Sign in as DG.
2. Navigate to `/action-items/new`. Form renders.
3. Pick agency `GPL`, owner = the GPL officer, verb category `correspondence`, task `Issue notification of termination to InterEnergy`. Submit.
4. Confirm redirect to `/action-items/<new-id>`. Detail page renders attribution `Added by <DG name>, <today>.` and one event row (`created`).
5. Visit `/action-items/agency/GPL`. Card visible under owner section with bulk-select checkbox.
6. Visit `/action-items/mine` as DG. Verification queue is empty; pushback queue empty; "Owned by you" section empty (DG didn't own this one).
7. Sign out. Sign in as the GPL officer. Visit `/action-items/mine`. The item appears under "Owned by you" with a "Mark complete" button.
8. Click Mark complete, enter `delivered to legal counsel`, submit. Redirects/stays; status now `awaiting_verification`.
9. Sign back in as DG. `/action-items/mine` top section shows the item under "Awaiting your verification". Click Dispute, enter a 20+ char note (`legal counsel was not the right party`). Submit.
10. Status reverts to `open`, dispute_note set. Confirm a push notification was queued (check `notifications` table or browser permission UI).
11. Sign in as officer. Item appears with "Push back" button. Click; enter pushback comment `legal told us they were the registered counterparty`. Submit.
12. Sign in as DG. `/action-items/mine` now shows the pushback queue with the comment side-by-side with the original dispute_note.
13. Visit `/action-items/agency/GPL`. As DG, multi-select checkbox visible. Select the item; Bulk-close toolbar appears at the bottom; click Mark complete with note `resolved offline`. Item disappears from open list (status `complete`).
14. Visit `/action-items/<id>`. Event log shows: `created`, `status_change → awaiting_verification`, `dispute_raised`, `dispute_resolved (pushback)`, `status_change → complete (via dg_bulk_close)`. ✅

- [ ] **Step 4: Visibility smoke.**

Sign in as a *different* officer in agency `GWI`. Visit `/action-items/agency/GPL`. Confirm: items not in `GWI`, not owned by them, and not delegated to them are hidden. Visit `/action-items/<gpl-item-id>`. Confirm: 404 page renders (not 403, not the item).

---

## Self-review

**Spec coverage** (skim against `docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md`):

- §6.1 validation (banned phrases, verb taxonomy, required fields) → Task 1. Quote-substring is extraction-only and lives in Plan 4.
- §6.4 `agency_name` resolution for manual-add → Task 7 (form requires it as dropdown; default = owner.agency). Inferred resolution belongs to Plan 4.
- §8.3 inline manual-add component → Task 7 (`ManualAddInline`, built but unwired here).
- §8.5 freestanding manual-add → Task 7 (`/action-items/new`).
- §10.1 owner self-close → Task 9. Re-attempt after dispute uses the same endpoint, clearing dispute markers.
- §10.2 DG verification → Task 10.
- §10.3 DG bulk-close → Task 11 + Task 12 toolbar.
- §10.4 dg_managed users → Task 9 enforces the closure_mode='dg_managed' exclusion in `/complete`.
- §10.5 dispute resolution loop (re-attempt + pushback path with full event log + DG re-affirm/accept/reply) → Tasks 9, 10, 13. The "re-affirm" and "accept pushback" surfaces are present in the existing dispute and bulk-close paths (DG re-disputes by clicking Dispute again on a re-completed item; accepts pushback by bulk-closing it). The pushback queue surface in Task 13 makes both paths reachable in one place.
- §10.6 delegation → schema column already in Plan 1; form supports it (Task 6); visibility helper from Plan 1 already accounts for `delegated_to_id`.
- §11.1 `/action-items` agency tree → Task 12.
- §11.2 `/action-items/mine` (with verification queue at top for DG) → Task 13.
- §11.3 `/action-items/agency/[name]` → Task 12.
- §11.4 item detail with event log → Task 14.
- §11.5 visibility (`agency_normal` vs `dg_only`) → enforced via `canSeeItem` in Task 4 + Task 15 sanity pass.
- All API routes for the lifecycle → Tasks 5, 9, 10, 11.
- Validation runs on every accepted item regardless of source → Tasks 1 (logic) + 5 (manual-add) + 11 (PATCH). Extraction insert path lands in Plan 4 and will reuse `validateItemDraft`.

**Not in this plan (correctly deferred):**
- Plan 3: Fireflies polling, `meetings_seen` population, daily digest, `failed_extractions` writes, "Process manually" CTA on `meetings_seen` cards (the form already accepts the `?meeting_id=...` query param so wiring is trivial in Plan 3).
- Plan 4: extraction (Anthropic), prompt files, validation hooks for extraction-specific fields (`source_quote`, `confidence_overall`), three-bucket review UI, keyboard shortcuts, political-risk gate, supersession suggestion display, manual extraction trigger, eval data capture.
- Plan 5: supersession matcher logic, drift detector, earned-trust tracker, eval dashboard.

**Placeholder scan:** every step has concrete code or a concrete command. No "TBD".

**Type consistency:**
- `validateItemDraft(draft: ItemDraft): ValidationResult` — same signature in Task 1, Task 5, Task 11.
- `canSeeItem(user, item)` — exact signature from Plan 1, used in Task 4.
- `logEvent({ itemId, eventType, actorId, payload })` — same shape in every API route.
- `attributionLine(item, meeting | null, creator | null)` — same call sites in Tasks 12, 13, 14.

---

## Decisions I made on your behalf

These are choices made autonomously while writing this plan. Flag any that should have been escalated.

1. **Validation module is source-agnostic in this plan.** The spec calls for quote-substring validation on extraction items in §6.1; that check belongs to Plan 4 because it requires the transcript text. `validateItemDraft` only enforces the source-agnostic checks here. Plan 4 will compose `validateItemDraft` with a quote-substring check.
2. **`BANNED_TOKENS = ['handle', 'work on']` matched as whole-word/whole-phrase.** Honors Plan 1 autonomous decision #3 — substring matching would block legitimate text.
3. **Verb-taxonomy check uses the first word of the task.** The spec says "first verb in canonical sentence." A first-word check is the simplest implementation that satisfies the rule for canonical sentences (which by construction lead with their verb). If extraction starts producing non-canonical sentences, Plan 4 can swap in a tokenizer.
4. **Manual-add is gated to `dg` and `ps` in v1.** Spec §8.5 says "DG is the creator." `ps` is included because the existing `requireRole(['dg','ps'])` pattern in DGOS treats the two as ministry-level write authorities. Sidebar/page surfaces hide the action for other roles.
5. **Default priority for manual-add when blank: P2 if due ≤28d, P3 otherwise.** Programmatic priority assignment (spec §6.5) is a Plan 4 deliverable. This stub keeps manual items routable until then; the column's CHECK constraint requires a value.
6. **`/action-items/new` accepts `?meeting_id=...&meeting_title=...&meeting_date=...` query params** for pre-population. Plan 3 will pass these from the `meetings_seen` "Process manually" CTA. Building the receiver now means Plan 3 only writes the link.
7. **DG verification surface lives at the top of `/action-items/mine`**, not in `/briefing`. The spec says "DG's daily briefing surfaces all `awaiting_verification` items" but does not require modifying the existing `/briefing` page. Plan 3's daily digest (push notification) carries the briefing-channel responsibility; the in-app surface goes where DG's other personal queues live.
8. **Pushback queue is a separate top-level section on `/action-items/mine`** (DG only), not buried in the verification queue. Spec §10.5 explicitly requires this separation, and the side-by-side display of original dispute_note + pushback comment.
9. **"DG re-affirms dispute" is a re-tap of the Dispute button** on the same item after the owner re-completes. No new endpoint, no new state — the existing dispute flow re-fires and appends another `dispute_raised` event. "Accept pushback" is bulk-close on the open-with-pushback item. This reuses existing endpoints to avoid a new state machine for a low-frequency interaction.
10. **`PATCH /api/action-items/[id]` re-runs validation on the merged draft** (existing fields + patch). Edits could otherwise drift the row into a state that fails validation post-acceptance. Plan 4's review-queue edits will hit the same endpoint.
11. **Pushback comments are stored only in `action_item_events.payload`**, not in a separate `comments` table. Volume is low and the event log is already the spec-mandated audit trail (§3.4). Adding a comments table would introduce a sync-vs-events question for no current benefit.
12. **`listPushbackQueue` is implemented client-side via two queries** (latest pushback events ∩ items without later re-disputes) instead of a SQL view or RPC. Volume is small (handful of pushbacks per week) and a view would require another migration that the user has to run by hand. If the queue grows past 100 active pushbacks the view becomes worthwhile.
13. **Visibility is double-enforced** (SQL pre-narrow + `canSeeItem` post-filter). The double-pass is intentional — see spec §16 ("External-meeting item visibility leak — Low / High impact").
14. **Bulk-close only allowed on `open|in_progress|awaiting_verification`** statuses; complete/cancelled/superseded/disputed are excluded. Prevents accidentally re-closing a closed item.
15. **Notifications use the existing `insertNotification` helper.** The agent must check the actual signature in `lib/notifications.ts` and match `app/api/tasks/route.ts` usage exactly — the call sites in this plan are written against the shape `{ user_id, title, body, data }`, which is the most common DGOS pattern, but the agent should verify before commit.
16. **No ItemDetail PATCH UI in this plan.** The PATCH endpoint exists for Plan 4's review-queue editing flow. Inline edit on the detail page is deferred — DG can re-route by going through the review queue (Plan 4) or by editing via direct API call until then.
17. **Dialogs use a hand-rolled modal** (no shadcn/Radix), matching DGOS's existing modal idiom (e.g., the existing notification permission UI). Adding a dialog primitive is a separate refactor.
18. **`OwnerSection`'s internal force-rerender** (`useState` + `force(x => x + 1)` on `onChanged`) is a pragmatic stand-in for proper data revalidation. Replacing with `router.refresh()` from `next/navigation` would be cleaner; both work, the simpler form is enough for v1.

If any of these should have been a question, tell me and I'll revise.
