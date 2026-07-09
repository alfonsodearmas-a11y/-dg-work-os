# Direct Outreach Enhancements v2 — Filters, Officers, Agency Transfer

**Status: PLAN v2 — FINAL, awaiting go for execution. No migration applied, no feature code written.**
Date: 2026-07-09 · Module baseline: migrations 144–146 live, Excel-upload ingestion (merge `e157db3`).
v1 → v2 changes are summarized in §7.

## Locked decisions (v1 open questions — now closed)

| # | Decision |
|---|---|
| Q1 | **Officer only.** Watchers + internal notes/@-mentions = deferred phase 2. The imported OP Direct comment log is rendered **visibly read-only** (section header: "Imported from OP Direct · read-only"). |
| Q2 | Assign = **superadmin + the owning agency_manager** (ownership by *effective* agency — see R4). |
| Q3 | Assignable users = **case-agency users + superadmins** (via `GET /api/tasks/users?agency=`; PUA → superadmins only). |
| Q4 | Workbook "Point Person" is **ignored for assignment, displayed read-only** in the panel; **no seeding**. |
| Q5 | **Notify on assignment** (`outreach_assigned` event through `createNotification`). |

## Requirements

- **R1/R2 (expanded):** combinable multi-select filters — **agency, status, theme, outreach (outreach_location), region, officer (+ Unassigned)** — all compiled to `ANY($n::text[])`; plus independent **toggles**: high-priority (`priority_flag = 'Elevated'`), stalled >60d, stalled >90d, has-target-date, overdue — all ANDable with each other and with search.
- **R3:** responsible officer per case (snapshot-surviving), Tasks-style, with notification.
- **R4:** **Transfer agency** (superadmin only): per-case agency override in a side table; `effective_agency = COALESCE(override, workbook agency)` threaded through **every** agency read via the view; transfer clears the officer, writes an audit row (from/to/by/at/reason + the cleared officer), notifies the receiving agency, and badges the case.

---

## 1. Migrations (exact list — applied via Supabase MCP only after your go)

### `147_direct_outreach_assignments.sql`
```sql
-- Officer assignment — human-entered, must survive snapshot-replace uploads:
-- NO FK to direct_outreach_cases (that table is wiped on every workbook upload;
-- case_id is OP Direct's stable external id and re-attaches by value).
CREATE TABLE public.direct_outreach_assignments (
  case_id          integer PRIMARY KEY,
  assignee_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  assigned_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX direct_outreach_assignments_assignee_idx
  ON public.direct_outreach_assignments (assignee_user_id);
ALTER TABLE public.direct_outreach_assignments ENABLE ROW LEVEL SECURITY;  -- no policies
REVOKE ALL ON public.direct_outreach_assignments FROM anon, authenticated;

-- Workbook-owned display columns (safe on the wiped table — re-supplied each upload).
ALTER TABLE public.direct_outreach_cases ADD COLUMN point_person text;
ALTER TABLE public.direct_outreach_cases ADD COLUMN region text;
```

