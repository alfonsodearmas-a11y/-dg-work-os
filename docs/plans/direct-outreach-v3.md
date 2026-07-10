# Direct Outreach v3 — Officer-Driven Resolution & Accountability

**Status: PLAN v3 — awaiting decisions on §10. No migration applied, no feature code written.**
Date: 2026-07-10 · Module baseline: migrations 144–149 live (v2 merged `60334f5`): Excel-upload ingestion, multi-filters, responsible officers, agency transfer.

**Goal:** turn the module from a read-only mirror into the place officers actively drive resolution and the minister holds them accountable: writable officer progress updates (@-mentions, notifications), an officer-driven working status + committed target date that survive uploads, a data-driven agency set (adds MARAD + HECI), and accountability signals keyed to *officer* activity instead of the imported comment log.

**Architecture:** everything human-entered lands in DG-OS-owned side tables keyed by `case_id` with **no FK to `direct_outreach_cases`** (the 147/148 snapshot-survival pattern), RLS enabled with zero policies + `REVOKE ALL` (145/146 lineage), all access through the `lib/db-pg` owner pool. The open-cases view (`direct_outreach_open_v`) grows to v4 and remains the single place agency/aging/accountability semantics are computed.

---

## 0. Officer = user (confirmed) — and whether a sub-role is warranted

Confirmed against code:

- Live role set is exactly `superadmin | agency_manager | system` — `users_role_check` rewritten in `128_role_simplification.sql:49-51`; `normalizeRole()` in `lib/auth-session.ts:56-59` admits only the first two into a session.
- "Responsible officer" already IS a user: `direct_outreach_assignments.assignee_user_id uuid NOT NULL REFERENCES users(id)` (migration 147), assigned via `PATCH /api/direct-outreach/[caseId]`, picker fed by `GET /api/tasks/users?agency=` — the same endpoint Tasks uses for assignees. Tasks' model is identical in spirit: single `owner_user_id` on the task, no role.
- `direct-outreach` is a COMMON module (`lib/modules/role-modules.ts:18`) — every agency_manager already has it, agency-scoped by the data layer.

**Recommendation: do NOT add an officer sub-role.** Responsibility here is *per-case assignment*, not a permission class — there is no capability an "officer" role would grant or deny that the assignment row doesn't already express. A third role would touch `users_role_check`, `normalizeRole`, `buildSession`, `role-modules.ts`, the People admin UI, and every `requireRole` audit — for zero new enforcement. If agencies later need non-manager staff accounts (people who can work cases but not, say, upload agency metrics), that is an app-wide roles decision, not a Direct Outreach one. Flagged as Q7 for your confirmation.

One real consequence to note: **PUA cases have no agency_manager** (`'PUA'` is not in `USER_AGENCIES`), so for PUA cases only superadmins can assign/post — unchanged from v2 semantics.

---

## 1. Agencies — one data-driven source, + MARAD + HECI

### 1.1 Current enumeration inventory (verified exhaustive — `grep OUTREACH_AGENCIES|OutreachAgency|'PUA'`)

| Site | Today | v3 |
|---|---|---|
| `lib/direct-outreach/types.ts:5-7` | `type OutreachAgency = 'GPL'\|'GWI'\|'PUA'` + `OUTREACH_AGENCIES` array | **THE source** — rewritten below; type derived from the array |
| `app/api/direct-outreach/[caseId]/transfer/route.ts:18` | `z.enum(OUTREACH_AGENCIES …)` | no change — extends automatically |
| `components/direct-outreach/CaseDetailPanel.tsx:332` | transfer dropdown maps `OUTREACH_AGENCIES` | no change — extends automatically |
| `components/direct-outreach/DirectOutreachDashboard.tsx:378` | agency filter multiselect maps `OUTREACH_AGENCIES` | no change — extends automatically |
| `lib/direct-outreach/queries.ts:140-142` | scorecard ordering (known first, unknown appended) | no change — extends automatically |
| `components/direct-outreach/shared.ts:8-18` | color/name via `AGENCY_HEX_COLORS`/`AGENCY_NAMES` (PUA→MPUA alias) | no change — MARAD `#2dd4bf` and HECI `#fbbf24` already exist in `lib/constants/agencies.ts:62-73` |
| `lib/direct-outreach/compute.ts:58-60` | `classifyTheme` agency fallback: GWI→Water-Supply, GPL→Electricity-Supply | **add** MARAD→`Aviation-Transport`, HECI→`Electricity-Supply` |
| `lib/direct-outreach/queries.ts:421` | transfer recipients: PUA→superadmins special case | no change — `upper(agency)` match works for any agency |
| `lib/direct-outreach/import-xlsx.ts:276` | workbook `Agency` read as unvalidated free text | **normalize** (see 1.3) |

### 1.2 The new source (`lib/direct-outreach/types.ts`)

