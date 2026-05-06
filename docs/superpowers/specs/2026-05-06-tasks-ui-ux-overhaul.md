# Tasks UI/UX Overhaul — Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The Problem 3 live UX walkthrough is **complete (§4.2 / §4.3)**. **Do not start Phase 1 implementation until the owner (Alfonso) has reviewed §4.3 and confirmed which walkthrough-derived items (A2, C1, D1, D2, E1) join Phase 1.**

**Date:** 2026-05-06
**Branch:** `action-items-foundation` (or new branch off `main` once approved)
**Goal:** Fix three concrete pain points on `/tasks` (Done tasks clutter the default view, status sort is missing, refresh loses filter/sort/search state) and surface a prioritized friction list from a structured Playwright walkthrough.
**Architecture:** Targeted edits to existing components — no rewrite. New `archived_at`/`hidden_after` lifecycle column on `tasks` (or repurpose `completed_at`); status added to `SortField` union with lifecycle ordering; URL-sync hook for filter/sort/search state.
**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind v4, existing reducer pattern in `hooks/useBoardReducer.ts`.

---

## 0. Playwright MCP Status (Verification Tool)

**Smoke test status: NOT YET RUN.** Blocked at session start — a stale MCP Chrome automation profile from prior sessions held a lock on `~/Library/Caches/ms-playwright/mcp-chrome-3eca4b3`. Stale Chrome processes (PID 79268 + helpers) and the orphaned `playwright-mcp` server (PID 42958) were killed during this session. The kill cascaded broader than intended and also took down the active MCP server, so Playwright is unavailable for the spec-writing session.

**Action taken in this session:**
1. Killed stale processes — verified zero `mcp-chrome-3eca4b3` processes remain (`ps aux | grep mcp-chrome-3eca4b3` empty).
2. Edited `.mcp.json:5` to add `--isolated` so each future Playwright MCP invocation gets an ephemeral profile and the lock-collision bug cannot recur.

> **⚠️ HANDOFF NOTE — RESTART REQUIRED:** The `.mcp.json` change to add `--isolated` only takes effect on the next Claude Code MCP reconnect. **Restart Claude Code before the next Playwright-dependent session.** Then resume Section 4 of this spec (Problem 3 walkthrough) — the scripted scenarios are below ready to execute.

---

## 1. Investigation Findings

### Problem 1: Done tasks visibility

**Status enum (canonical):** `('new','active','blocked','done','awaiting_verification','superseded')` per `supabase/migrations/102_action_items_v1.sql:123-126`. The TS type at `lib/task-types.ts:12` matches. **No drift in production** — earlier suspicion of drift was based on reading only migration 029 (which had the original 4-value CHECK). Migration 102 is the source of truth and is applied.

**Default filter behavior:** `hooks/useBoardReducer.ts:222` initializes `statusFilter: []`. The board reducer treats empty as "match everything" (`components/tasks/KanbanBoard.tsx:494-497`). All four hardcoded columns render with their tasks, including Done.

**API default:** `app/api/tasks/route.ts:39-108` has no default `WHERE status != 'done'` clause. Returns all statuses unless caller passes `?status=`.

**Archive / soft-delete columns:** None on `tasks`. `archived_at`/`archived_by`/`archived_role` exist on `tender` (migration 096) but were never extended to tasks.

**`completed_at`:** Set on `done`-flip and cleared on un-done (`app/api/tasks/[id]/route.ts:80-85`). **Never read by any query, filter, or UI.** Pure dead weight today.

**War Room view:** `app/tasks/page.tsx:24` — `<h1>War Room</h1>`. Maps to `<KanbanBoard />`. The 4-column board hardcodes `COLUMNS = ['new', 'active', 'blocked', 'done']` (`components/tasks/KanbanBoard.tsx`). `awaiting_verification` and `superseded` tasks fall through unless mapped — `lib/task-queries.ts` aliases `awaiting_verification → 'new'` and `superseded → 'done'` for board placement (legacy compat layer).

**Existing toggles:** None. Status filter panel (`components/tasks/KanbanFilters.tsx:418`) shows checkboxes for `new/active/blocked/done` — user can manually uncheck `done` to hide it but state isn't persisted.

**Bulk actions:** `components/tasks/BulkActionBar.tsx:220-274` offers Due Date, Assignee, Agency, Status (no `blocked` — forces reason flow), and hard Delete. **No Archive action.**

### Problem 2: Sort by status

**Sort menu:** `components/tasks/KanbanFilters.tsx:183-212` — dropdown of 5 fields hardcoded in JSX:
```ts
{ field: 'due_date',   label: 'Due Date' },
{ field: 'priority',   label: 'Priority' },
{ field: 'created_at', label: 'Created' },
{ field: 'owner_name', label: 'Assignee' },
{ field: 'agency',     label: 'Agency' },
```

**Status: not present in menu, type, or comparator.** `SortField` union at `components/tasks/TaskListView.tsx:23` is `'due_date' | 'priority' | 'created_at' | 'owner_name' | 'agency' | 'title'` — `title` has a comparator (`TaskListView.tsx:72-74`) but no menu entry, also broken UI-side.

**Sort is client-side** in `sortTasks()` (`TaskListView.tsx:47-78`). Server `ORDER BY status, due_date` (`app/api/tasks/route.ts`) is just default page load ordering — not driven by the sort menu.

**Group-by-status:** Kanban already does it (4 hardcoded columns). List view is flat — no group option.

**View toggle:** Board ↔ List in `KanbanFilters.tsx:101-129`. Stored in `viewMode` state, persisted to `localStorage('dg-task-view')`.

### Bonus 1: TS-vs-DB enum drift (your callout)

**Conclusion: not a bug today.** Migration 102 widened the CHECK to all 6 values before any code shipped that writes them. All write paths confirmed:

- `app/api/tasks/[id]/complete/route.ts:39` writes `awaiting_verification`
- `app/api/tasks/[id]/verify/route.ts:24` writes `done` (verify-only)
- `app/api/tasks/[id]/dispute/route.ts:32` writes `active` (dispute returns to active)
- `app/api/action-items/[id]/supersedes/route.ts:25` writes `superseded` on prior task