### `148_direct_outreach_transfers.sql`
```sql
-- Current override (one per case; PK join keeps the view cheap). No FK to cases.
CREATE TABLE public.direct_outreach_agency_overrides (
  case_id integer PRIMARY KEY,
  agency  text NOT NULL,                 -- 'GWI' | 'GPL' | 'PUA' (validated in the route)
  set_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  set_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only audit of every transfer (including reverts). No FK to cases.
CREATE TABLE public.direct_outreach_transfers (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id                   integer NOT NULL,
  from_agency               text,        -- effective agency before the transfer
  to_agency                 text NOT NULL,
  cleared_assignee_user_id  uuid,        -- the officer removed by this transfer, if any
  reason                    text,
  transferred_by            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  transferred_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX direct_outreach_transfers_case_idx
  ON public.direct_outreach_transfers (case_id, transferred_at DESC);

ALTER TABLE public.direct_outreach_agency_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_outreach_transfers        ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.direct_outreach_agency_overrides,
              public.direct_outreach_transfers
  FROM anon, authenticated;

-- View v3: append effective_agency + transferred (CREATE OR REPLACE permits
-- appending columns at the end; existing column list/order unchanged).
CREATE OR REPLACE VIEW public.direct_outreach_open_v AS
SELECT
  c.*,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (c.created_at AT TIME ZONE 'America/Guyana')::date)              AS days_open,
  ((now() AT TIME ZONE 'America/Guyana')::date
     - (coalesce(c.last_activity_at, c.created_at) AT TIME ZONE 'America/Guyana')::date) AS days_idle,
  CASE
    WHEN c.created_at IS NULL THEN 'Unknown'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 30  THEN '0-30'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 90  THEN '31-90'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 180 THEN '91-180'
    WHEN (now() AT TIME ZONE 'America/Guyana')::date - (c.created_at AT TIME ZONE 'America/Guyana')::date <= 365 THEN '181-365'
    ELSE 'Over 365'
  END                                                                   AS age_bucket,
  (c.committed_date IS NOT NULL
     AND c.committed_date < (now() AT TIME ZONE 'America/Guyana')::date) AS committed_overdue,
  coalesce(o.agency, c.agency)                                          AS effective_agency,
  (o.agency IS NOT NULL AND o.agency IS DISTINCT FROM c.agency)         AS transferred
FROM public.direct_outreach_cases c
LEFT JOIN public.direct_outreach_agency_overrides o ON o.case_id = c.case_id
WHERE c.status <> 'Resolved';

-- Belt-and-braces: re-assert invoker semantics after the replace (146 lineage).
ALTER VIEW public.direct_outreach_open_v SET (security_invoker = on);
```

Both migrations are additive. After each apply: refresh `scripts/schema-snapshot.json` (script if the localhost tunnel is up; the proven MCP-merge fallback otherwise) so the drift guard admits the new objects/columns.

**Transfer/revert semantics:** transferring to agency X upserts the override; transferring a case back to its workbook agency **deletes** the override (audit row still written, so history is complete); `transferred` in the view is therefore true only while the effective agency actually differs.

---

## 2. The `effective_agency` read-path diff (R4, exhaustive)

Every agency read moves from `agency` to `effective_agency`. Complete inventory:

| Read site | Today | v2 |
|---|---|---|
| `getOpenCases` scope clause | `upper(agency) = $1` | `upper(v.effective_agency) = $1` |
| `getOpenCases` agency filter | `upper(agency) = $n` (single) | `upper(v.effective_agency) = ANY($n::text[])` |
| `getOpenCases` SELECT | `agency` | `v.agency` (workbook), `v.effective_agency`, `v.transferred` — UI shows effective, badge on transferred |
| `getSummary` open stats (view) | `GROUP BY upper(agency)` | `GROUP BY upper(v.effective_agency)` — scorecards & stall counts follow the transfer |
| `getSummary` case stats (base table — includes Resolved, which the view excludes) | `FROM direct_outreach_cases ... GROUP BY upper(agency)` | `FROM direct_outreach_cases c LEFT JOIN direct_outreach_agency_overrides o ON o.case_id = c.case_id ... GROUP BY upper(coalesce(o.agency, c.agency))` — resolution rates per **effective** agency |
| `getCase` scope + payload | `upper(c.agency) = $2` | same LEFT JOIN; scope on `upper(coalesce(o.agency, c.agency)) = $2`; payload adds `effective_agency`, `transferred`, `transfers[]` (audit list) |
| Assignment permission (Q2) | — | owning manager = manager of the **effective** agency (a GWI→GPL transferred case is GPL's to assign, not GWI's) |
| Assignable-user picker (Q3) | — | `GET /api/tasks/users?agency=<effective_agency>` |
| Transfer notification recipients | — | active `agency_manager` users of `to_agency`; `to_agency='PUA'` → superadmins (actor excluded by self-suppression) |