```ts
import type { UserAgency } from '@/lib/constants/agencies';

/** OP Direct's ministry-level bucket (Public Utilities & Aviation = the ministry itself). */
export const OUTREACH_MINISTRY = 'PUA' as const;

/**
 * Agencies a case can belong to / be transferred to. Every entry except PUA
 * MUST be a valid users.agency value (the `satisfies` clause enforces this at
 * compile time) so agency_manager scoping and assignment work unmodified.
 * Adding an agency = one entry here; the transfer enum, both dropdowns,
 * scorecard ordering, and color/name maps all follow.
 */
export const OUTREACH_AGENCIES = ['GWI', 'GPL', 'HECI', 'MARAD', OUTREACH_MINISTRY] as const
  satisfies readonly (UserAgency | typeof OUTREACH_MINISTRY)[];

export type OutreachAgency = (typeof OUTREACH_AGENCIES)[number];
```

`types.ts` currently imports nothing — adding the type-only import keeps it client-safe (types are erased at build). GWI/GPL keep their positions so existing scorecard order is stable; HECI/MARAD slot before the ministry bucket.

**Deliberately excluded for now:** CJIA, GCAA, HAS (Q1). OP Direct workbooks today contain only GWI/GPL/PUA; MARAD/HECI enter via **transfer** (e.g. a stelling/wharf case logged under PUA → MARAD) and via future workbooks. Adding CJIA later is literally one array entry.

### 1.3 Importer normalization (`import-xlsx.ts`)

`Agency` cell → `text(...)` then `.trim().toUpperCase()`. Values outside `OUTREACH_AGENCIES` are still **stored verbatim** (current permissive behavior — a new agency in a future workbook must not brick the upload) but are counted and returned in the upload summary:

```ts
// OutreachUploadSummary gains:
unrecognized_agencies: string[];   // distinct unknown Agency values seen (may be empty)
```

Dashboard upload status line appends `· unrecognized agency values: X, Y` when non-empty, so a typo'd workbook is visible immediately instead of silently landing in the scorecards' "rest" bucket.