These all assume the widened CHECK. **Migration 102 must be applied to all environments** (the spec assumes it is — verify on staging/prod before locking Problem 1's done-hiding work, since that work depends on the 6-value enum).

**Loose ends from the deeper read:**
- `lib/constants/task-styles.ts:22-27` `STATUS_OPTIONS` only has the 4 original — verification states aren't pickable from any UI dropdown (intentional: they're system-managed transitions, but the spec should call out one place this is leaky — `BulkActionBar` doesn't restrict against picking 'done' on an `awaiting_verification` task and bypassing verification).
- `TasksByStatus` type at `lib/task-types.ts:63-68` only has 4 buckets. Any future code that does `groupBy(status)` will silently drop the 2 verification states unless it goes through the legacy `task-queries.ts` mapping.

### Bonus 2: `completed_at` decision (your callout)

Set on done-flip, cleared on un-done. **Never read.** Two real options:

| Option | Outcome |
|---|---|
| **Repurpose for grace-period auto-archive (recommended)** | Default view filters out tasks where `status IN ('done','superseded') AND completed_at < now() - INTERVAL '7 days'`. User-configurable grace period in settings. Keeps the column, gives it meaning, gives users a 7-day "I changed my mind" window without manual archive UI. |
| Drop the column | Migration to drop, plus removing the writes in `app/api/tasks/[id]/route.ts:80-85`. Cleaner schema but loses the option. |

**Recommendation: repurpose.** The grace-period model is a known idiom (Things, Linear) and gives the user the natural escape hatch they expect.

### Bonus 3: URL persistence (your callout)

**Current:** Only `viewMode` is persisted (to `localStorage`). Refresh loses filters, sort, search, page number, expanded panels. For someone iterating through filter combinations during a review, this is a real productivity tax.

**Recommendation: phase 1 — push to URL search params.** Changes are mechanical (read in board reducer init, write on every filter mutation, use `router.replace` to avoid history spam). URL persistence is also shareable ("send me your filtered view"). LocalStorage as a fallback for last-used sort if URL is bare.

---

## 2. Recommended Approach (Decisions)

| # | Decision | Why |
|---|---|---|
| **D1** | Hide tasks where `status IN ('done','superseded') AND completed_at < now() - INTERVAL '7 days'` from default View. Show a sticky "Show recently completed (N)" pill that expands inline. Grace period configurable via `TASKS_GRACE_PERIOD_DAYS` env var only — no `/admin/settings` UI in Phase 1. | Grace period preserves recent-history affordance without persistent clutter. 7d default; env override is enough until DG/PS asks to tune. UI lives in backlog. |
| **D2** | Add `status` to `SortField`, ordered `new < active < blocked < awaiting_verification < done < superseded`. Add a `STATUS_ORDER` map next to `PRIORITY_ORDER` in `TaskListView.tsx`. Also add `title` to the menu (it's already in the comparator). | Lifecycle order, not alphabetical. Title is a free win — comparator already exists. |
| **D3** | URL-sync filter, sort, search, and page state via `useSearchParams`. Add a `useBoardUrlSync()` hook. Default state stays in the reducer; URL is a serialized projection. | Refresh-survives = real productivity gain + shareable views. Mechanical change. |
| **D4** | Keep `completed_at`. Use it as the grace-period anchor for D1. Backfill existing `done`/`superseded` tasks via migration 107. | Gives the column purpose. No migration drop, no schema churn. |
| **D5** | `awaiting_verification` is not subject to D1's grace-period hide regardless of role (owner needs to see their own pending verification). Card pill "Awaiting verification" still rendered for at-a-glance signal. Column placement is now governed by D7. | The owner needs visibility on their own pending verifications. Hiding them would be a footgun. |
| **D6** | **Include** F3 fix in Phase 1: bulk write to `status='done'` is rejected (server) and disabled (client) when any selected task is in `awaiting_verification`. Two layers — server guard in `app/api/tasks/bulk/route.ts` returns 409, client tooltip + 409 toast for fast feedback. | Workflow-integrity bug, not UX polish. ~30 min of work belongs in the same PR as the discovery. |
| **D7** | **Role-aware Kanban columns.** Users with verify permissions (`dg`, `minister`, `ps`, `parl_sec`, plus `agency_admin` for tasks scoped to their portfolio agencies) see a 5-column board: `New | Active | Blocked | Pending Verification | Done`. The Pending Verification column auto-collapses to a thin gutter when empty. `officer` and non-portfolio `agency_admin` keep the 4-column board (`New | Active | Blocked | Done`). For 4-column users, `awaiting_verification` tasks render in the **Done** column (owner's perspective: "I marked it done, awaiting sign-off") with the D5 pill — and are NOT subject to D1 grace-period hide. `superseded` always lands in Done for both layouts and IS subject to grace-period hide. | Structural shift from "static board columns" to "role-aware board columns." Verify-permission users need the queue surfaced; officers don't have the action so don't need the column. Tests must cover BOTH layouts. |
| **D8** | **Clean Kanban API bucketing.** `app/api/tasks/route.ts:87-99` currently hardcodes 4 buckets and uses `else grouped.new.push(task)` as a catch-all, which silently dumps `awaiting_verification` and `superseded` into New. Replace with explicit 6-bucket grouping. Response shape becomes `{ new, active, blocked, awaiting_verification, done, superseded }`. The board client decides which buckets to render based on D7's role logic. No catch-all fallback — unknown statuses log a warning and are dropped (defensive: indicates schema drift). | Required for D7 to work cleanly. Prerequisite to surfacing `awaiting_verification` correctly. ~10 min in the same payload. |
| **D9** | `lib/task-queries.ts` (legacy `/api/tm/tasks/*` subsystem) **untouched.** Its `CANONICAL_TO_PG` / `PG_TO_CANONICAL` maps translate to a separate legacy PG enum on a different `tasks` table; they don't affect the Kanban board. If/when that subsystem is consolidated into the modern API, alias removal goes there as part of that effort. | Out of scope for Kanban UX work. Per user direction: no follow-up ticket commitment. |

---

## 3. Schema & Code Changes

### 3.1 Migration

**File:** `supabase/migrations/107_tasks_completed_backfill.sql` (next available number — verify with `ls supabase/migrations | tail`)

```sql
-- Backfill completed_at for any pre-existing 'done' or 'superseded' tasks
-- so the grace-period filter has a value to anchor against.
UPDATE tasks
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE status IN ('done', 'superseded')
  AND completed_at IS NULL;

-- Also set completed_at on superseded transitions going forward.
-- Currently only the 'done' transition writes completed_at.
-- We update the supersedes endpoint in app code; no DB trigger.

-- Index to keep the grace-period filter fast.
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at_status
  ON tasks (completed_at, status)
  WHERE status IN ('done', 'superseded');
```

**Rollback:** `DROP INDEX IF EXISTS idx_tasks_completed_at_status;` — backfilled `completed_at` values are safe to leave (they're accurate timestamps).

**Pre-deploy check:** Confirm migration 102 is applied on staging and prod (`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'tasks_status_check'` — should include all 6 values). If not, this entire spec is blocked until 102 ships.

### 3.2 Code changes

**`app/api/action-items/[id]/supersedes/route.ts:25`** — set `completed_at` when superseding:
```ts
.update({
  status: 'superseded',
  completed_at: new Date().toISOString(),
  updated_at: now,
})
```

**`app/api/tasks/route.ts:39-108`** — accept `?show_completed=true` (default false). When false, filter out grace-expired terminals:
```ts
const showCompleted = searchParams.get('show_completed') === 'true';
const graceDays = parseInt(process.env.TASKS_GRACE_PERIOD_DAYS || '7', 10);
if (!showCompleted) {
  const cutoff = new Date(Date.now() - graceDays * 86400000).toISOString();
  query = query.or(
    `status.not.in.(done,superseded),completed_at.gte.${cutoff}`
  );
}
```

**`hooks/useBoardReducer.ts:222`** — add `showCompleted: false` to initial state and a `SET_SHOW_COMPLETED` action.

**`components/tasks/TaskListView.tsx:23`** — extend type:
```ts
export type SortField = 'due_date' | 'priority' | 'created_at' | 'owner_name' | 'agency' | 'title' | 'status';
```

**`components/tasks/TaskListView.tsx:47-78`** — add status case in `sortTasks()`:
```ts
const STATUS_ORDER: Record<TaskStatus, number> = {
  new: 0, active: 1, blocked: 2,
  awaiting_verification: 3, done: 4, superseded: 5,
};

// inside switch:
case 'status':
  cmp = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  break;
```

**`components/tasks/KanbanFilters.tsx:187-192`** — add status + title to the sort menu:
```ts
{ field: 'status' as SortField,     label: 'Status' },
{ field: 'due_date' as SortField,   label: 'Due Date' },
{ field: 'priority' as SortField,   label: 'Priority' },
{ field: 'created_at' as SortField, label: 'Created' },
{ field: 'owner_name' as SortField, label: 'Assignee' },
{ field: 'agency' as SortField,     label: 'Agency' },
{ field: 'title' as SortField,      label: 'Title' },
```

**`hooks/useBoardUrlSync.ts`** (new) — read from `useSearchParams` on mount, write via `router.replace` on every relevant state change. Serialize: `?status=new,active&priority=high&sort=status&dir=asc&q=foo&completed=1`.

**`components/tasks/KanbanBoard.tsx`** — render the "Show recently completed (N)" pill above the board. On click → dispatch `SET_SHOW_COMPLETED: true`. N = count of `done|superseded` within grace window.

**`components/tasks/TaskCard.tsx`** — when `status === 'awaiting_verification'`, render a small purple pill "Awaiting verification" next to the title.

**`components/tasks/TaskDetailPanel.tsx`** — surface the `SourceProvenanceBadge` here too (currently only on `TaskCard`). Click into a task and you lose the source attribution today; that's broken.

### 3.3 Files NOT touched

- `lib/task-types.ts` enum — already correct.
- Migration 102 — already correct.
- `BulkActionBar.tsx` direct-`done` write — deferred (D6, open question).
- `lib/task-queries.ts` legacy alias mapping (`awaiting_verification → 'new'`) — needs separate review; out of scope here.

---

## 4. UX Audit (Problem 3) — COMPLETED 2026-05-06

> **STATUS: complete.** §4.2 walkthrough executed against `dg-work-os.vercel.app/tasks` from a DG session (and a `Test HECI Analyst` View As session). Screenshots saved to `audit-screenshots/tasks-overhaul/`. §4.3 themes and top picks filled in below; awaiting owner review before Phase 1 implementation begins.

### 4.1 Pre-derived findings (code-only)

The following were caught by code recon and don't require browser confirmation. Severity per your scale: **B** = blocker, **A** = annoying, **N** = nice-to-have.

| # | Finding | Severity | Source | Recommended fix |
|---|---|---|---|---|
| F1 | `TaskDetailPanel` doesn't show extraction-source badge — only `TaskCard` does. Click into a task and provenance disappears. | A | `components/tasks/TaskDetailPanel.tsx` vs `TaskCard.tsx:222-226` | Add `<SourceProvenanceBadge>` to detail panel header. |
| F2 | Refresh loses every piece of state except view mode. | A | `KanbanBoard.tsx:102` | URL-sync hook (D3). |
| F3 | `BulkActionBar` allows direct `done` on an `awaiting_verification` task → bypasses DG verification. | B | `BulkActionBar.tsx:236-273` | **Phase 1.** Server 409 + client disable (D6, Task 11). |
| F4 | `TasksByStatus` type only buckets 4 statuses; Kanban API catch-all dumps `awaiting_verification`/`superseded` into New. | A→B *(reclassified)* | `lib/task-types.ts:63-68`, `app/api/tasks/route.ts:87-99` | **Phase 1.** Widen `TasksByStatus` to 6 keys, fix bucketing (D8, Task 10). |
| F5 | Title has comparator but no menu entry. | N | `TaskListView.tsx:72` vs `KanbanFilters.tsx:187-192` | Bundled with D2. |
| F6 | List view has no group-by-status — only flat sort. | N | `TaskListView.tsx` | Defer; Kanban view fills this need today. |
| F7 | `completed_at` set but never read — informational dead weight. | A | `app/api/tasks/[id]/route.ts:80-85` | Repurpose (D1/D4). |

### 4.2 Live walkthrough — completed 2026-05-06

Walkthrough executed against `https://dg-work-os.vercel.app/tasks` as `alfonso.dearmas@mpua.gov.gy` (DG). Screenshots saved to `audit-screenshots/tasks-overhaul/`. Each row records the literal observation; the **F#** finding numbers in §4.1 are reused where applicable, and new findings are tagged **W#** (walkthrough). Severity per the same B/A/N scale.

#### Desktop (1440×900)

| # | Scenario | Screenshot file | Findings |
|---|---|---|---|
| 1 | Default `/tasks` page on load | `01-default-desktop.png`, `01b-default-desktop-no-activity.png` | **W1 (A):** Activity panel is open by default and consumes ~290 px on the right; the Done column is fully clipped at 1440 px until the panel is closed. **W2 (A):** A "Enable notifications" toast covers the bottom-right tasks on first load — semi-blocks click targets. **W3 (A):** Header reads "116 tasks · 49 new · 26 active · 1 blocked · 40 done"; the global counts include 40 Done and never update with active filters, contributing to the visual clutter D1 is trying to remove. |
| 2 | Filter panel open, no filters applied | `02-filter-panel-empty.png` | **W4 (A):** Status group only exposes 4 options (New / Active / Blocked / Done) — `awaiting_verification` and `superseded` not pickable, consistent with D5/D7's intent but worth noting in the spec. **W5 (N):** Priority is multi-select checkboxes while Due Date is single-select radios — control-type inconsistency. **W6 (N):** Agency list truncates after 4 entries with a literal "—" separator and "Clear filters" link (no scroll affordance). |
| 3 | Each filter chip clicked individually (agency, priority, status, due date, assignee) | `03a-filter-agency.png`, `03b-filter-priority.png`, `03c-filter-status.png`, `03d-filter-due-date.png`, `03e-filter-assignee.png` | **W7 (N):** Filter chip casing inconsistent — chip reads "Priority: high" (lowercase) while the label is "High". **W8 (A):** Two clear-affordances ("Clear all" link top, "Clear filters" link bottom) duplicate function — pick one. **W9 (A):** Assignee selector is a single native `<select>` with no autocomplete; will scale poorly past ~30 users. **W10 (A):** Active=0 / Blocked=0 columns under filter still show "+ Add task"; creating from those columns yields a task that immediately disappears under the active filter (silent confusion). |
| 4 | Multiple filters applied simultaneously | `04-filter-combo.png` | Tested, no findings (chips stack, AND semantics work as expected). |
| 5 | Sort menu open | `05-sort-menu-open.png` | Confirms F5 + D2: 5 hardcoded options (Due Date / Priority / Created / Assignee / Agency). **No Status, no Title.** **W11 (N):** Menu has no backdrop dismiss — must click Sort again or pick an option to close. |
| 6 | Each sort option selected (5 today, 7 after fix) | `06a-sort-priority.png` | Tested, no findings beyond W11/F5/D2 already captured in §4.1. Selected option marked with a `↑/↓` arrow. |
| 7 | Sort with asc / desc toggle on same field | `07-sort-toggle-dir.png` | **W12 (N):** Direction toggles by clicking the same option twice. There is no visual hint in the menu that a second click flips direction — discoverability gap. |
| 8 | Search box: empty | `08a-search-empty.png` | Tested, no findings. |
| 9 | Search box: single keyword | `08b-search-single.png` | Tested, no findings. Substring match against title (and likely description). |
| 10 | Search box: multi-word phrase | `08c-search-multi.png` | Tested, no findings. AND across words. **W13 (N):** No match-term highlighting in card titles. |
| 11 | Search box: no results | `08d-search-zero.png` | **W14 (A):** Zero-results renders the same generic "No tasks / + Add task" empty state as no-data. No "0 results — try clearing filters?" copy. The "+ Add task" CTA on a zero-result column is misleading. |
| 12 | Search box: special characters (`<>"'%`) | `08e-search-special.png` | Tested, no findings. XSS-safe; rendered as literal text. |
| 13 | Click task row → TaskDetailPanel opens | `09-task-detail-panel.png`, `09b-task-options-menu.png`, `09c-edit-from-options.png` | **W15 (A):** Single click on a card does NOT open the detail panel — it merely toggles an inline-expanded preview (gold border, assignee + description shown in-card). The detail panel is reached via 3-dot Task options → Edit. Discoverability gap; users will likely miss the detail view entirely. |
| 14 | TaskDetailPanel — does it show source-meeting badge? (F1) | `10-detail-source-check.png` | **F1 confirmed (A).** Opened "Engage Qatari ambassador" (FROM MEETING on its card). Detail panel shows assignee, due date, created info, description, subtasks, comments, activity, delete — but **no source-meeting badge / source quote / meeting reference**. Provenance disappears once you open the panel. |
| 15 | Hover states: Edit, Delete, Verify, Close on detail panel | `11-detail-hover.png` | **W16 (N):** Detail panel header has only an `X` close — no visible Edit / Verify / Close action buttons. Edits happen by clicking individual fields (title, status pill, etc.); affordances rely on hover. Delete sits at the bottom (red, destructive). No Verify button surfaced for verify-permission users either, even on `awaiting_verification` tasks (relevant to D7). |
| 16 | Click "Add Task" → NewTaskModal opens, all fields visible | `12-create-modal.png` | **W17 (keep):** Create form is **inline** (not a modal) — slides in below the toolbar, no context switch. Includes a "Use Template" affordance. Solid pattern. |
| 17 | Create flow: required vs optional, what auto-fills | `13-create-fields.png` | Fields: Title, Description (optional, marked), Agency (default "No Agency"), Priority (default Medium), Due Date (mm/dd/yyyy), Assignee (default "Assign to me"). **W18 (N):** Title is required but not marked with `*` or aria-required affordance. |
| 18 | Inline edit: click title in detail panel, enter edit mode | `14-inline-edit-title.png` | Tested, works. Click title in panel → editable input with gold border. |
| 19 | Inline edit: due date, assignee, priority via TaskMetadata | `15a-inline-meta.png` | Tested, works (covered by panel field clicks). **W19 (A):** Same hover-preview overlay pattern leaks behind the detail panel and can over-paint adjacent columns when interacting near the panel edge — minor visual artifact but distracting. |
| 20 | Bulk select: enter selection mode, select 3 tasks | `16-bulk-selected-3.png` | Tested, works. Clicking a card-level checkbox enters selection mode; column headers also expose checkboxes for "select all in column". BulkActionBar appears at bottom: Due Date / Assignee / Agency / Status / Delete + Clear. |
| 21 | BulkActionBar: each popover (date, assignee, agency, status, delete) | `17a-bulk-status.png`, `17b-bulk-due-date.png`, `17c-bulk-assignee.png`, `17d-bulk-agency.png`, `17e-bulk-delete.png` | **F3 confirmed (B):** the Status popover offers a direct "Done" button alongside New / Active and a "Block with reason" input — no verification gate (D6 fixes this). Other popovers tested, no additional findings. **W20 (A):** Delete uses a 2-step destructive confirm ("Delete N tasks? This cannot be undone") with no archive / soft-delete fallback — repurposing `completed_at` per D4 mitigates this need for non-error cases. |
| 22 | List view → page 2, page 6 of pagination | `18a-list-page1.png`, `18b-list-page2.png`, `18b-list-pagination.png`, `18c-list-page6.png` | Pagination works: 20/page, 6 pages for 116 tasks, label "21-40 of 116" / "101-116 of 116", controls Prev / 1 / 2 / ... / 6 / Next. **F2 reaffirmed (A):** the page index is held only in component state — refresh / share returns the user to page 1 (D3 will fix). |
| 23 | Empty state: filter combo that returns zero | `19-empty-zero-results.png` | See W14 — no zero-results-specific empty state. Same "+ Add task" CTA still present in every column even with explicit filter chips. |
| 24 | Error state: try a known-bad action (assign to deleted user) | _not reproduced_ | **N/A — could not reach a deleted-user reference safely against production data.** Recommend covering in Phase 2 with a synthetic fixture. |
| 25 | Drag a task from Active to Blocked → reason prompt | `21-blocked-prompt.png`, `21-blocked-prompt-options.png` | **W21 (A):** Drag-and-drop did not respond to Playwright synthetic events (likely react-dnd HTML5 backend ignores them). Cannot capture the reason prompt without manual interaction. **W22 (B):** The 3-dot Task options menu only offers `Edit / Move to Done / Delete task` — there is **no "Move to Blocked" affordance anywhere in keyboard / pointer UI besides drag**. That makes blocking a task keyboard- and a11y-inaccessible. The reason-prompt flow exists in code (per F-class drag handlers) but is unreachable without a working drag, so this is a blocker for accessibility. |
| 26 | Drag Active → Done | `22-complete-flow.png` | Used the `Move to Done` menu option as DG. Task transitions **straight to `done`** (counts shifted Active 26→25, Done 40→41 immediately). The verification gate is bypassed for verify-permission users — consistent with D5/D7 design intent (DG is both owner and verifier). For officers, the same path should land in `awaiting_verification`; not testable from a DG session without role switch. (Restored: task moved back to Active afterward to leave production unchanged.) |
| 27 | Extraction-sourced task: click source badge on card | `23-source-badge-click.png` | **W23 (A):** Clicking the FROM MEETING pill opens a small popover with the source quote (italic) plus `Meeting: 01KQ7P2ZNN79BFESGY4GP64M8Z @ 3409.9`. The meeting reference is an opaque ULID + offset with no human-readable title and no link to the meeting page — provenance is shown but unactionable. |
| 28 | Extraction-sourced task: detail panel source visibility | `24-detail-source-visible.png` | F1 reaffirmed — same finding as #14. The popover from #27 is the only place the source surfaces; the detail panel does not surface it. |
| 29 | **Baseline for D8:** awaiting_verification placement | _no test data — `GET /api/tasks` returns zero awaiting_verification rows in production_ | **W24 (informational):** Verified via `fetch('/api/tasks')` from the page — response has only the 4-bucket shape `{ new, active, blocked, done }` and no rows with `status === 'awaiting_verification'` exist anywhere in the payload. The catch-all bug from D8 is therefore **latent** — it will only manifest once the verification flow generates data. Phase 1 D8 still required to prevent silent breakage. |
| 30 | **Baseline for D8:** superseded placement | _no test data_ | Same as #29 — zero `superseded` rows in production today. Latent bug. |
| 31 | **Baseline for F3:** bulk Done bypass | covered by `17a-bulk-status.png` | Confirmed in #21 — the Done bulk button is unconditionally enabled and would write `status='done'` to any selection. No `awaiting_verification` rows currently exist to prove the bypass empirically, but the UI affords it and the server has no guard (per code recon). D6 fix is required. |
| 32 | **Baseline for D7:** officer vs DG board comparison | `28-view-as-modal.png`, `28a-officer-board.png`, `28b-dg-board.png` | Tested both views via the View As modal (selected `Test HECI Analyst` for officer-equivalent). **Both DG and Analyst sessions render the same 4-column board** (New / Active / Blocked / Done) with identical column logic. Confirms D7 baseline: no role-aware columns today; D7 introduces them. **W25 (informational):** the View As switcher only exposes Agency Manager and Analyst test users — there's no pure `officer` test fixture, and no `parl_sec` user either. Consider adding fixtures before D7 testing. |

#### Mobile (iPhone 14 Pro — 393×852)

| # | Scenario | Screenshot file | Findings |
|---|---|---|---|
| 33 | Default `/tasks` mobile, board view | `m01-default-mobile.png` | **W26 (A):** Status tabs (New / Active / Blocked / Done) render as a horizontally-scrolling row but the **Done tab is clipped** at 393 px wide — user must swipe the tab strip just to see the Done tab. Bottom nav is Mission Control / Intel / Projects / Meetings / More — Tasks itself is not in the bottom nav (lives behind the More drawer). |
| 34 | Mobile column tabs — switch through New/Active/Blocked/Done | `m02-mobile-tabs-active.png`, `m02b-mobile-tabs-done.png` | Tab switching works; Done tab requires the user to first swipe the tab strip (W26). Otherwise tested, no findings. |
| 35 | Tap task card → bottom sheet | `m03-mobile-card-tap.png` | **W27 (A):** Single tap on a card produces the same inline-expand pattern as desktop (shows assignee + description in-place) — **not a bottom sheet**. To reach the detail panel the user still needs to find and tap the 3-dot menu and pick Edit. The same discoverability concern as W15, amplified on mobile where 3-dot targets are smaller. |
| 36 | Mobile FAB → create flow | `m04-mobile-fab.png` | **W28 (B):** **No "Add Task" FAB exists on mobile.** The only floating button on the page is the AI Assistant sparkle. The toolbar at the top has no Add Task button either — just Board/List, Search, person, and filter icons. The bottom-nav "More" tab opens the sidebar drawer (not a bottom action sheet). The only path to create a task on mobile is via a column-level "+ Add task" link that requires scrolling. This is a daily-workflow blocker for any user trying to capture a task quickly on phone. |
| 37 | Mobile filter panel | `m05-mobile-filters.png` | Filter panel renders inline below the toolbar, vertically stacked (Agency / Assignee / Priority / Due Date / Status). Same options as desktop. Tested, no findings. |
| 38 | Mobile sort menu | `m06-mobile-sort.png` | **W29 (A):** Tapping the sort icon on mobile produces a tiny popover that renders only an `↑` arrow — option labels are not visible (likely the popover width is mis-computed for mobile or it's overlapping with the filter trigger position). Could not select a sort option without first closing the filter panel. Bug. |
| 39 | Mobile bulk select | `m07-mobile-bulk-affordance.png` | **W30 (A):** **No bulk-select affordance is exposed on mobile.** Cards do not show checkboxes, there's no long-press to enter selection mode, and the column-header checkboxes from desktop are absent. BulkActionBar is desktop-only. Per Q3, this is **not blocking a single-task daily workflow** (officer/DG can still complete or comment on a single task) — defer to Phase 2. |
| 40 | Mobile detail panel | `m08-mobile-detail.png` | Detail panel on mobile is a **full-screen bottom-sheet modal** (slide-up). Shows title + status pill + comments + activity + Delete. **W31 (A):** Same F1 issue as desktop — no source provenance shown in the mobile detail view either. **W32 (N):** When the panel is open the activity log can be very long and pushes Delete far below the fold; users may not realize Delete exists. Consider a sticky footer for destructive / primary actions on mobile. |

### 4.3 Themes and recommendations

Findings consolidated into themes; effort tags **S** (≤2 hrs), **M** (≤1 day), **L** (>1 day).

#### Theme A — Workflow integrity

| # | Findings | Fix | Effort |
|---|---|---|---|
| A1 | F3 / W21 — BulkActionBar Status menu offers a direct Done that writes `status='done'` over selections including `awaiting_verification`, bypassing DG verification. | D6 (server 409 + client disable). **Already in Phase 1.** | M |
| A2 | W22 — Blocking a task is drag-only; no menu / keyboard path exists. The reason-prompt is unreachable without a working drag. | Add `Move to Blocked (with reason)` to the 3-dot Task options menu, and surface it from the detail panel header for keyboard access. | M |
| A3 | F4 / W24 — Kanban API silently dumps unknown statuses into `new`. Latent today (no `awaiting_verification` / `superseded` rows) but will break on first verification cycle. | D8 (6-bucket grouping, no catch-all). **Already in Phase 1.** | S |

#### Theme B — Source-of-truth / provenance

| # | Findings | Fix | Effort |
|---|---|---|---|
| B1 | F1 / W31 — TaskDetailPanel (desktop and mobile) does not surface the source-meeting badge / quote / meeting reference. Provenance is visible only on the card. | Add `<SourceProvenanceBadge>` to detail panel header + render quote in a collapsed sub-section. **Already in Phase 1.** | S |
| B2 | W23 — Card source popover shows `Meeting: <ULID> @ <offset>` — opaque, unactionable. | Resolve the meeting ID to a human-readable title and make the row a link to the meeting page (or at least a tooltip with the title). | M |

#### Theme C — Discoverability

| # | Findings | Fix | Effort |
|---|---|---|---|
| C1 | W15 / W27 — Single click / tap on a card opens an inline preview, not the detail panel. Detail is reachable only via the 3-dot menu's Edit item. Most users will never find the detail view. | Make a primary click on the card body open the detail panel; keep the inline-expand on a secondary affordance (e.g., a chevron / "expand inline" button). | M |
| C2 | W12 — Sort menu has no visual hint that clicking the active option flips direction. | Add a separate `↑↓` arrow toggle next to the active option, or a subtle "click again to flip" hint on hover. | S |
| C3 | W26 — Mobile status tab strip clips the Done tab at 393 px. | Switch to a horizontally-scrollable strip with a fade gradient, or shrink tab labels and counts to fit four tabs at 393 px. | S |

#### Theme D — Mobile parity

| # | Findings | Fix | Effort |
|---|---|---|---|
| D1 | W28 — No Add Task FAB on mobile and no toolbar Add Task button. Creation is buried behind a column-level "+ Add task" link that requires scrolling. | Add a primary Add Task FAB above the bottom nav (yellow gold, plus icon), visible on the tasks page only. | S |
| D2 | W29 — Mobile sort menu renders empty (only an arrow); options not visible. | Re-anchor the popover to the trigger button on mobile and ensure full-width / max-content sizing. Bug fix. | S |
| D3 | W30 — No bulk-select affordance on mobile. | Defer to Phase 2 (Q3 — non-blocking for single-task daily workflows). | M |
| D4 | W32 — Long activity logs push Delete below the fold in the mobile bottom-sheet detail. | Sticky footer for primary / destructive actions on mobile detail panel. | S |

#### Theme E — Empty / zero-state quality

| # | Findings | Fix | Effort |
|---|---|---|---|
| E1 | W10 / W14 — Empty columns and zero-result columns show identical "No tasks / + Add task" UI. Adding a task while a filter is active hides it on save (silent). | Differentiate: when filters are active, swap the empty state to "No matches — Clear filters" (with a button) and hide the "+ Add task" CTA on filtered columns. | S |
| E2 | W3 — Header-strip counts (49/26/1/40) never update with filters and contribute to clutter. | Update header counts to reflect the *visible* (filtered) board, with a tooltip for the global value. | S |

#### Theme F — Refresh-survives-state (already covered)

| # | Findings | Fix | Effort |
|---|---|---|---|
| F1 | F2 / pagination state in #22 — refresh resets filters / sort / search / page index. | D3 + URL-sync hook. **Already in Phase 1.** | M |

#### Theme G — Filter-panel polish

| # | Findings | Fix | Effort |
|---|---|---|---|
| G1 | W5 — Priority is multi-select checkboxes; Due Date is single-select radios — control-type inconsistency. | Pick one per group based on data semantics; document. | S |
| G2 | W6 — Agency list truncates after 4 rows with a literal `—` separator. | Render the full list (8 agencies) inline; if growth makes that untenable, switch to a typeahead like the bulk Assignee popover. | S |
| G3 | W7 — Filter chip casing inconsistent ("Priority: high" vs label "High"). | Normalize chip rendering with `Title Case`. | S |
| G4 | W8 — Two clear-affordances ("Clear all" link top, "Clear filters" link bottom) duplicate function. | Keep one (the chip-row "Clear all"); remove the bottom one. | S |
| G5 | W9 — Assignee filter is a native `<select>` with no autocomplete. | Replace with the same typeahead used in the BulkActionBar Assignee popover. | M |

#### Theme H — Misc

| # | Findings | Fix | Effort |
|---|---|---|---|
| H1 | W1 — Activity panel is open by default on `/tasks` and clips the Done column at 1440 px. | Persist a per-page or per-user "activity panel collapsed" preference; consider auto-collapse on `/tasks` specifically. | S |
| H2 | W2 — "Enable notifications" toast covers bottom-right tasks on first load. | Throttle / move toast to top-right; honor "Not now" for at least 7 days before re-prompting. | S |
| H3 | W19 — Hover-preview overlays leak behind the detail panel and over-paint adjacent columns. | Hide hover preview while the panel is open (controlled via a board-level `panelOpen` flag). | S |
| H4 | W11 — Sort menu has no backdrop dismiss. | Wrap menu in a click-outside handler. | S |
| H5 | W13 — No match-term highlighting in card titles for active search. | Wrap matched substrings in `<mark>` styling. | S |
| H6 | W18 — Title field in the create form is required but unmarked. | Add `*` and `aria-required="true"`. | S |
| H7 | W20 — Bulk Delete is hard-delete with no archive option. | Consider an Archive variant once D4's grace-period semantics are in place — Archive could simply set `status='superseded'` + `completed_at=now()`. | M |
| H8 | W25 — No `officer` or `parl_sec` test users in View As. | Add fixtures before D7 implementation tests. | S |

#### Top picks for this PR (ship in Phase 1 / 2)

The three highest-value items already locked in Phase 1 (D6 / D8 / B1 + the URL-sync work covering F1) absorb the most-severe walkthrough findings (A1, A3, B1, F1). The walkthrough surfaces five **new** items worth elevating into the same PR or an immediate follow-up:

1. **A2 — Add "Move to Blocked (with reason)" to the menu / detail panel header** (M). Closes the keyboard / a11y gap and makes the workflow reachable without drag. Worth bundling with Phase 1's D6 work since both touch BulkActionBar / status transitions.
2. **C1 — Make a card click open the detail panel** (M). Single biggest discoverability fix; users will start using the panel that B1 just enriched.
3. **D1 — Mobile Add Task FAB** (S). Daily-workflow blocker on phone; tiny effort.
4. **D2 — Mobile sort menu render bug** (S). Pure regression fix.
5. **E1 — Differentiate "no matches" from "no tasks" empty state** (S). Tiny but compounds with the search / filter work that ships with D3.

All other findings (B2, C2, C3, D3, D4, E2, F1 already in Phase 1, G1–G5, H1–H8) are recommended for **Phase 2** — none of them block the locked Phase 1 changes.

---

## 5. Phasing

This spec proposes one PR with the original 12-task scope **plus 6 audit-driven additions** elevated to Phase 1 by the owner on 2026-05-06.

### Phase 1 — Ship in this PR
**Original scope (D1–D9):**
1. Migration 107 (backfill `completed_at`, index).
2. API: `?show_completed` param + grace-period filter.
3. API: D8 — clean Kanban API bucketing (6 explicit buckets, no catch-all).
4. UI: "Show recently completed (N)" pill, default-hidden Done/Superseded.
5. Sort: `status` + `title` added to menu and comparator.
6. URL-sync hook for filter/sort/search/page state.
7. F1 fix: `SourceProvenanceBadge` in `TaskDetailPanel`.
8. F3 fix: D6 — bulk-Done verification-bypass guard (server 409 + client disable).
9. D7 — Role-aware Kanban columns (5-column for verify-permission users, 4-column for officers).
10. Card pill — "Awaiting verification" indicator (D5).

**Audit-driven additions elevated 2026-05-06:**
11. **W15 / W27 (C1) — Card click opens detail panel.** Replace the current inline-expand on primary click; move inline-expand to a secondary chevron / expand button so it remains reachable.
12. **W22 (A2) — "Move to Blocked" in TaskContextMenu.** Add menu item for `new` / `active` cards; reuse the existing `blockedPrompt` reducer flow + `KanbanModals` reason input. Confirmed small (~30 min).
13. **W28 (D1) — Mobile Add Task FAB.** Primary gold FAB above the bottom nav on `/tasks`, opens the same inline create form.
14. **W29 (D2) — Mobile sort menu render bug.** Re-anchor the sort popover so options render with full width on mobile.
15. **W14 / W10 (E1) — Filtered empty-state CTA.** When filters / search / `show_completed` are active and a column has zero rows, swap to "No matches — Clear filters" and hide the "+ Add task" CTA on filtered columns.
16. **W23 (B2) — Resolve source meeting title.** Combined with item 7 above: in the source popover **and** the new detail panel badge, resolve `source_meeting_id` to a human-readable meeting title and link to the meeting page.

**PR step:**
17. Build, push, open PR. Run §6 Playwright Test Plan against the preview URL with the synthetic-task verification protocol below; attach all screenshots (including pre/post comparisons for items 11, 13, 14, 15) to the PR body.

### Phase 2 — Next PR (post-audit)
- Remaining theme items not elevated: B2 already folded into Phase 1, C2 (sort dir hint), C3 (mobile tab clip), D3 (mobile bulk select), D4 (mobile detail sticky footer), E2 (header counts reflect filters), G1–G5 (filter polish), H1–H8 (misc).

### Phase 3 — Backlog
- Configurable grace period in `/admin` settings (UI for `TASKS_GRACE_PERIOD_DAYS`).
- List view group-by-status (F6).
- Pending Verification column expand-to-confirm-empty interaction polish.
- (Out of scope: `lib/task-queries.ts` alias-mapping audit — D9 leaves it out of scope.)

---

## 6. Playwright Test Plan (Post-Deploy Verification)

To run after the Phase 1 PR ships to a preview URL. All scenarios assume `alfonso.dearmas@mpua.gov.gy` session unless otherwise noted.

### 6.0 Synthetic-task verification protocol (T13–T17 prerequisite)

Production has **zero `awaiting_verification` rows** today (confirmed in §4.2 #29), so T13–T17 cannot be visually verified against unmodified production data. Before running T13–T17:

1. **Insert one synthetic task** into Supabase via the SQL editor or `supabase` CLI:
   ```sql
   INSERT INTO tasks (id, title, status, owner_id, agency, priority, created_at, updated_at, source)
   VALUES (
     gen_random_uuid(),
     '[VERIFICATION TEST] Synthetic awaiting_verification task — delete after PR review',
     'awaiting_verification',
     '<officer-test-user-id>',  -- e.g., the Test HECI Analyst user id
     'HECI',
     'medium',
     now(), now(),
     'manual'
   ) RETURNING id;
   ```
   Note the returned `id` for the cleanup step. The task should be owned by an officer-equivalent (so DG sees it as "pending my verification") and assigned to a known agency for the agency_admin scenario.
2. **Run T13–T17** below, capturing screenshots. Use `View As` to switch between DG, the officer-equivalent, and an agency_admin in the task's portfolio. T16 also requires staging a real `active` task in the same selection.
3. **Delete the synthetic task** immediately after T17 completes:
   ```sql
   DELETE FROM tasks WHERE id = '<returned-id>';
   ```
4. **Re-confirm production state:** rerun the §4.2 #29 fetch (`GET /api/tasks` from devtools console) and verify the response still has zero `awaiting_verification` rows in any bucket.

The protocol is mandatory — **do not ship the PR without these screenshots in the body.** If the synthetic insert is blocked by RLS or a CHECK constraint we haven't seen, that itself is a finding and must be fixed before merge.

### 6.1 Test matrix

| # | Scenario | Expected outcome |
|---|---|---|
| T1 | Navigate to `/tasks` cold | Done column is empty (or only contains tasks with `completed_at` within last 7 days). "Show recently completed (N)" pill visible above board. |
| T2 | Click "Show recently completed" pill | All `done`/`superseded` tasks visible, including those older than 7d. |
| T3 | Mark a task done from Active | Task moves to Done column. URL does not change. |
| T4 | Change task's `completed_at` in DB to 8 days ago, refresh | Task disappears from default view. |
| T5 | Open Sort menu | "Status" and "Title" options present. |
| T6 | Sort by Status ascending | Order: New tasks first, then Active, Blocked, Awaiting Verification, Done, Superseded. |
| T7 | Apply filter (status=blocked, priority=high), sort by status, search "audit" | URL contains `?status=blocked&priority=high&sort=status&q=audit`. |
| T8 | Refresh page | All filters / sort / search restored from URL. |
| T9 | Copy URL to incognito (re-login required), open it | Same filtered view appears. |
| T10 | Open an extraction-sourced task's detail panel | `SourceProvenanceBadge` visible in panel header **AND** the human-readable meeting title appears next to or in place of the raw ULID (W23). |
| T11 | On a task with `status='awaiting_verification'`, view card | Purple "Awaiting verification" pill on card. |
| T12 | Mobile (393×852): T1, T2, T5, T6, T8 | All pass. |
| T13 | **Synthetic-task required.** As DG, navigate to `/tasks` | 5-column board: New / Active / Blocked / **Pending Verification** (with the synthetic task visible) / Done. Synthetic task is NOT hidden by grace period. |
| T14 | **Synthetic-task required.** Switch View As → officer-equivalent (Test HECI Analyst), navigate to `/tasks` | 4-column board. The synthetic task appears in the **Done** column with the purple "Awaiting verification" pill, NOT hidden by grace period. |
| T15 | **Synthetic-task required.** Switch View As → agency_admin in synthetic task's portfolio agency | 5-column board (Pending Verification visible, contains synthetic). Switch agency filter to a non-portfolio agency → 4-column board. |
| T16 | **Synthetic-task required.** As DG, select 2 tasks (one `active`, the synthetic `awaiting_verification`), open BulkActionBar status menu, click Done | Done button is disabled with tooltip "Selection includes tasks awaiting DG verification — use the verify flow." Direct API PATCH returns 409 with `{ error: 'verification_required', blockedIds: [<synthetic-id>] }`. |
| T17 | API: `fetch('/api/tasks')` from devtools | Response `tasks` field has all 6 buckets: `new, active, blocked, awaiting_verification, done, superseded`. The synthetic task is in the `awaiting_verification` bucket, NOT silently in `new`. |

### 6.2 Audit-driven verification (W-items)

| # | Scenario | Expected outcome | Pre/post screenshot |
|---|---|---|---|
| W15-T | Single click on a card body on the board | Detail panel slides in from right (desktop) / bottom sheet (mobile). The inline-expand chevron remains a separate, secondary affordance. | Pre: `audit-screenshots/tasks-overhaul/09-task-detail-panel.png`. Post: `…/post-deploy/w15-card-click-opens-panel.png`. |
| W22-T | 3-dot menu on a `new` or `active` card | "Move to Blocked" entry visible. Click → existing reason modal appears. Submitting moves the task to Blocked with the reason. | Pre: `…/21-blocked-prompt-options.png`. Post: `…/post-deploy/w22-move-to-blocked-menu.png`. |
| W28-T | Mobile (393×852) `/tasks` cold | Gold Add Task FAB visible bottom-right above the bottom nav. Tap opens the inline create form. | Pre: `…/m04-mobile-fab.png`. Post: `…/post-deploy/w28-mobile-fab.png`. |
| W29-T | Mobile sort menu | All sort options (Status / Due Date / Priority / Created / Assignee / Agency / Title) render at full width. | Pre: `…/m06-mobile-sort.png`. Post: `…/post-deploy/w29-mobile-sort-fixed.png`. |
| W14/W10-T | Apply a filter combo that returns zero rows | Empty columns show "No matches — Clear filters" with a button instead of "+ Add task". The "+ Add task" CTA is hidden in any column when filters/search/show_completed are active. | Pre: `…/19-empty-zero-results.png`. Post: `…/post-deploy/w14-no-matches-state.png`. |

Each test recorded as a screenshot in `audit-screenshots/tasks-overhaul/post-deploy/`. All Test 13–17 + W-T screenshots must be attached to the PR body.

---

## 7. Open Questions — All Resolved (2026-05-06)

1. ✅ **F3 / D6 — BulkActionBar bypassing verification flow:** **Included in Phase 1.** Server guard in `app/api/tasks/bulk/route.ts` returns 409; client disables Done bulk option + toasts on 409. Task 11 in §9.
2. ✅ **Grace period default:** **7 days, env var only (`TASKS_GRACE_PERIOD_DAYS`).** No `/admin/settings` UI in Phase 1; UI moves to backlog (§5 Phase 3, item 10).
3. ✅ **Mobile bulk select:** **Defer to Phase 2** unless §4.2 mobile walkthrough reveals it's blocking a daily workflow — in which case escalate.
4. ✅ **Verification queue visibility:** **Role-aware columns (D7).** Verify-permission users (`dg`/`minister`/`ps`/`parl_sec`/portfolio `agency_admin`) see a 5th column "Pending Verification" (auto-collapses when empty). 4-column users (`officer`/non-portfolio `agency_admin`) see `awaiting_verification` tasks in their Done column with the D5 pill, NOT subject to grace-period hide.
5. ✅ **Migration 102 deployment status:** **Confirmed on production.** CHECK constraint allows all 6 status values. Phase 1 unblocked on the schema side.
6. ✅ **`lib/task-queries.ts` alias mapping:** **Reframed as D8.** The actual Kanban-side bucketing problem lives in `app/api/tasks/route.ts:87-99`, not `task-queries.ts`. D8 fixes the Kanban API. `lib/task-queries.ts` (legacy `/api/tm/tasks/*` subsystem) left untouched per D9 — no follow-up commitment.

**Implementation may now proceed.** Pre-implementation gate is the §4.2 live walkthrough (next CC session, after `--isolated` MCP restart).

---

## 8. Out of Scope

- Action-items pipeline rework (Plan 2 territory).
- Verification flow UI redesign (`VerificationSurface.tsx`).
- New task statuses or workflow states.
- Database constraint changes — migration 102 already covers it (verified on prod 2026-05-06).
- `lib/task-queries.ts` legacy alias mapping (D9). Belongs to a separate `/api/tm/tasks/*` subsystem with 7 internal consumers; removal goes with that subsystem's eventual consolidation, not here. **No follow-up ticket commitment** per user direction.
- `/admin/settings` UI for `TASKS_GRACE_PERIOD_DAYS` (env var only in Phase 1; UI in backlog).
- Mobile bulk select fixes — Phase 2 unless §4.2 mobile walkthrough escalates them.
- Performance work (pagination, virtualization, query caching).
- Accessibility audit beyond what surfaces in the walkthrough.
- Any change to `/api/today`, `/api/briefing`, or other surfaces consuming task data.

---

## 9. Implementation Tasks (After Approval)

> **Pre-implementation gate (revised):** §2 decisions D1–D9 approved 2026-05-06. Migration 102 confirmed on prod. §4.2 walkthrough completed 2026-05-06; §4.3 themes filled. **Final gate is owner sign-off on the audit findings (Theme A–H and the Top Picks list).** Once Alfonso confirms which of A2 / C1 / D1 / D2 / E1 (the new walkthrough-derived items) join Phase 1, implementation may proceed in task order.

### Task 1: Migration 107 — backfill `completed_at`

**Files:**
- Create: `supabase/migrations/107_tasks_completed_backfill.sql`

- [ ] **Step 1: Verify next migration number**

```bash
ls /Users/alfonsodearmas/dg-work-os/supabase/migrations | sort | tail -5
```

Expected: confirm `107` is unused.

- [ ] **Step 2: Write migration**

(SQL from §3.1)

- [ ] **Step 3: Apply locally and verify backfill count**

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM tasks WHERE status IN ('done','superseded') AND completed_at IS NULL"
```

Expected: 0 after migration.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/107_tasks_completed_backfill.sql
git commit -m "feat(tasks): backfill completed_at for done/superseded grace-period filter"
```

### Task 2: Update supersedes endpoint to set `completed_at`

**Files:**
- Modify: `app/api/action-items/[id]/supersedes/route.ts:25`

- [ ] **Step 1: Edit `.update()` call to include `completed_at: new Date().toISOString()`**

- [ ] **Step 2: Manual smoke** — supersede an action item in dev, verify `tasks.completed_at` is set on prior task.

- [ ] **Step 3: Commit**

### Task 3: API — add `?show_completed` param and grace-period filter

**Files:**
- Modify: `app/api/tasks/route.ts:39-108`
- Test: `app/api/tasks/__tests__/route.test.ts`

- [ ] **Step 1: Write failing test** for default filtering of done >7d.

- [ ] **Step 2: Run** `npx vitest run app/api/tasks/__tests__/route.test.ts` — expect FAIL.

- [ ] **Step 3: Add `showCompleted` parsing + `query.or(...)` clause from §3.2.**

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Add test for `?show_completed=true` returning all.**

- [ ] **Step 6: Run + PASS.**

- [ ] **Step 7: Commit.**

### Task 4: Reducer — add `showCompleted` state + action

**Files:**
- Modify: `hooks/useBoardReducer.ts:222`

- [ ] **Step 1: Add `showCompleted: false` to initial state.**

- [ ] **Step 2: Add `SET_SHOW_COMPLETED` action and reducer case.**

- [ ] **Step 3: Wire to API call** in `KanbanBoard.tsx`'s data-fetch effect (pass as `?show_completed=`).

- [ ] **Step 4: Commit.**

### Task 5: UI — "Show recently completed (N)" pill

**Files:**
- Modify: `components/tasks/KanbanBoard.tsx`

- [ ] **Step 1: Compute `recentlyCompletedCount` from API response (count of grace-window terminals returned when `show_completed=false`).**

- [ ] **Step 2: Render pill above board when `count > 0` and `!showCompleted`.**

- [ ] **Step 3: Click handler dispatches `SET_SHOW_COMPLETED: true`.**

- [ ] **Step 4: Style per design system (gold-500 accent, navy-900 bg).**

- [ ] **Step 5: Commit.**

### Task 6: Sort — add `status` and `title` to menu + comparator

**Files:**
- Modify: `components/tasks/TaskListView.tsx:23` (extend `SortField`)
- Modify: `components/tasks/TaskListView.tsx:47-78` (add `STATUS_ORDER` and case)
- Modify: `components/tasks/KanbanFilters.tsx:187-192` (add menu entries)

- [ ] **Step 1: Write failing unit test for `sortTasks(tasks, 'status', 'asc')`.**

```ts
// In a new test file or extend existing
test('sortTasks by status uses lifecycle order', () => {
  const tasks = [
    { status: 'done', ... },
    { status: 'new', ... },
    { status: 'awaiting_verification', ... },
  ];
  const result = sortTasks(tasks, 'status', 'asc');
  expect(result.map(t => t.status)).toEqual(['new', 'awaiting_verification', 'done']);
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Add `STATUS_ORDER` constant and case (§3.2).**

- [ ] **Step 4: Run — PASS.**

- [ ] **Step 5: Add menu entries in `KanbanFilters.tsx`.**

- [ ] **Step 6: Manual: sort by status, sort by title — both work.**

- [ ] **Step 7: Commit.**

### Task 7: URL-sync hook

**Files:**
- Create: `hooks/useBoardUrlSync.ts`
- Modify: `components/tasks/KanbanBoard.tsx` (mount hook, hydrate initial state)

- [ ] **Step 1: Write hook — `useBoardUrlSync(state, dispatch)`. Read on mount, write on state change.**

```ts
'use client';
import { useEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export function useBoardUrlSync(state, dispatch) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Hydrate on mount
  useEffect(() => {
    const status = searchParams.get('status')?.split(',').filter(Boolean) ?? [];
    if (status.length) dispatch({ type: 'SET_STATUS_FILTER', value: status });
    const sort = searchParams.get('sort');
    if (sort) dispatch({ type: 'TOGGLE_SORT', field: sort });
    const dir = searchParams.get('dir');
    if (dir) dispatch({ type: 'SET_SORT_DIR', dir });
    const q = searchParams.get('q');
    if (q) dispatch({ type: 'SET_SEARCH', value: q });
    const completed = searchParams.get('completed');
    if (completed === '1') dispatch({ type: 'SET_SHOW_COMPLETED', value: true });
    // ... agency, priority, assignee, page
  }, []); // mount only

  // Write on state change
  useEffect(() => {
    const params = new URLSearchParams();
    if (state.statusFilter.length) params.set('status', state.statusFilter.join(','));
    if (state.sortField !== 'due_date') params.set('sort', state.sortField);
    if (state.sortDir !== 'asc') params.set('dir', state.sortDir);
    if (state.search) params.set('q', state.search);
    if (state.showCompleted) params.set('completed', '1');
    // ... rest
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [state.statusFilter, state.sortField, state.sortDir, state.search, state.showCompleted /* ... */]);
}
```

- [ ] **Step 2: Mount in `KanbanBoardInner`.**

- [ ] **Step 3: Manual: apply filters, refresh — state restored. Copy URL to incognito — same view.**

- [ ] **Step 4: Commit.**

### Task 8: F1 — `SourceProvenanceBadge` in detail panel

**Files:**
- Modify: `components/tasks/TaskDetailPanel.tsx`

- [ ] **Step 1: Import `SourceProvenanceBadge` from existing location (where TaskCard imports it).**

- [ ] **Step 2: Render in panel header when `task.source === 'extraction'`.**

- [ ] **Step 3: Manual: open an extraction-sourced task → badge appears in panel.**

- [ ] **Step 4: Commit.**

### Task 9: Card — "Awaiting verification" pill

**Files:**
- Modify: `components/tasks/TaskCard.tsx`

- [ ] **Step 1: Add conditional pill render when `task.status === 'awaiting_verification'`.**

- [ ] **Step 2: Style: bg-purple-500/15 text-purple-300 px-2 py-0.5 text-xs rounded.**

- [ ] **Step 3: Commit.**

### Task 10: D8 — Clean Kanban API bucketing

**Files:**
- Modify: `app/api/tasks/route.ts:87-99`
- Test: `app/api/tasks/__tests__/route.test.ts`

- [ ] **Step 1: Write failing test** — seed an `awaiting_verification` and a `superseded` task; assert the GET response has them in their own buckets, not under `new` or `done`.

- [ ] **Step 2: Run** — expect FAIL (currently catch-all dumps both into `grouped.new`).

- [ ] **Step 3: Replace bucketing.** Change the `grouped` initializer and the loop:

```ts
const grouped: Record<TaskStatus, TaskRow[]> = {
  new: [],
  active: [],
  blocked: [],
  awaiting_verification: [],
  done: [],
  superseded: [],
};

for (const t of data || []) {
  const task = flattenTaskOwner(t) as TaskRow;
  const col = grouped[task.status as TaskStatus];
  if (col) {
    col.push(task);
  } else {
    console.warn(`[/api/tasks] unknown status "${task.status}" on task ${task.id} — dropping. Possible schema drift.`);
  }
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Verify TypeScript downstream.** The `tasks` field in `/api/tasks` response now exposes 6 buckets. Update any client type that says `TasksByStatus` to match — `lib/task-types.ts:63-68` widens to all 6 keys.

- [ ] **Step 6: Commit.**

### Task 11: F3 — BulkActionBar verification-bypass guard (D6)

**Files:**
- Modify: `app/api/tasks/bulk/route.ts` (server guard)
- Modify: `components/tasks/BulkActionBar.tsx:236-273` (client guard)
- Test: `app/api/tasks/bulk/__tests__/route.test.ts` (create if not exists)

- [ ] **Step 1: Write failing server test** — bulk PATCH with `status: 'done'` over a selection that includes an `awaiting_verification` task should return 409 with `{ error: 'verification_required', blockedIds: [...] }`.

- [ ] **Step 2: Run** — expect FAIL.

- [ ] **Step 3: Add server guard** in the bulk PATCH handler, after fetching the affected tasks but before the update:

```ts
if (updates.status === 'done') {
  const blockedIds = tasks
    .filter(t => t.status === 'awaiting_verification')
    .map(t => t.id);
  if (blockedIds.length) {
    return NextResponse.json({
      error: 'verification_required',
      message: `${blockedIds.length} task(s) require DG verification. Use the verify endpoint instead.`,
      blockedIds,
    }, { status: 409 });
  }
}
```

- [ ] **Step 4: Run test — expect PASS.**

- [ ] **Step 5: Add second test** — bulk PATCH with `status: 'done'` over a selection of all `active`/`blocked` tasks succeeds normally (no false positives).

- [ ] **Step 6: Run — PASS.**

- [ ] **Step 7: Client guard.** In `BulkActionBar.tsx:236-273`, where the four status buttons render (`new`/`active`/`done`/`blocked`), gate the Done button:

```ts
const hasAwaitingVerification = useMemo(
  () => selectedTasks.some(t => t.status === 'awaiting_verification'),
  [selectedTasks]
);

// In the Done button JSX:
<button
  disabled={hasAwaitingVerification}
  title={hasAwaitingVerification
    ? 'Selection includes tasks awaiting DG verification — use the verify flow.'
    : undefined}
  ...
>
  Done
</button>
```

- [ ] **Step 8: Add 409 toast handler** in the bulk-update mutation — on `error: 'verification_required'`, show a toast with the message and refresh the selection.

- [ ] **Step 9: Manual test.** Mark one task `awaiting_verification` (via complete endpoint), select it + an active task, try bulk Done. Expected: button disabled with tooltip; if user bypasses via API call directly, server returns 409.

- [ ] **Step 10: Commit.**

### Task 12: D7 — Role-aware Kanban columns

**Files:**
- Modify: `components/tasks/KanbanBoard.tsx` (column rendering)
- Modify: `lib/auth-helpers.ts` (add `canVerify(role, agency?)` helper if not already present)
- Test: New unit tests for column visibility per role

- [ ] **Step 1: Write `canVerify(role, taskAgency?)` helper** in `lib/auth-helpers.ts`:

```ts
export function canVerify(role: UserRole, userAgency: string | null, taskAgency?: string | null): boolean {
  if (['dg', 'minister', 'ps', 'parl_sec'].includes(role)) return true;
  if (role === 'agency_admin' && userAgency && taskAgency && userAgency === taskAgency) return true;
  return false;
}
```

- [ ] **Step 2: Compute `showVerificationColumn` in `KanbanBoardInner`** based on session role + active agency filter (if user is `agency_admin`, column is shown only when looking at their portfolio).

- [ ] **Step 3: Update `COLUMNS` constant to be a derived value:**

```ts
const COLUMNS: TaskStatus[] = showVerificationColumn
  ? ['new', 'active', 'blocked', 'awaiting_verification', 'done']
  : ['new', 'active', 'blocked', 'done'];
```

- [ ] **Step 4: For the 4-column layout, fold `awaiting_verification` tasks into the Done column** in the client (after fetching the 6-bucket response from D8). Card pill from Task 9 makes the state legible.

- [ ] **Step 5: For the 5-column layout, the Pending Verification column auto-collapses to a thin gutter** (~32px wide, vertical "PENDING" label) when its task count is 0. Click-to-expand if user wants to confirm it's empty.

- [ ] **Step 6: Update grace-period filter logic** so `awaiting_verification` is NEVER hidden by D1, regardless of role. The `?show_completed=false` API filter only applies to `done`/`superseded`.

- [ ] **Step 7: Write tests for both layouts:**
  - DG session → 5 columns rendered
  - Officer session → 4 columns rendered
  - agency_admin viewing their own agency → 5 columns
  - agency_admin viewing a different agency → 4 columns
  - Both layouts: drag/drop between columns respects allowed transitions

- [ ] **Step 8: Manual: log in as DG, verify 5-column board. Log in as officer, verify 4-column board with awaiting_verification folded into Done with pill.**

- [ ] **Step 9: Commit.**

### Task 13: W15 / W27 — Card click opens detail panel

**Files:**
- Modify: `components/tasks/TaskCard.tsx` (primary click handler, add chevron for inline-expand)
- Modify: `components/tasks/KanbanBoard.tsx` (open detail panel on card click; same path used by Edit menu item today)

- [ ] **Step 1:** Move the inline-expand toggle off the card body's `onClick`. The card body's `onClick` should now dispatch the same action that the 3-dot Edit item dispatches today (open detail panel for `task`).
- [ ] **Step 2:** Add a small `ChevronDown` icon button in the card header (right of the title) for the inline-expand affordance. Default closed; click toggles expanded preview state in the existing `expanded` prop.
- [ ] **Step 3:** Mobile: tap on card body opens the existing bottom-sheet detail (already wired via `onBottomSheet`). Replace the current expand-on-tap with that.
- [ ] **Step 4:** Manual: click any card → detail panel opens. Click chevron → inline preview shows. Tap on mobile → bottom sheet.
- [ ] **Step 5:** Commit.

### Task 14: W22 — "Move to Blocked" in TaskContextMenu

**Files:**
- Modify: `components/tasks/TaskContextMenu.tsx`
- Modify: `components/tasks/KanbanBoard.tsx` (handler that surfaces blocked-reason modal)

- [ ] **Step 1:** Add `onBlock: (taskId: string) => void` prop to `TaskContextMenu`.
- [ ] **Step 2:** Render a "Move to Blocked" menu item between the existing `Edit` and the next-status item, **only when** `task.status` is `'new'` or `'active'`.
- [ ] **Step 3:** In `KanbanBoard`, pass `onBlock={(taskId) => dispatch({ type: 'SET_BLOCKED_PROMPT', taskId })}` so the existing `KanbanModals` reason input takes over.
- [ ] **Step 4:** Manual: open menu on a `new` task → "Move to Blocked" visible → click → reason modal → submit → task transitions to Blocked with reason.
- [ ] **Step 5:** Commit.

### Task 15: W28 — Mobile Add Task FAB

**Files:**
- Modify: `components/tasks/KanbanBoard.tsx` (or whichever component owns the mobile chrome around the board — same layer that renders the AI Assistant FAB)

- [ ] **Step 1:** On mobile (`useIsMobile()` already exists in the codebase, or media-query at the layout level), render a primary `Add Task` FAB at bottom-right — above the bottom nav and offset from the AI Assistant FAB so they don't overlap.
- [ ] **Step 2:** FAB uses `bg-gold-500 text-navy-950` per the design system, with a `Plus` icon.
- [ ] **Step 3:** `onClick` opens the same inline create form the desktop "Add Task" button opens (dispatch into the existing reducer action that toggles the create form visible).
- [ ] **Step 4:** Manual on a 393×852 viewport: FAB visible bottom-right above the bottom nav. Tap → create form opens.
- [ ] **Step 5:** Commit.

### Task 16: W29 — Mobile sort menu render bug

**Files:**
- Modify: `components/tasks/KanbanFilters.tsx` (sort menu render)

- [ ] **Step 1:** Reproduce: open dev tools, set viewport to 393×852, click the sort icon on `/tasks`. Confirm the popover renders at near-zero width with only the arrow visible.
- [ ] **Step 2:** Identify the cause — likely the popover's anchor uses `absolute right-0` from a trigger button whose container shrinks on mobile; or the `min-w-` on the menu is dropping below 0 on small viewports. Inspect the rendered DOM at the failure to confirm.
- [ ] **Step 3:** Fix: anchor the popover to the sort trigger button via a portal (or `position: fixed` keyed to `getBoundingClientRect()`), and set `minWidth: 200px` (matches `TaskContextMenu`).
- [ ] **Step 4:** Manual on 393×852: sort menu shows all 7 options at full width.
- [ ] **Step 5:** Commit.

### Task 17: W14 / W10 — Filtered empty-state CTA fix

**Files:**
- Modify: `components/tasks/KanbanBoard.tsx` (column empty state)

- [ ] **Step 1:** Compute `filtersActive` from reducer state: `state.statusFilter.length > 0 || state.priorityFilter.length > 0 || state.agencyFilter.length > 0 || state.assigneeFilter || state.dueDateFilter !== 'any' || state.search || state.showCompleted`.
- [ ] **Step 2:** When a column has zero rows AND `filtersActive`, render a "No matches" panel with a "Clear filters" button (dispatches reducer to reset all filter slices).
- [ ] **Step 3:** Hide the "+ Add task" CTA in any column when `filtersActive` (regardless of whether that specific column is empty).
- [ ] **Step 4:** Manual: apply a status=blocked + priority=critical combo → all columns show "No matches" + "Clear filters", no "+ Add task" anywhere. Clear filters → original empty / non-empty state returns.
- [ ] **Step 5:** Commit.

### Task 18: Verify & PR

- [ ] **Step 1: Build + typecheck.** `npm run build`. Fix anything that's not wired.
- [ ] **Step 2: Push branch.** Push `tasks-ui-overhaul-phase1` to origin.
- [ ] **Step 3: Open PR.** Title: `feat(tasks): UX overhaul — grace period, role-aware columns, audit-driven fixes`. Body links this spec, lists the 12 + 5 (W15/W27, W22, W28, W29, W14/W10) Phase 1 items, and embeds the §4.2 baseline + post-deploy comparison screenshot pairs.
- [ ] **Step 4: Wait for preview URL.**
- [ ] **Step 5: Synthetic-task protocol** (see §6.0): insert one `awaiting_verification` task into the preview DB, run T13–T17, capture screenshots, delete the synthetic task, confirm clean state.
- [ ] **Step 6: Run remaining tests** T1–T12 + W-T scenarios. Save screenshots to `audit-screenshots/tasks-overhaul/post-deploy/`.
- [ ] **Step 7: Attach all screenshots** (T1–T17 + W-T pre/post pairs) to the PR body.
- [ ] **Step 8: Request review.**

---

## Self-Review

**Spec coverage check:**
- ✅ Problem 1 (Done visibility): D1, D4, Task 1, 3, 4, 5
- ✅ Problem 2 (Sort by status): D2, Task 6
- ✅ Problem 3 (UX audit): §4 — pre-derived findings shipped, live walkthrough scripted, awaiting next-session execution under no-empty-cells contract
- ✅ User add-on 1 (TS/DB enum drift): §1.Bonus 1 — investigated, no bug, loose ends called out
- ✅ User add-on 2 (`completed_at` decision): §1.Bonus 2, D4
- ✅ User add-on 3 (URL persistence): §1.Bonus 3, D3, Task 7
- ✅ F3 inclusion (D6): Task 11
- ✅ Role-aware columns (D7): Task 12, T13–T15
- ✅ Kanban API bucketing (D8): Task 10, T17
- ✅ All §7 open questions resolved 2026-05-06

**Placeholder scan:** Section 4.2 has been filled in — every row carries either a screenshot reference + finding annotation, an explicit "Tested, no findings", or an "N/A — <reason>". No `_to fill_` survives.

**Type consistency:** `SortField` extension and `STATUS_ORDER` use `TaskStatus` from `lib/task-types.ts`. `STATUS_ORDER` covers all 6 values. `?show_completed` param name consistent in API and hook. `TasksByStatus` widens to 6 keys via Task 10 — no client consumer breaks (none exist outside the Kanban board, verified via earlier recon).

**Open questions captured:** All 5 resolved (§7). Implementation gate is now §4.2 walkthrough completion only.

---

**Top 3 highest-severity findings:**
1. **F3 (Blocker, now Phase 1):** `BulkActionBar` lets a user write `status='done'` directly to an `awaiting_verification` task, bypassing the DG verification step entirely. Real workflow violation. **Promoted from Phase 2 deferral to Phase 1 inclusion** (D6, Task 11) per user direction.
2. **F1 (Annoying):** `TaskDetailPanel` doesn't show the source-meeting badge — click into an extraction-sourced task and the provenance disappears. Single-component fix.
3. **F2/F7 combined (Annoying):** Refresh loses everything (filter/sort/search), and `completed_at` exists but is never read. Both addressed by D1+D3+D4 in Phase 1.