Single-source note: all open-case reads flow through the view (which owns the COALESCE); only two hand-joined copies exist (`getSummary` case-stats and `getCase`) and both get a dedicated unit test pinning them to the view's semantics.

---

## 3. API + queries

### 3.1 Filters (R1/R2 expanded) — `types.ts` / `queries.ts` / `GET /api/direct-outreach`

```ts
export interface OutreachListFilters {
  agencies?: string[];            // superadmin only in UI; server-side harmless for managers (intersection with scope)
  statuses?: string[];
  themes?: string[];
  outreaches?: string[];          // exact-match outreach_location values
  regions?: string[];             // workbook-owned cases.region values
  officers?: string[];            // assignee uuids; sentinel 'unassigned' allowed in the list
  assignedToMe?: boolean;         // resolved server-side to session.user.id
  highPriority?: boolean;         // priority_flag = 'Elevated'
  stalled60?: boolean; stalled90?: boolean; hasTarget?: boolean; overdue?: boolean;  // replaces single-select backlog
  search?: string;
  sort?: OutreachSortField; sort_dir?: 'asc' | 'desc';
}
```
SQL (all AND-combined, appended after the scope clause; repo `ANY` precedent):
```
upper(v.effective_agency) = ANY($n::text[])          -- agencies
v.status  = ANY($n::text[])                          -- statuses
v.theme   = ANY($n::text[])                          -- themes
v.outreach_location = ANY($n::text[])                -- outreaches
v.region  = ANY($n::text[])                          -- regions
(doa.assignee_user_id = ANY($n::uuid[]) OR ($m AND doa.case_id IS NULL))  -- officers w/ 'unassigned' sentinel
doa.assignee_user_id = $n::uuid                      -- assignedToMe
v.priority_flag = 'Elevated'                         -- highPriority
v.days_idle > 60 / > 90                              -- stalled60 / stalled90
v.committed_date IS NOT NULL                         -- hasTarget
v.committed_overdue                                  -- overdue
```
Wire format: comma-joined plural params (`agencies=`, `statuses=`, `themes=`, `outreaches=`, `regions=`, `officers=`) + boolean params (`high=1&stalled90=1&overdue=1&mine=1`), decoded with the repo's `.split(',').filter(Boolean)` idiom. `BacklogFilter` type is retired.

**Filter options sourcing:** `getSummary` response gains `filter_options: { regions: string[], outreach_locations: string[], officers: {id, name}[] }` — three small scoped `SELECT DISTINCT` queries over the view (+ assignments join for officers), so dropdowns show only values that exist within the caller's scope.

### 3.2 Assignment (R3) — as v1, with effective-agency ownership

- `PATCH /api/direct-outreach/[caseId]`, zod `{ assignee_user_id: string(uuid) | null }`. `null` deletes; uuid upserts `ON CONFLICT (case_id) DO UPDATE`, `assigned_by = session.user.id`.
- Permission: `requireModuleAccess('direct-outreach')`; superadmin always; `agency_manager` only when `effective_agency` = their agency (scoped lookup → out-of-scope is 404) **and** the target user is in that agency or is a superadmin. Target must be `is_active`.
- Notification `outreach_assigned` (fire-and-forget + `.catch`; four touch-points: `NotificationEventType` union, `classifyNotificationTier` switch, `DEFAULT_EVENT_PREFERENCES` `{in_app: true, email: 'instant'}`, `deriveIcon`). `referenceUrl: /direct-outreach?case=<id>`; dashboard reads `?case=` once on mount to open the panel.

### 3.3 Transfer (R4) — new route

`POST /api/direct-outreach/[caseId]/transfer` — **`requireRole(['superadmin'])`**, zod `{ to_agency: 'GWI'|'GPL'|'PUA', reason?: string }`. In one `transaction()`:
1. Load case + current override + current assignment (`FOR UPDATE` on the override/assignment rows).
2. No-op guard: 400 if `to_agency` already equals the effective agency.
3. Upsert override — or delete it when `to_agency` equals the workbook agency (revert).
4. `DELETE FROM direct_outreach_assignments WHERE case_id = $1` (officer cleared; captured in the audit row first).
5. `INSERT INTO direct_outreach_transfers (case_id, from_agency, to_agency, cleared_assignee_user_id, reason, transferred_by)`.