No migration needed — `agency` columns are already `text`, validated at the route layer only (148's stated design).

---

## 2. Writable officer updates — the paramount fix

### 2.1 Data model — migration `150_direct_outreach_officer_updates.sql`

Two tables, both snapshot-surviving (NO FK to `direct_outreach_cases`; `case_id` re-attaches by value — 147 pattern), both RLS default-deny (enable RLS, zero policies, `REVOKE ALL FROM anon, authenticated` — 145/146 lineage):

```sql
-- 150_direct_outreach_officer_updates.sql
--
-- Officer progress updates + working state — human-entered, must SURVIVE the
-- snapshot-replace workbook upload. Same design as 147/148: NO FK to
-- direct_outreach_cases; case_id re-attaches by value; orphans (case dropped
-- from a later workbook) are invisible to reads and kept deliberately.

-- Append-only progress log. A row is a remark, a working-status change, a
-- target-date change, or any combination (the CHECK requires at least one).
CREATE TABLE public.direct_outreach_officer_updates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id            integer NOT NULL,
  -- SET NULL (not CASCADE): this is an accountability log; deleting a user
  -- must not erase the record that updates happened (148 transferred_by precedent).
  author_id          uuid REFERENCES public.users(id) ON DELETE SET NULL,
  body               text,                -- @-mentions stored as @[uuid] (Tasks wire format)
  new_working_status text
    CHECK (new_working_status IN
      ('not_started','in_progress','blocked','resolved_pending_verification')),
  new_target_date    date,
  target_cleared     boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (
    coalesce(btrim(body), '') <> ''
    OR new_working_status IS NOT NULL
    OR new_target_date IS NOT NULL
    OR target_cleared
  )
);
CREATE INDEX direct_outreach_officer_updates_case_idx
  ON public.direct_outreach_officer_updates (case_id, created_at DESC);
CREATE INDEX direct_outreach_officer_updates_author_idx
  ON public.direct_outreach_officer_updates (author_id, created_at DESC);

-- Current working state — one row per case, PK join for the view (148 overrides
-- pattern). Absence of a row = 'not_started', no target.
CREATE TABLE public.direct_outreach_case_state (
  case_id        integer PRIMARY KEY,
  working_status text NOT NULL DEFAULT 'not_started'
    CHECK (working_status IN
      ('not_started','in_progress','blocked','resolved_pending_verification')),
  target_date    date,
  updated_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.direct_outreach_officer_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_outreach_case_state      ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_officer_updates,
              public.direct_outreach_case_state
  FROM anon, authenticated;
```

Design points:

- **One log table carries remarks AND state changes.** A single POST can say "spoke to the contractor, work starts Monday" *and* flip status to `in_progress` *and* set a target date — one row, one timeline entry. This also makes "days since the officer's last update" a single `max(created_at)` per case (§4) instead of a three-table `GREATEST`.
- **Append-only.** No edit/delete routes in v3 — it is an accountability record, same ethos as `direct_outreach_transfers` (Q5 to confirm).
- `body` length (≤4000) enforced by zod in the route, not the DB (module convention: "validated in the route").
- `direct_outreach_case_state` is maintained **in the same transaction** as the log insert, so current state and history can never disagree.

### 2.2 API — `POST /api/direct-outreach/[caseId]/updates` (new route file)

One endpoint serves §2 (remarks/mentions) and §3 (working status + target date):

```ts
const postSchema = z.object({
  body: z.string().trim().min(1).max(4000).optional(),
  working_status: z.enum(OUTREACH_WORKING_STATUSES).optional(),
  // string sets, null clears, absent leaves untouched
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine(
  (d) => d.body !== undefined || d.working_status !== undefined || d.target_date !== undefined,
  { message: 'Empty update' },
);
```

Flow (mirrors the assignment PATCH in `[caseId]/route.ts`):

1. `requireModuleAccess('direct-outreach')` → `parseCaseId` → **scoped** `getCase(caseIdNum, agencyScopeFor(session))` (out-of-scope stays an opaque 404).
2. Permission — new pure helper in `lib/direct-outreach/permissions.ts`:

```ts
/** Who may post progress updates / set working status / set the officer target date. */
export function canPostOutreachUpdate(
  role: string | null | undefined,
  userId: string,
  userAgency: string | null | undefined,
  effectiveAgency: string | null | undefined,
  assigneeUserId: string | null | undefined,
): boolean {
  if (assigneeUserId && userId === assigneeUserId) return true; // the assigned officer, always
  return canAssignOutreachCase(role, userAgency, effectiveAgency); // superadmin or owning manager
}
```

3. Mention extraction — reuse `cleanMentionBody(body)` from `lib/notifications/mention-utils.ts` (the LIVE pattern from `app/api/tasks/[id]/comments/route.ts:102-175`; the dead `/api/tasks/mention-notify` endpoint is explicitly **not** used). Wire/storage format `@[uuid]`, exactly as Tasks.
4. **Mention scope guard** (new, outreach-specific): filter `mentionedUserIds` to users who can actually see the case — `is_active AND (role = 'superadmin' OR upper(agency) = upper(effective_agency))` — one query. Prevents notifying (and deep-linking) a GWI manager into a GPL case that 404s for them.
5. `transaction()`: `INSERT INTO direct_outreach_officer_updates (...)`; if `working_status` or `target_date` present, upsert `direct_outreach_case_state` (`ON CONFLICT (case_id) DO UPDATE`, `updated_by = session.user.id, updated_at = now()`).
6. After commit, fire-and-forget `createNotification` (§6): `outreach_update_mention` per surviving mention; `outreach_case_update` to the assigned officer when `author ≠ assignee`.
7. Response: the created update row (joined author name) + the new state; the panel appends optimistically then `reload()`s (existing `reloadSeq` pattern).

`GET /api/direct-outreach/[caseId]` response gains two keys (via `getCase`):

```ts
interface CaseDetailResponse {
  case: OutreachCaseDetail;
  updates: OutreachUpdate[];            // imported, unchanged
  transfers: OutreachTransfer[];        // unchanged
  officer_updates: OutreachOfficerUpdate[];   // NEW — newest first
  state: OutreachCaseState;                   // NEW — defaults when no row
}
```

```ts
// types.ts additions
export const OUTREACH_WORKING_STATUSES =
  ['not_started', 'in_progress', 'blocked', 'resolved_pending_verification'] as const;
export type OutreachWorkingStatus = (typeof OUTREACH_WORKING_STATUSES)[number];

export const OUTREACH_WORKING_STATUS_LABELS: Record<OutreachWorkingStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  blocked: 'Blocked',
  resolved_pending_verification: 'Resolved — pending verification',
};

export interface OutreachOfficerUpdate {
  id: string;
  case_id: number;
  author_id: string | null;         // null = deleted user ("Former user")
  author_name: string | null;       // joined from users at read time
  author_agency: string | null;
  body: string | null;              // raw @[uuid] format; client renders mentions
  new_working_status: OutreachWorkingStatus | null;
  new_target_date: string | null;
  target_cleared: boolean;
  created_at: string;
}

export interface OutreachCaseState {
  working_status: OutreachWorkingStatus;    // 'not_started' when no row
  target_date: string | null;
  updated_by: string | null;
  updated_by_name: string | null;
  updated_at: string | null;
}
```

### 2.3 UI — composer + timeline, clearly separated from the imported log

New component `components/direct-outreach/OfficerUpdates.tsx`, adapted from `components/tasks/TaskComments.tsx` with the Tasks mention plumbing **extracted and shared** rather than copied:

- **Extract** from `TaskComments.tsx` into `components/mentions/mention-helpers.tsx`: `renderCommentBody(body, userMap)` (the `@[uuid]` → gold `@Name` renderer, `TaskComments.tsx:30-62`) and `draftToRaw(draft, mentions)` (`:146-160`). `TaskComments.tsx` switches to the shared import — behavior-identical refactor.
- **Reuse as-is:** `components/tasks/MentionAutocomplete.tsx` (already generic: takes `users`, `textareaRef`, `onSelect`) and the `/api/tasks/users?agency=<effective_agency>` user list the panel already fetches for assignment (`CaseDetailPanel.tsx:120`) — one fetch feeds both the assign picker and mention autocomplete. Note: `MENTION_ROLE_LABELS` in `MentionAutocomplete.tsx:19-25` still maps legacy role names (`dg`, `officer`, …) — add `superadmin: 'Ministry'` / `agency_manager: 'Manager'` entries while we're in there (display-only fix).
- **No threading** — officer updates are a progress log, not a discussion; `parent_id` and the reply-notification branch are dropped (mentions cover directed conversation).

Panel layout (top → bottom): status strip · reported issue · **Progress & commitment card (§3.3)** · responsible officer · agency transfer · metadata · **Officer progress updates** (composer + timeline) · imported log.

The two logs must be unconfusable:

- **Officer updates**: header `Officer progress updates (N)`, gold `MessageSquarePlus` icon, entries with avatar initials + author name + agency + `formatDistanceToNow` timestamp, body with gold mention highlights, and inline chips when the row carried a state change: `→ In progress` (Badge), `target: 15 Aug 2026` / `target cleared` (gold Badge). Composer: textarea (`input-premium`) with placeholder *"Add a progress update — type @ to mention"* + `btn-gold` **Post update** button. Composer renders only for users passing `canPostOutreachUpdate` (rendered on `effectiveUser`, authorized on the real session — v2 convention).
- **Imported log**: unchanged, keeps its explicit `Imported from OP Direct · read-only (N)` header and muted styling.

Deep link: mention notifications carry `referenceUrl: /direct-outreach?case=<id>` (existing `?case=` deep-link opens the panel). Per-update anchor/highlight (à la `focusCommentId`) is deferred polish.

---

## 3. Working status + officer target date

### 3.1 Semantics — coexistence with the imported fields, no confusion

| | Imported (OP Direct — resets every upload) | Officer-driven (DG-OS — survives uploads) |
|---|---|---|
| Status | `cases.status` (Open/Referred/…/Resolved) — the *official* case status; only moves when OP Direct moves | `case_state.working_status` — internal progress: `not_started / in_progress / blocked / resolved_pending_verification` |
| Target date | `cases.committed_date` — regex-extracted from imported comments (`extractTargetDate`), labeled **verify** | `case_state.target_date` — an explicit commitment by a named user |

Rules:

- The imported `status` remains what opens/closes a case (`WHERE status <> 'Resolved'` in the view). `working_status = 'resolved_pending_verification'` does NOT close a case — it flags "officer says done; awaiting OP Direct confirmation on the next workbook", which is itself a useful minister-facing signal (a case Resolved in the next upload validates the officer; one that stays open contradicts them).
- **Effective target** = `COALESCE(state.target_date, cases.committed_date)` — an explicit officer commitment always outranks the heuristic. Computed in view v4 as `effective_target_date` / `effective_target_overdue`; the existing `hasTarget` / `overdue` filters and the scorecards' `overdue_commitments` re-point to the effective columns (KPI semantics change — Q4). `officer_target_overdue` (`state.target_date < guyana_today`) is additionally exposed for the strict accountability KPI (§4).

### 3.2 Storage & API

Already covered by §2: `direct_outreach_case_state` holds current values; every change is a `direct_outreach_officer_updates` row through the same `POST .../updates` endpoint; same `canPostOutreachUpdate` permission.

### 3.3 Surfacing

**Panel — new "Progress & commitment" card** (directly under the reported issue; the case's action center):

- Working status as a **segmented pill control** (4 pills, `KanbanFilterPills` chip classes): active pill filled per status color, inactive pills outlined and clickable. Clicking posts `{working_status}` immediately (optimistic, spinner on the pill). Read-only viewers see the active pill only, as a Badge.
- Provenance line under the control: `set by <name> · <date>` (from `state.updated_by_name/updated_at`).
- **Officer target date**: when unset, a `btn-navy` **Set target date** button revealing `<input type="date" class="input-premium">` + save; when set, the date bold-white with `OVERDUE` danger badge when `officer_target_overdue`, plus pencil-edit and ✕-clear icons for authorized users.
- The **auto-detected** date card remains, demoted below the metadata grid, keeps its `verify` badge, and adds one line when an officer target exists: `Officer commitment above supersedes this detection.`

**Table (`CasesTable`)** — current columns `Case · Agency · Status · Theme/Issue · Officer · Latest Update · Idle · Target Date`:

- **Officer cell** gains a stacked working-status Badge under the name (`not_started` default/grey, `in_progress` info, `blocked` danger, `resolved_pending_verification` success); unassigned open cases switch from the grey `—` to an amber `Unassigned` chip (§4 flag).
- **Target Date column** shows the *effective* target: officer-set renders as today's solid Badge; heuristic-only renders the Badge with a `≈` prefix and `title="Auto-detected from imported comments — verify"`. Sort key renamed `committed_date` → `target_date`, pointing at `v.effective_target_date` (dashboard is the only client; no wire compat needed).
- **Idle column** renamed `OP idle` (it measures imported-comment recency); new sortable **Officer update** column added (§4).

**Filters (`filter-sql.ts` + dashboard):**

```
v.working_status = ANY($n::text[])        -- workingStatuses (new MultiSelect, labels from OUTREACH_WORKING_STATUS_LABELS)
v.effective_target_date IS NOT NULL       -- hasTarget (re-pointed)
v.effective_target_overdue                -- overdue (re-pointed)
v.officer_target_overdue                  -- officerOverdue (new toggle pill "Officer overdue")
```

### 3.4 Affordance (§3b) — making the editable surface read as editable

The panel currently styles everything with the same muted `card-premium` treatment — navy-600 uppercase labels, low-contrast selects — so the whole panel scans as one read-only document (only 2 of 7 sections are interactive, and only for some users). v3 rule, applied consistently:

1. **Interactive cards get a gold affordance spine**: the Progress & commitment, Responsible officer, Agency transfer, and Officer updates composer cards add `border-l-2 border-gold-500/40` and their header icon renders gold (`text-gold-500`) — the same "gold = actionable" signal as `btn-gold`/active sidebar items. Read-only cards (metadata, auto-detected date, imported log) keep the flat treatment.
2. **Controls look like controls**: selects/inputs in these cards get `border-navy-700 hover:border-gold-500/40 focus:ring-1 focus:ring-gold-500/50` (extend `.input-premium` usage inline); primary actions are `btn-gold` (Post update), secondary `btn-navy` (Transfer, Set target date). The bare assign `<select value="">` is re-labeled as a visible field with an uppercase micro-label `ASSIGN` above it, matching MetaField typography but gold.
3. **Status pills are buttons, not text**: the segmented control's inactive pills have visible borders + hover states — unmistakably clickable.
4. **No ghost controls**: users without permission see current values as plain text (controls not rendered, not disabled) — the module's existing convention, now stated as a rule.
5. Cursor/keyboard: all interactive elements keep focus rings; the composer submits on ⌘/Ctrl+Enter (as TaskComments).

---

## 4. Accountability signals

### 4.1 The metric — view v4, migration `151_direct_outreach_view_v4.sql`

`days_idle` stays (renamed *OP idle* in UI — it measures the imported log, moves only on re-upload). The **primary staleness metric becomes officer activity**:

```
last_officer_update_at   = max(officer_updates.created_at) for the case      (any DG-OS author)
days_since_officer_action = guyana_days_since( GREATEST(last_officer_update_at, assignments.assigned_at) )
                            — NULL only when the case is unassigned AND has no updates
```

Definition choices (deliberate): any DG-OS update row counts, regardless of author — the metric answers "is the ministry actively working this case"; assignment itself starts the clock (a case assigned 20 days ago with zero updates reads 20d stale, not blank). Strict per-author accountability lives in the per-officer rollup (4.3), which counts each officer's *own* assigned cases.

View v4 (DROP + CREATE — column order changes; same-migration `security_invoker = on` re-assert AND `REVOKE ALL` re-issue, folding in the 149 lesson):

```sql
DROP VIEW public.direct_outreach_open_v;
CREATE VIEW public.direct_outreach_open_v
  WITH (security_invoker = on) AS
SELECT
  c.*,
  -- (existing: days_open, days_idle, age_bucket, committed_overdue — unchanged)
  coalesce(o.agency, c.agency)                                          AS effective_agency,
  (o.agency IS NOT NULL AND o.agency IS DISTINCT FROM c.agency)         AS transferred,
  a.assignee_user_id,
  a.assigned_at,
  coalesce(s.working_status, 'not_started')                             AS working_status,
  s.target_date                                                         AS officer_target_date,
  (s.target_date IS NOT NULL
     AND s.target_date < (now() AT TIME ZONE 'America/Guyana')::date)   AS officer_target_overdue,
  coalesce(s.target_date, c.committed_date)                             AS effective_target_date,
  (coalesce(s.target_date, c.committed_date) IS NOT NULL
     AND coalesce(s.target_date, c.committed_date)
         < (now() AT TIME ZONE 'America/Guyana')::date)                 AS effective_target_overdue,
  ou.last_officer_update_at,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (greatest(ou.last_officer_update_at, a.assigned_at)
          AT TIME ZONE 'America/Guyana')::date)                         AS days_since_officer_action
FROM public.direct_outreach_cases c
LEFT JOIN public.direct_outreach_agency_overrides o ON o.case_id = c.case_id
LEFT JOIN public.direct_outreach_assignments      a ON a.case_id = c.case_id
LEFT JOIN public.direct_outreach_case_state       s ON s.case_id = c.case_id
LEFT JOIN LATERAL (
  SELECT max(u.created_at) AS last_officer_update_at
    FROM public.direct_outreach_officer_updates u
   WHERE u.case_id = c.case_id
) ou ON true
WHERE c.status <> 'Resolved';

ALTER VIEW public.direct_outreach_open_v SET (security_invoker = on);
REVOKE ALL ON public.direct_outreach_open_v FROM anon, authenticated;
```

Ripple: `getOpenCases`/`getSummary` drop their own `direct_outreach_assignments` joins (the view now carries `assignee_user_id`/`assigned_at`); the `users au` join for `assignee_name` stays in `queries.ts` (the view deliberately doesn't join `users`). The `getCase` hand-inlined copy mirrors every new computed column (Resolved cases must still render fully in the panel) — the three-way view/getSummary/getCase sync is a known risk; a unit test pins the inline expressions to the view SQL (§7).

### 4.2 Filters + flags

- New toggle pill **"No officer update >14d"** → `v.days_since_officer_action > 14` (constant `OUTREACH_STALE_OFFICER_DAYS = 14` in `types.ts`; threshold is Q2). NULLs are excluded by SQL semantics — those are the unassigned-and-untouched cases, caught by:
- **Unassigned flagging**: existing `officers=unassigned` filter + KPI sub-count stay; the table's amber `Unassigned` chip (§3.3) makes it visible per-row; the scorecards gain a per-agency `unassigned` count (currently computed in `getSummary` but only summed globally — now kept per agency too).
- **"Officer overdue"** toggle → `v.officer_target_overdue` (§3.3).
- Existing `Assigned to me` toggle unchanged. New sort fields: `working_status → v.working_status`, `officer_update → v.days_since_officer_action`, `target_date → v.effective_target_date`. Default sort stays `days_idle` unless you want the new metric as default (Q6).

### 4.3 Summary payload + dashboard

`getSummary` additions (all agency-scoped like everything else):

```ts
// OutreachAgencySummary + totals gain:
unassigned: number;         // open cases with no officer (per agency now, not just global)
stale_officer: number;      // days_since_officer_action > 14
officer_overdue: number;    // officer_target_overdue

// OutreachSummary gains:
officer_load: {             // per-officer accountability rollup (assigned open cases)
  id: string; name: string | null; agency: string | null;
  open_cases: number; stale_cases: number; overdue_commitments: number;
  last_update_at: string | null;   // newest update authored by this officer (strict per-author)
}[];
```

(one `GROUP BY assignee` query over the view + a per-author `max(created_at)` join on `direct_outreach_officer_updates`).

**KPI row** (still 4 `OutreachStatCard`s, `grid-cols-2 lg:grid-cols-4`):

| Card | Value | Sub-label | Click |
|---|---|---|---|
| Open Backlog | open | `N unassigned` | sub-label click applies `officers=unassigned` (today it clears filters — change) |
| **Needs officer action** (replaces "Stalled >90d") | stale_officer | `no update in >14d` | toggles the stale-officer pill |
| **Officer commitments overdue** (replaces heuristic-overdue) | officer_overdue | `of N with a target` | toggles `officerOverdue` |
| Resolution Rate | % | `N of M resolved` | — |

"Stalled >60/90d" survive as filter pills (OP-idle remains a secondary lens). The old effective-overdue count lives on in the scorecards.

**Agency scorecards** add a second stat row per agency: `unassigned · stale officer · officer overdue` (amber/red-tinted numerals, same tri-stat layout).

**New "Officer workload" strip** (`components/direct-outreach/OfficerLoadTable.tsx`) between scorecards and the filter card: compact `card-premium` table from `officer_load` — Officer (initials + name + agency) · Open · Stale · Overdue · Last update (relative). Row click applies `officers=[id]`. Superadmin sees all agencies; a manager sees their own officers (scoping is free — the summary is already scoped). Hidden when `officer_load` is empty.

---

## 5. Data model summary (migrations 150–151)

| Object | Kind | Survives upload | RLS |
|---|---|---|---|
| `direct_outreach_officer_updates` | append-only log (remark and/or state change) | ✅ no FK to cases | enable, zero policies, REVOKE ALL |
| `direct_outreach_case_state` | current working status + officer target (1 row/case) | ✅ no FK to cases | enable, zero policies, REVOKE ALL |
| `direct_outreach_open_v` v4 | + assignee, working state, effective target, officer staleness | view | `security_invoker=on` + REVOKE (same migration) |

Both migrations are additive (the view DROP+CREATE is the established 148 pattern). Importer (`import-xlsx.ts`) is untouched by construction — the survival tripwire test extends to the two new table names. After each apply: refresh `scripts/schema-snapshot.json` (MCP-merge fallback proven) so the drift guard admits the new objects. Per CLAUDE.md, migrations are applied via Supabase MCP after plan approval; nothing here is destructive.

---

## 6. Notifications — 2 new events

| Event | Recipients | Tier | Default prefs |
|---|---|---|---|
| `outreach_update_mention` | @-mentioned users (post scope-guard §2.2·4; self-mention dropped by `createNotification`'s actor===recipient suppression) | important | `{ in_app: true, email: 'instant' }` |
| `outreach_case_update` | the assigned officer, when someone else posts an update / changes status / sets the target on their case | informational | `{ in_app: true, email: 'digest' }` |

Deliberate non-events: no fan-out to managers/superadmins on every update (the dashboard is the accountability surface — noise kills the channel); no notification when the officer updates their own case. Whether `resolved_pending_verification` should additionally ping the owning manager/superadmins is Q3.

Wiring — the four mandatory touch-points (exactly as v2 did for `outreach_assigned`/`outreach_transferred`):

1. `NotificationEventType` union — `lib/notifications/classify-tier.ts:5-19` **and** `EventPreferencesMap` — `lib/notifications.ts:58-72`.
2. `classifyNotificationTier` switch — `classify-tier.ts` (exhaustive, no default — build fails if forgotten).
3. `DEFAULT_EVENT_PREFERENCES` — `lib/notifications.ts:625-646` (omission silently disables email — the file says so).
4. `EVENT_TYPES` preference rows — `components/notifications/NotificationPreferences.tsx:92-103` (labels: "Mentioned in an outreach update", "Update on your outreach case").

Plus three polish touch-points v2 skipped that v3 picks up:

- `deriveIcon` (`notification-service.ts:113-130`): `outreach_update_mention → 'at-sign'`, `outreach_case_update → 'task'`.
- `parentDeepLinkPath` (`lib/notifications/deep-link.ts:8-19`) — currently only `task` is wired; add `outreach_case → /direct-outreach?case=<id>` so structured links + email links resolve (both new events also pass `referenceUrl` explicitly, as the v2 events do).
- `subjectForEvent` (`lib/notifications/email-templates.ts:113-137`): subjects for both events (`You were mentioned on outreach case #N`, `Update on outreach case #N`).

Mention pattern is the **live** comments-route pattern (`app/api/tasks/[id]/comments/route.ts:102-175` — in-process `cleanMentionBody` + `createNotification` per mention, fire-and-forget with `.catch` logging). The dead `/api/tasks/mention-notify` endpoint (zero callsites) is not resurrected — flagged for deletion as an optional cleanup in this PR.

Known platform caveats (pre-existing, unchanged): prod realtime WS is broken so in-app arrives via the 60s poll; web push runs only from the notification-generation cron, not `createNotification`.

---

## 7. Permissions matrix

| Action | superadmin | agency_manager (effective agency) | agency_manager (other agency) | assigned officer¹ |
|---|---|---|---|---|
| View module / list / case detail / officer updates | ✅ all agencies | ✅ own scope | ❌ opaque 404 | ✅ (via own scope) |
| Upload workbook | ✅ | ❌ | ❌ | ❌ |
| Assign / unassign officer | ✅ | ✅ | ❌ | ❌² |
| Transfer agency | ✅ | ❌ | ❌ | ❌ |
| **Post progress update** | ✅ | ✅ | ❌ | ✅ |
| **Set working status** | ✅ | ✅ | ❌ | ✅ |
| **Set / clear officer target date** | ✅ | ✅ | ❌ | ✅ |
| Edit / delete an update | ❌ append-only for everyone (Q5) | ❌ | ❌ | ❌ |

¹ The assignee clause is identity-based (`userId === assignee_user_id`). AS AMENDED post-v3 (assign-any-human fix): `getCase` AND the dashboard LIST visibility are scope OR requester-is-assignee, so the assigned officer can open, list ("Assigned to me" included), and work their case even when its effective agency is not theirs (superadmins may assign ANY active human via `/api/direct-outreach/officers`; managers keep the Q3 case-agency picker). PERSONAL visibility only: `getSummary` (scorecards/KPIs/officer-load rollups) has no assignee branch — a cross-agency case never inflates the assignee's-agency aggregates; same-agency peers gain nothing; out-of-scope NON-assignees still get the opaque 404. A cross-agency assignee can view and post but not reassign or transfer.
² Unless they are also the owning manager / a superadmin — the officer role confers no assignment rights.

PUA cases: no agency_manager can match `'PUA'`, so assign/post = superadmins + whoever is assigned. Enforcement points: render-side on `effectiveUser` (ViewAs-aware), authorization on the real session server-side — every route re-derives permission from the scoped `getCase` + pure helpers; nothing trusts the client.

---

## 8. Tests

- **Unit — permissions** (`permissions.test.ts`): `canPostOutreachUpdate` matrix — assignee (manager/superadmin/stranded-out-of-agency), owning manager non-assignee, other-agency manager, superadmin, null assignee, null effective agency.
- **Unit — filter builder** (`filter-sql.test.ts`): `workingStatuses` ANY-shape, `staleOfficer` (>14, NULL-excluded), `officerOverdue`, re-pointed `hasTarget`/`overdue`, combination with scope-first invariant.
- **Unit — importer tripwire** (`import-xlsx.test.ts`): extend the survival test — source must reference none of `direct_outreach_officer_updates | direct_outreach_case_state` (alongside the existing three).
- **Unit — view/inline-copy pinning**: test asserting `getCase`'s inline SQL contains the same `effective_target_date` / `days_since_officer_action` expressions as the migration-151 view text (cheap string-level pin, catches drift at build time).
- **Unit — agency source**: `OUTREACH_AGENCIES` ⊆ `USER_AGENCIES ∪ {PUA}` (runtime mirror of the `satisfies` guard, survives refactors); `classifyTheme` MARAD/HECI fallbacks.
- **Unit — mention scope guard**: pure filter given user rows × effective agency.
- **Route-level DB-mocked tests**: not added (v2 precedent — invariants live in single guarded statements + pure helpers; route matrices remain a follow-up nicety).
- **Manual (two accounts, staging data)**: post update as officer → appears, manager notified? (no — only assignee-direction), mention manager → bell + email; status→blocked chip renders in table; target date set → overdue KPI moves; re-upload workbook → updates/state/assignments all survive; transfer → assignee cleared, update permission follows new agency; deep-link from notification opens panel; ViewAs an agency manager → composer hidden on other agency's case.
- Build gates: `npm run check:drift` after snapshot merge; `classifyNotificationTier` exhaustiveness (compile-time).

---

## 9. Effort

| Piece | Size |
|---|---|
| Migrations 150–151 + snapshot merge + advisor check | ~1h |
| §1 agencies unification (types, importer normalization, theme fallbacks, tests) | ~½ day |
| §2 officer updates (route, mention extraction+scope guard, `OfficerUpdates` component, mention-helper extraction from TaskComments, notifications ×2 with all touch-points) | ~1½ days |
| §3 working status + target (state upsert in route, panel Progress card, table/filter/sort changes) | ~1 day |
| §4 accountability (view v4 + queries rewire, summary additions, KPI row, scorecards, OfficerLoadTable) | ~1 day |
| §3b affordance pass (panel-wide) | ~½ day |
| Tests, lint, build, adversarial review, manual script | ~½ day |
| **Total** | **~5 dev days** |

---

## 10. Risks & mitigations

- **View v4 DROP+CREATE** re-mints default grants and can silently drop invoker semantics — the 149 incident. Mitigation: `security_invoker` re-assert + `REVOKE ALL` inside migration 151 itself; post-apply check `reloptions` + advisor (as done for 146/148).
- **Three-way semantic duplication** (view / `getSummary` hand-join / `getCase` inline) grows by five computed columns. Mitigation: the string-pinning unit test (§8) + the standing rule that any new agency/aging read goes through the view.
- **KPI semantics shift** (Q4): `overdue` re-pointing from heuristic-only to effective-target changes minister-visible numbers on day one (officer targets override auto-detected ones). Flagged for explicit sign-off; the change is the point — commitments by named users outrank regex hits.
- **Notification fan-out**: mentions are scope-guarded (§2.2·4) so no user is emailed a case they 404 on; `createNotification` dedupes rapid-fire per (user, entity, event) and collapses >5/hour.
- **Orphan accumulation**: officer updates/state for cases dropped from later workbooks persist invisibly (by 147 design). Harmless at current volumes; a superadmin cleanup script is deferred.
- **`resolved_pending_verification` staleness paradox**: a case the officer marked resolved keeps aging on OP-idle metrics until OP Direct confirms. Mitigation: that working status renders prominently (table badge + panel), and the stale-officer KPI uses officer activity, which the resolution update itself refreshes.
- **PUA cases** remain superadmin-only actionable (no PUA managers exist) — unchanged, now documented.
- Pre-existing platform notes: prod realtime WS broken (in-app via 60s poll), Vercel Preview builds red (Preview-env gap, FOLLOWUPS.md), no OS push from `createNotification`.

---

## 11. OPEN QUESTIONS (your decisions before execution)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Agency set = `GWI, GPL, HECI, MARAD, PUA`. Include CJIA / GCAA / HAS now? | Ship the five; each later addition is one array entry |
| Q2 | Stale-officer threshold: 14 days? | 14d (KPI + pill share the constant) |
| Q3 | Should `resolved_pending_verification` notify the owning manager + superadmins, or stay dashboard-only? | Dashboard-only in v3; add a `outreach_pending_verification` event later if verification lags |
| Q4 | Confirm: `overdue`/`hasTarget` filters + scorecard `overdue_commitments` switch to **effective target** (officer date supersedes auto-detected) | Yes — explicit commitments outrank heuristics |
| Q5 | Officer updates strictly append-only (no edit/delete, even superadmin)? | Yes — accountability record, transfers-table ethos |
| Q6 | Default table sort: keep `days_idle` (OP idle) or switch to `days_since_officer_action`? | Switch — the module's new center of gravity is officer activity |
| Q7 | Confirm: no officer sub-role (assignment-based responsibility on the 2-role model, per §0) | No new role |

**Deferred (explicitly out of v3):** cron nudge emails for stale/overdue officers; per-update deep-link anchors; verification workflow (superadmin "verified" stamp); officer-load history/trends; deleting the dead `mention-notify` route can ride along as cleanup if you want it.

---

## 12. Rollout order (execution gate: your go)

1. **[GATE] Your decisions on Q1–Q7 + plan sign-off** — nothing below runs before it.
2. Migration 150 via Supabase MCP → snapshot merge → advisor.
3. Migration 151 via MCP → verify `reloptions=[security_invoker=on]` + grants → snapshot merge → advisor.
4. `types.ts` (agencies source, working-status types, row/summary/state types) + `compute.ts` fallbacks + importer normalization.
5. `permissions.ts` (`canPostOutreachUpdate`) + `filter-sql.ts` + `queries.ts` (view rewire, state/updates reads+writes, summary additions, officer_load).
6. Routes: `POST [caseId]/updates`, `getCase` payload extension, list/summary params.
7. Notification touch-points (both events, all 4 + 3 polish points).
8. UI: mention-helper extraction, `OfficerUpdates`, Progress & commitment card, affordance pass, table/filters/KPIs/scorecards/OfficerLoadTable.
9. Tests, lint, build, `check:drift`; adversarial review pass; commit to main — then STOP (no deploy until you say "deploy").