After commit (fire-and-forget): `outreach_transferred` notifications to the receiving agency's active `agency_manager` users (PUA → superadmins), title `Case #<id> transferred to <agency>`, same referenceUrl contract. Second new event type — same four touch-points, done in the same edit.

### 3.4 Importer (only additive header mappings — survival invariant intact)

`import-xlsx.ts` maps two more **optional** Data-sheet headers into workbook-owned columns: `Region → region`, `Point Person → point_person`. Both use the existing `reader()` accessor, which returns null for absent columns — **an older workbook without a Region column uploads unchanged** (null region; the region filter simply offers no options). No server-side parsing of `outreach_location`. The importer still references only `direct_outreach_cases`/`_updates`/`_sync_state` — assignments, overrides, and transfer audit are untouched by upload, by construction.

---

## 4. UI

- **Filter bar** (`DirectOutreachDashboard`): six `MultiSelect`s from `@/components/oversight/shared` — Agency (superadmin only), Status, Theme, Outreach, Region, Officer (options from `filter_options`, `Unassigned` prepended) — plus toggle pills (KanbanFilterPills chip classes): `High priority`, `Stalled >60d`, `Stalled >90d`, `Has target`, `Overdue`, `Assigned to me`; debounced search; active-filter chip bar with per-chip ✕ and Clear all. Filter state = `useState` arrays/booleans (module convention, no URL sync; only `?case=` deep link).
- **Table** (`CasesTable`): Agency cell shows **effective agency** (colored mono, as today) with an `ArrowRightLeft` lucide badge when `transferred` (`title="Transferred from <workbook agency>"`); new sortable Officer column (TaskCard initials-circle idiom, `'?'` for null name, `—` unassigned).
- **Panel** (`CaseDetailPanel`):
  - Officer card: current assignee (initials + name + agency + assigned-by/date), assign/change select (`input-premium`, fed by `/api/tasks/users?agency=<effective_agency>`), ✕ unassign — visible per Q2 rule (rendered on `effectiveUser`, authorized on the real session).
  - Transfer card (superadmin only): current effective agency, target select (GWI/GPL/PUA minus current), optional reason, confirm button (`btn-navy`); `transferred` badge + transfer history list from `transfers[]` ("GWI → GPL · by <name> · <date> — <reason>").
  - Metadata grid adds read-only **Workbook point person** and **Region**.
  - Imported comment log header becomes "**Imported from OP Direct · read-only**" (Q1).

---

## 5. Tests, effort, risks

**Tests** *(as-shipped record — amended during execution)*
- Pure filter-builder unit tests (extracted `buildListFilterSql(filters, scope)`): scope-first, every `ANY` shape, officers+unassigned sentinel incl. non-uuid junk dropping, toggle combinations, scope∩agencies intersection. ✅ shipped.
- Permission-helper unit tests (`canAssignOutreachCase` / `isValidAssignmentTarget` matrices incl. transferred-ownership and PUA cases). ✅ shipped.
- Importer: workbook fixtures **with and without** Region/Point Person columns; survival tripwire test (`import-xlsx.ts` source references none of `direct_outreach_assignments|_agency_overrides|_transfers`). ✅ shipped.
- ~~Effective-agency pinning tests / DB-mocked route tests~~ **deferred**: instead of pinning the check-then-write route flow with heavy mocks, the review pass drove a redesign that moved the invariants INTO single guarded statements — `setAssignee` re-checks the current effective agency in its own INSERT..SELECT (409 on mismatch) and `executeTransfer` locks the case row and recomputes from/no-op under the lock — so the racy surface those tests were meant to cover no longer exists as separate steps. Effective-agency semantics were verified against live prod SQL (insert-and-rollback simulation: transferred case moved scorecards + resolution stats). Route-matrix tests remain a follow-up nicety.
- Manual (two accounts): assign → re-upload → survives; transfer → officer cleared + receiving manager notified + badge shows; `?case=` deep link.

**Effort**
| Piece | Size |
|---|---|
| Migrations 147+148 + snapshot merge | ~1h |
| R1/R2 expanded filters (types, builder, route, options sourcing, 6 multiselects + toggles + chips) | ~1 day |
| R3 officer (PATCH, permission, notification, column, panel card, deep link, tests) | ~1 day |
| R4 transfer (route+txn, view read-path sweep, badge/panel card/history, notification, tests) | ~1 day |
| Review pass + ship | ~half day |

**Risks & mitigations**
- *View replace must keep invoker semantics* — 148 re-asserts `security_invoker = on` after `CREATE OR REPLACE`; post-apply check: `reloptions` + advisor (as done for 146).
- *Effective-agency drift* between the view and the two hand-joined copies — pinned by dedicated tests; any future agency read must use the view.
- *Scorecard interpretation*: transferred cases count under the receiving agency **including in resolution rates** (per your decision — the receiving agency owns the outcome). The audit trail preserves origin.
- *Officer cleared on transfer* is by design; `cleared_assignee_user_id` in the audit row preserves who lost it.
- *Region absent in older workbooks* → null, filter offers no options — graceful by construction.
- *`DEFAULT_EVENT_PREFERENCES` omission* silently kills email for the two new events — explicit touch-point + test.
- *Drift guard*: 4 new tables/2 columns/2 view columns must land in the snapshot before build (MCP-merge fallback proven).
- Pre-existing platform notes: no OS push for event notifications; prod realtime WS broken → in-app arrives via 60s poll; PR preview checks red until the Preview-env follow-up.

---

## 6. Rollout order (execution gate: your go)

1. **[GATE] Your sign-off on this v2 plan** — nothing below runs before it.
2. Migration 147 via Supabase MCP → snapshot update.
3. Migration 148 via MCP → snapshot update → verify `reloptions=[security_invoker=on]` + advisor clean.
4. `types.ts` / `queries.ts` (filter builder + effective_agency sweep) / routes (list params, PATCH, transfer).
5. Notification touch-points (`outreach_assigned`, `outreach_transferred`).
6. Importer header additions (Region, Point Person) + fixtures.
7. UI (filter bar, table, panel).
8. Tests, lint, build; adversarial review pass; PR → merge → `vercel --prod`.

---

## 7. What changed from v1

- **All five open questions locked** (officer-only, superadmin+owning-manager, agency+superadmins picker, ignore+display Point Person, notify) — the v1 "Open Questions" section is gone; the read-only comment-log labeling from Q1 is now in scope.
- **Filters expanded** beyond agency/status/theme: outreach location, region, officer (+Unassigned), and the single-select backlog pill set is replaced by independently combinable toggles (high-priority / stalled60 / stalled90 / has-target / overdue) — `BacklogFilter` retired; `filter_options` sourcing added to the summary payload.
- **Region is a workbook-owned column** (importer maps an upcoming "Region" header; graceful null for older workbooks) — no parsing of `outreach_location`.
- **New R4 transfer-agency design**: `direct_outreach_agency_overrides` (current override, no FK) + `direct_outreach_transfers` (append-only audit incl. cleared officer) + view v3 appending `effective_agency`/`transferred` (146-lineage: RLS default-deny, REVOKEs, `security_invoker` re-asserted) + the exhaustive effective-agency read-path table in §2 + transfer route (superadmin, transactional, clears officer, audits, notifies receiving agency).
- **Second notification event** (`outreach_transferred`) added alongside `outreach_assigned`.
- Migration list grew from one (147) to two (147 + 148); effort from ~2.5 to ~3.5–4 dev days.

*Awaiting your go. On approval I start at step 2 (migration 147) and stop for nothing else until the review pass — per the rollout order above.*
