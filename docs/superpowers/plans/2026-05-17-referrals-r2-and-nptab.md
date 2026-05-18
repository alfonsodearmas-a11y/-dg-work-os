# Referrals Round 2 + NPTAB Procurement Performance Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four coordinated changes in one ship: (1) fix sidebar gating that shows minister-only items to DG and vice versa, plus fix `/minister/referrals` 404→403 for wrong role; (2) add `task` to the `referral_source_type` enum (migration 118); (3) expand referral entry points beyond tenders (New Referral button on `/referrals`, plus Refer to Minister on delayed projects and tasks); (4) build the NPTAB Procurement Performance Report feature (queue + quarterly aggregated report) replacing the "Coming soon" stub.

**Architecture:** All four changes ride on one feature branch and merge to `main` in one PR. Sidebar fix adds a narrow `requireRole?: Role[]` filter on top of `canAccess(moduleSlug)` (the existing ministry-bypass behavior is preserved for every other module). Referral entry-point expansion reuses the existing `SlidePanel` + `EscalateModal` + `ReferralForm` primitives — no new modal infrastructure. NPTAB is a sibling feature to referrals: three new tables (`nptab_report_queue`, `nptab_reports`, `nptab_report_audit_log`), a Postgres sequence for `MPUA-NPTAB-YYYY-NNNN`, reference numbers allocated at Mark Submitted (not at draft creation), PDF rendered via the same `@react-pdf/renderer` + Inter pattern as `lib/pdf/referral-render.tsx`, with one `/nptab-reports` queue + list page and a `/nptab-reports/[id]` detail page.

**Tech Stack:** Next.js 16 App Router, Supabase (`supabaseAdmin`), `@react-pdf/renderer` v4.5.1, NextAuth v5, Tailwind v4, Vitest. No new dependencies.

---

## Confirmed pre-flight findings

These were verified against the codebase before writing the plan.

1. **Existing sidebar component:** `components/layout/Sidebar.tsx`. Module access lives in `lib/modules/access.ts`. Existing primitives: `mainNavItems` array of `{ href, label, icon, moduleSlug }`; filter is `mainNavItems.filter(item => canAccess(item.moduleSlug))`; `canAccess` is the `useModuleAccess` hook backed by `getUserModules` on the server.
2. **Root cause of the gating bug:** `lib/modules/access.ts:53-60` says "Ministry roles see everything active" and returns every `is_active = true` module slug. That bypass ignores per-module `default_roles`. Result: DG sees both `ministerial-referrals` and `minister-referrals`; Minister sees both as well.
3. **Existing modal primitive:** `components/layout/SlidePanel.tsx` — a right-side slide panel. **Already portaled to `document.body`** in the previous fix (PR #7, commit `32f0234`). shadcn/ui is NOT installed (`components/ui/` contains custom primitives only, no `Dialog.tsx`). Reuse SlidePanel.
4. **EscalateModal status:** Renders correctly in production after PR #7. No re-fix needed; this plan only adds the NPTAB confirmation view inside the same SlidePanel and replaces the "Coming soon" stub.
5. **Migration paths:** Migrations live in `supabase/migrations/` and apply via `node scripts/run-migrations.mjs <n1> <n2> ...`. Latest applied = 117. New migrations: `118_referrals_source_type_add_task.sql`, `119_nptab_reports.sql`.
6. **Reference number allocation timing for NPTAB:** at **Mark Submitted** only (confirms spec). Drafts never burn a sequence value. Format `MPUA-NPTAB-YYYY-NNNN` with Guyana-local year via `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana', year: 'numeric' })`. Mirror `lib/referrals/reference-number.ts`.
7. **Pre-fill data sources:**
   - **Tender:** `tender` table (columns: `id`, `agency`, `description`, `stage`, `date_advertised`, `date_closed`, `contractor`). Already wired by `lib/referrals/pre-fill.ts:composeTenderPreFill`.
   - **Project:** `projects` table (`project_id`, `sub_agency`, `project_name`, `contract_value`, `contractor`, `project_end_date`, `completion_pct`). Already wired by `composeProjectPreFill`.
   - **Task:** `tasks` table (`id` UUID, `title`, `description`, `status`, `priority`, `due_date`, `agency`, `owner_user_id`, `created_at`). Schema in `supabase/migrations/022_tasks.sql`. New composer needed: `composeTaskPreFill`.
   - **Agency issue:** No dedicated `agency_issues` table exists — `IssuesByAgencyCard` is just a histogram of `TodaySignal[]` grouped by agency. **There are no agency-issue records to click into.** See open question 1 below; current plan exposes `agency_issue` only via the `/referrals` "New Referral" form's source-type dropdown, not via any per-record button.
8. **`/minister/referrals` 404 behavior:** `app/minister/referrals/page.tsx:10-11` and `[id]/page.tsx:18-19` both call `notFound()` when `requireRole(['minister'])` returns a `NextResponse` — collapsing both auth-failure (redirect to /login) and role-failure (403) into a 404. The fix: branch on the returned response status. If 403, render a small Forbidden component; if redirect, let it through.

## Open questions for you before implementation

1. **Agency issue entry point.** No `agency_issues` table or per-record card exists. `IssuesByAgencyCard` aggregates `TodaySignal` rows; the underlying signals are already attached to tender_sla / delayed_project records, so wiring "Refer to Minister" there would duplicate the existing tender + project entry points. **Recommended:** skip the agency-issue per-record entry point. Keep `agency_issue` reachable only via the New Referral form's source-type dropdown, where the DG can hand-enter a policy issue, complaint, Cabinet directive, or media issue without a backing record. Confirm or override.
2. **`dashboard.mpua.gov.gy` alias.** Still bound to production deploys at the Vercel project level. Per your memory the prod alias should be `dg-work-os.vercel.app` only. Not blocking this work, but flagging again so you can detach it at the project level when ready.

---

## File Structure

### New files

```
supabase/migrations/
  118_referrals_source_type_add_task.sql           # ALTER TYPE referral_source_type ADD VALUE 'task'
  119_nptab_reports.sql                            # 3 tables + sequence + RLS + module seed bump

lib/nptab/
  types.ts                                         # NPTABReport, NPTABQueueRow, NPTABAuditEntry, status/method enums + labels
  reference-number.ts                              # formatNptabReferenceNumber, allocateNptabReferenceNumber (Guyana TZ, at submit)
  queries.ts                                       # CRUD + queue ops + aggregations + snapshot logic
  audit.ts                                         # writeNptabAuditEntries, writeNptabAuditEntriesTx
  period.ts                                        # quarterOf(date), nextQuarterEnd(now), periodLabel(start,end), periodToDates(year, quarter)
  aggregate.ts                                     # buildAggregates(tenders): byAgency, byValueBracket, byContractor

lib/pdf/
  nptab-report-render.tsx                          # A4 letterhead, Inter, sections per spec

app/api/nptab-reports/
  route.ts                                         # GET list, POST create draft from queue snapshot
  [id]/route.ts                                    # GET single + audit, PATCH narrative/close/manual override
  [id]/pdf/route.ts                                # GET on-demand PDF
  [id]/submit/route.ts                             # POST mark submitted (allocates ref number, renders PDF)
  [id]/tenders/route.ts                            # POST add tender to report (drafted), DELETE remove tender
  queue/route.ts                                   # GET active queue, POST queue tender, DELETE dequeue tender

app/nptab-reports/
  page.tsx                                         # Server page: queue table + past reports list
  [id]/page.tsx                                    # Server page: full report detail
  _components/
    QueueSection.tsx                               # Client: queue rows + remove + generate-draft action
    NptabReportsList.tsx                           # Client: past reports table
    NptabReportDetailClient.tsx                    # Client: narrative editor, mark submitted, close, add/remove tender
    AggregateBlocks.tsx                            # Pure rendering of byAgency / byValueBracket / byContractor

components/nptab/
  NptabQueueButton.tsx                             # Used inside the EscalateModal NPTAB branch — confirmation panel + submit
  NptabSourceBanner.tsx                            # Tender card banner: "Queued for NPTAB ..." / "Reported to NPTAB ..."

components/referrals/
  NewReferralButton.tsx                            # Client button on /referrals list — opens EscalateModal with empty pre-fill

tests/unit/nptab/
  reference-number.test.ts
  period.test.ts
  aggregate.test.ts
```

### Modified files

```
components/layout/Sidebar.tsx                      # Add requireRole? to nav-item type + filter; add NPTAB Reports entry
components/today/EscalateModal.tsx                 # Replace NPTAB "Coming soon" with NptabQueueButton confirmation view
components/today/ReferralForm.tsx                  # Add source_type dropdown + agency text input when sourceId is null
components/procurement/ProcurementCard.tsx         # Render NptabSourceBanner alongside ReferralSourceBanner
components/procurement/ProcurementDetailPanel.tsx  # Same
components/delayed-projects/ProjectDetailPanel.tsx # Add "Refer to Minister" action button in panel header
components/delayed-projects/RegistryTable.tsx      # Per-row action menu adds "Refer to Minister"
components/tasks/TaskDetailPanel.tsx               # Add "Refer to Minister" action in panel header
components/tasks/TaskCard.tsx                      # Add "Refer to Minister" item in TaskContextMenu (right-click)

app/referrals/page.tsx                             # Render NewReferralButton in the page header
app/referrals/_components/ReferralsTable.tsx       # No change to body; new button is sibling of the header

app/minister/referrals/page.tsx                    # 404 -> 403 for wrong role; pass through redirect for unauth
app/minister/referrals/[id]/page.tsx               # Same

components/layout/Forbidden.tsx                    # NEW shared Forbidden render used by the two minister pages

lib/referrals/pre-fill.ts                          # Add composeTaskPreFill + extend resolvePreFill to handle 'task'
lib/referrals/types.ts                             # Update REFERRAL_SOURCE_TYPES const to include 'task' (matches the SQL enum after migration 118)

lib/tender/queries.ts                              # Extend Tender enrichment to also attach activeNptabQueueRow / latestNptabReport
lib/tender/types.ts                                # Add optional fields on Tender for nptab status
```

---

## SQL Schema Reference

### Migration 118 — `referral_source_type` enum extension

```sql
-- 118_referrals_source_type_add_task.sql
ALTER TYPE referral_source_type ADD VALUE IF NOT EXISTS 'task';
```

Note: `ALTER TYPE ... ADD VALUE` cannot run inside a transaction in older Postgres versions, but Supabase / PG 14+ supports it transactionally. `scripts/run-migrations.mjs` wraps each file in `BEGIN/COMMIT` so this works.

### Migration 119 — NPTAB Reports

```sql
-- 119_nptab_reports.sql

-- ── Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE nptab_report_status AS ENUM ('drafted', 'submitted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE nptab_delivery_method AS ENUM ('email', 'hand_delivered', 'in_meeting', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sequence ──────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS nptab_report_ref_seq START 1;

-- ── nptab_reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status           nptab_report_status NOT NULL DEFAULT 'drafted',
  submitted_at     TIMESTAMPTZ,
  delivery_method  nptab_delivery_method,
  delivered_to     TEXT,
  narrative        TEXT NOT NULL DEFAULT '',
  tender_count     INTEGER NOT NULL DEFAULT 0,
  total_value      NUMERIC,
  closed_at        TIMESTAMPTZ,
  closure_reason   TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_em_dash_narrative      CHECK (position(chr(8212) IN narrative) = 0),
  CONSTRAINT no_em_dash_closure_reason CHECK (closure_reason IS NULL OR position(chr(8212) IN closure_reason) = 0),
  CONSTRAINT period_valid              CHECK (period_end >= period_start)
);

-- ── nptab_report_queue ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_report_queue (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id               TEXT NOT NULL,
  queued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_by               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason                  TEXT,
  dequeued_at             TIMESTAMPTZ,
  dequeued_by             UUID REFERENCES users(id) ON DELETE RESTRICT,
  dequeue_reason          TEXT,
  included_in_report_id   UUID REFERENCES nptab_reports(id) ON DELETE SET NULL,
  CONSTRAINT no_em_dash_reason         CHECK (reason IS NULL OR position(chr(8212) IN reason) = 0),
  CONSTRAINT no_em_dash_dequeue_reason CHECK (dequeue_reason IS NULL OR position(chr(8212) IN dequeue_reason) = 0)
);

-- A tender can only sit in the active queue once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS nptab_queue_active_unique
  ON nptab_report_queue(tender_id)
  WHERE dequeued_at IS NULL AND included_in_report_id IS NULL;

CREATE INDEX IF NOT EXISTS nptab_queue_tender_idx        ON nptab_report_queue(tender_id);
CREATE INDEX IF NOT EXISTS nptab_queue_report_idx        ON nptab_report_queue(included_in_report_id);

-- ── nptab_report_audit_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_report_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID NOT NULL REFERENCES nptab_reports(id) ON DELETE CASCADE,
  changed_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nptab_audit_report_idx ON nptab_report_audit_log(report_id, timestamp DESC);

-- ── Indexes on nptab_reports ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS nptab_reports_status_idx       ON nptab_reports(status);
CREATE INDEX IF NOT EXISTS nptab_reports_submitted_at_idx ON nptab_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS nptab_reports_period_idx       ON nptab_reports(period_end DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE nptab_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nptab_report_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE nptab_report_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nptab_reports_service_role           ON nptab_reports;
DROP POLICY IF EXISTS nptab_reports_authenticated_select   ON nptab_reports;
DROP POLICY IF EXISTS nptab_queue_service_role             ON nptab_report_queue;
DROP POLICY IF EXISTS nptab_queue_authenticated_select     ON nptab_report_queue;
DROP POLICY IF EXISTS nptab_audit_service_role             ON nptab_report_audit_log;
DROP POLICY IF EXISTS nptab_audit_authenticated_select     ON nptab_report_audit_log;

CREATE POLICY nptab_reports_service_role ON nptab_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_reports_authenticated_select ON nptab_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY nptab_queue_service_role ON nptab_report_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_queue_authenticated_select ON nptab_report_queue FOR SELECT TO authenticated USING (true);

CREATE POLICY nptab_audit_service_role ON nptab_report_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_audit_authenticated_select ON nptab_report_audit_log FOR SELECT TO authenticated USING (true);

-- ── updated_at trigger (reuse project-wide helper from migration 072) ─────
DROP TRIGGER IF EXISTS set_nptab_reports_updated_at ON nptab_reports;
CREATE TRIGGER set_nptab_reports_updated_at
  BEFORE UPDATE ON nptab_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Modules table: insert nptab-reports + bump minister-referrals to 77 ───
INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES (
  'nptab-reports',
  'NPTAB Reports',
  'Procurement performance reports to NPTAB',
  'FileBarChart',
  ARRAY['dg', 'ps'],
  true,
  76
)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      icon = EXCLUDED.icon,
      default_roles = EXCLUDED.default_roles,
      is_active = EXCLUDED.is_active,
      sort_order = EXCLUDED.sort_order;

UPDATE modules SET sort_order = 77 WHERE slug = 'minister-referrals';

-- ── Documentation ─────────────────────────────────────────────────────────
COMMENT ON TABLE nptab_reports IS
  'Quarterly Procurement Performance Reports to the National Procurement and Tender Administration Board. '
  'Reference number format: MPUA-NPTAB-YYYY-NNNN, allocated at Mark Submitted (drafts never burn numbers).';

COMMENT ON COLUMN nptab_reports.reference_number IS
  'Allocated from nptab_report_ref_seq at submission time. NULL while drafted.';
```

---

# Tasks

## Phase A — Sidebar gating + Minister 403 (Change 1)

### Task 1: Sidebar `requireRole` filter

**Files:**
- Modify: `components/layout/Sidebar.tsx`

- [ ] **Step 1:** Locate the `mainNavItems` array (currently around line 82) and the filter at line ~167 `mainNavItems.filter(item => canAccess(item.moduleSlug))`.

- [ ] **Step 2:** Extend the nav-item type and tag the two referral items. Replace the array definition with:

  ```tsx
  // Above mainNavItems (around line 80), import Role type
  import type { Role } from '@/lib/auth';

  interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    moduleSlug: string;
    /**
     * Restrict visibility beyond module access. When set, the item is only
     * rendered if the user's role is in this list. Used for role-exclusive
     * items where the existing ministry-bypass in module access would
     * otherwise leak the item.
     */
    requireRole?: Role[];
  }

  const mainNavItems: NavItem[] = [
    { href: '/', label: 'Mission Control', icon: LayoutDashboard, moduleSlug: 'briefing' },
    { href: '/intel', label: 'Agency Intel', icon: Activity, moduleSlug: 'agency-intel' },
    { href: '/tasks', label: 'Tasks', icon: CheckSquare, moduleSlug: 'tasks' },
    { href: '/action-items/review', label: 'Action Items', icon: ListChecks, moduleSlug: 'action-items' },
    { href: '/procurement', label: 'Procurement', icon: ShoppingCart, moduleSlug: 'procurement' },
    { href: '/oversight', label: 'Oversight', icon: Eye, moduleSlug: 'oversight' },
    { href: '/budget', label: 'Budget 2026', icon: DollarSign, moduleSlug: 'budget' },
    { href: '/meetings', label: 'Meetings', icon: Mic, moduleSlug: 'meetings' },
    { href: '/calendar', label: 'Calendar', icon: CalendarDays, moduleSlug: 'calendar' },
    { href: '/documents', label: 'Documents', icon: FileText, moduleSlug: 'documents' },
    { href: '/referrals', label: 'Ministerial Referrals', icon: FileSignature, moduleSlug: 'ministerial-referrals', requireRole: ['dg', 'ps'] },
    { href: '/nptab-reports', label: 'NPTAB Reports', icon: FileBarChart, moduleSlug: 'nptab-reports', requireRole: ['dg', 'ps'] },
    { href: '/minister/referrals', label: 'Referrals to Minister', icon: Inbox, moduleSlug: 'minister-referrals', requireRole: ['minister'] },
  ];
  ```
  Import `FileBarChart` from `lucide-react` (add to existing import).

- [ ] **Step 3:** Update the filter (line ~167):

  ```tsx
  const filteredMainNav = mainNavItems.filter(
    (item) =>
      canAccess(item.moduleSlug) &&
      (!item.requireRole || item.requireRole.includes(userRole as Role)),
  );
  ```

- [ ] **Step 4:** Verify locally: build the app, sign in as a DG account; "Ministerial Referrals" and "NPTAB Reports" appear, "Referrals to Minister" does not. Sign in as a Minister account; only "Referrals to Minister" appears among the three.

- [ ] **Step 5:** Commit
  ```bash
  git add components/layout/Sidebar.tsx
  git commit -m "fix(sidebar): role-exclusive items via requireRole filter"
  ```

---

### Task 2: Forbidden component + minister pages 403

**Files:**
- Create: `components/layout/Forbidden.tsx`
- Modify: `app/minister/referrals/page.tsx`
- Modify: `app/minister/referrals/[id]/page.tsx`

- [ ] **Step 1:** Create the shared component:

  ```tsx
  // components/layout/Forbidden.tsx
  import Link from 'next/link';
  import { ShieldAlert } from 'lucide-react';

  interface ForbiddenProps {
    title?: string;
    detail?: string;
  }

  export function Forbidden({
    title = 'Access denied',
    detail = 'You do not have permission to view this page.',
  }: ForbiddenProps) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="card-premium p-8 max-w-md w-full text-center space-y-3">
          <ShieldAlert size={32} className="mx-auto text-red-400" />
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <p className="text-sm text-navy-400">{detail}</p>
          <Link href="/" className="btn-navy text-sm inline-block">Back to Mission Control</Link>
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2:** Update `app/minister/referrals/page.tsx`:

  ```tsx
  import { NextResponse } from 'next/server';
  import { redirect } from 'next/navigation';
  import { requireRole } from '@/lib/auth-helpers';
  import { listReferralsForMinister } from '@/lib/referrals/queries';
  import { Forbidden } from '@/components/layout/Forbidden';
  import { MinisterReferralsList } from './_components/MinisterReferralsList';

  export const dynamic = 'force-dynamic';

  export default async function MinisterReferralsPage() {
    const result = await requireRole(['minister']);
    if (result instanceof NextResponse) {
      // requireRole returns a 302 redirect for unauth and a 403 JSON for wrong role.
      if (result.status === 403) {
        return <Forbidden detail="This view is reserved for the Minister." />;
      }
      // Unauth -> let the middleware redirect work
      redirect('/login');
    }
    const referrals = await listReferralsForMinister();
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <MinisterReferralsList referrals={referrals} />
      </div>
    );
  }
  ```

- [ ] **Step 3:** Confirm `requireRole` returns 403 vs 302 distinguishably. Read `lib/auth-helpers.ts` to check the status code path. If `requireRole` doesn't differentiate, the simpler fix is: get the session first (returns null if unauth → redirect), then check role and render Forbidden if wrong:

  ```tsx
  import { auth } from '@/lib/auth';
  // ...
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'minister') {
    return <Forbidden detail="This view is reserved for the Minister." />;
  }
  ```
  Use whichever shape matches `requireRole`'s actual behavior — confirm by reading the file.

- [ ] **Step 4:** Apply the same change to `app/minister/referrals/[id]/page.tsx`:

  ```tsx
  // After: const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'minister') {
    return <Forbidden detail="This view is reserved for the Minister." />;
  }

  const referral = await getReferralById(id);
  if (!referral) notFound();           // referral doesn't exist -> genuine 404
  if (referral.status === 'drafted') notFound();
  ```

- [ ] **Step 5:** Verify in the browser: navigate as DG to `/minister/referrals` → see Forbidden card, not 404. Unauthenticated → redirect to /login.

- [ ] **Step 6:** Commit
  ```bash
  git add components/layout/Forbidden.tsx app/minister/referrals/page.tsx app/minister/referrals/[id]/page.tsx
  git commit -m "fix(minister): 403 Forbidden for wrong role instead of 404"
  ```

---

## Phase B — Migration 118: `task` source type (Change 2)

### Task 3: Migration 118

**Files:**
- Create: `supabase/migrations/118_referrals_source_type_add_task.sql`

- [ ] **Step 1:** Write the migration:

  ```sql
  -- 118_referrals_source_type_add_task.sql
  -- Extend referral_source_type to support task-sourced referrals.

  ALTER TYPE referral_source_type ADD VALUE IF NOT EXISTS 'task';
  ```

- [ ] **Step 2:** Update `lib/referrals/types.ts` to add `'task'` to the const array (the type union derives from the array, so this is one line):

  ```ts
  export const REFERRAL_SOURCE_TYPES = ['tender', 'project', 'agency_issue', 'task', 'other'] as const;
  ```

  Add the label:

  ```ts
  export const SOURCE_TYPE_LABELS: Record<ReferralSourceType, string> = {
    tender: 'Tender',
    project: 'Project',
    agency_issue: 'Agency Issue',
    task: 'Task',
    other: 'Other',
  };
  ```

- [ ] **Step 3:** Type-check: `npx tsc --noEmit` should remain clean. The validator arrays in API routes already derive from the const, so no API-route edits needed.

- [ ] **Step 4:** Commit
  ```bash
  git add supabase/migrations/118_referrals_source_type_add_task.sql lib/referrals/types.ts
  git commit -m "feat(referrals): add 'task' to referral_source_type enum"
  ```

---

## Phase C — Expanded referral entry points (Change 3)

### Task 4: ReferralForm — source-type dropdown + sourceless mode

**Files:**
- Modify: `components/today/ReferralForm.tsx`

- [ ] **Step 1:** Add a `source_type` field to the form. Currently `sourceType` is a fixed prop. Change behavior: when `sourceId === null` (i.e., the user opened "New Referral" with no pre-existing record), render a `source_type` select; otherwise the source type is locked.

  Update the prop type:
  ```ts
  interface ReferralFormProps {
    sourceType: ReferralSourceType;        // initial; user can override when sourceId is null
    sourceId: string | null;
    preFillAgency?: string | null;
    preFillTitle?: string | null;
    onSubmitted: (result: { referralId: string; referenceNumber: string | null }) => void;
    onCancel: () => void;
  }
  ```

  Add state:
  ```tsx
  const [selectedType, setSelectedType] = useState<ReferralSourceType>(sourceType);
  const isSourcelessMode = sourceId === null;
  ```

  In the form JSX, immediately above the Agency field when `isSourcelessMode === true`, render:
  ```tsx
  {isSourcelessMode && (
    <Field label="Source Type" required>
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value as ReferralSourceType)}
        className={inputCls(false)}
      >
        {(Object.entries(SOURCE_TYPE_LABELS) as [ReferralSourceType, string][]).map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </Field>
  )}
  ```

  In the POST payload, send `source_type: selectedType` (replacing the existing `source_type: sourceType`).

- [ ] **Step 2:** Default `selectedType` to `'other'` when `isSourcelessMode === true` and the parent didn't pass an explicit `sourceType`. Easiest: in the New Referral button, pass `sourceType="other"`.

- [ ] **Step 3:** Verify the form renders correctly in both modes locally. Pre-filled mode (e.g., from Most Urgent Escalate) should NOT show the source-type dropdown.

- [ ] **Step 4:** Commit
  ```bash
  git add components/today/ReferralForm.tsx
  git commit -m "feat(referrals): source-type dropdown for sourceless referrals"
  ```

---

### Task 5: NewReferralButton on `/referrals` list

**Files:**
- Create: `components/referrals/NewReferralButton.tsx`
- Modify: `app/referrals/page.tsx`

- [ ] **Step 1:** Build the client button:

  ```tsx
  // components/referrals/NewReferralButton.tsx
  'use client';

  import { useState } from 'react';
  import { Plus } from 'lucide-react';
  import { EscalateModal } from '@/components/today/EscalateModal';

  export function NewReferralButton() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-gold text-sm flex items-center gap-2"
        >
          <Plus size={14} /> New Referral
        </button>
        <EscalateModal
          isOpen={open}
          onClose={() => setOpen(false)}
          sourceType="other"
          sourceId={null}
          preFillTitle={null}
          preFillAgency={null}
        />
      </>
    );
  }
  ```

- [ ] **Step 2:** Update `app/referrals/page.tsx` to render the button in the header. The current page is a server component that renders `ReferralsTable`. Add the button alongside.

  ```tsx
  // app/referrals/page.tsx
  import { NextResponse } from 'next/server';
  import { notFound } from 'next/navigation';
  import { requireRole } from '@/lib/auth-helpers';
  import { listReferrals } from '@/lib/referrals/queries';
  import { NewReferralButton } from '@/components/referrals/NewReferralButton';
  import { ReferralsTable } from './_components/ReferralsTable';

  export const dynamic = 'force-dynamic';

  export default async function ReferralsPage() {
    const result = await requireRole(['dg', 'ps']);
    if (result instanceof NextResponse) notFound();
    const { session } = result;
    const referrals = await listReferrals({});
    const isDG = session.user.role === 'dg';

    return (
      <div className="p-6 max-w-7xl mx-auto space-y-4">
        {isDG && (
          <div className="flex justify-end">
            <NewReferralButton />
          </div>
        )}
        <ReferralsTable initial={referrals} canEdit={isDG} />
      </div>
    );
  }
  ```

- [ ] **Step 3:** Verify in the browser: as DG, the New Referral button appears top-right of `/referrals`. Clicking it opens the EscalateModal with source-type dropdown visible.

- [ ] **Step 4:** Commit
  ```bash
  git add components/referrals/NewReferralButton.tsx app/referrals/page.tsx
  git commit -m "feat(referrals): New Referral button on list view (sourceless flow)"
  ```

---

### Task 6: composeTaskPreFill + extend resolvePreFill

**Files:**
- Modify: `lib/referrals/pre-fill.ts`

- [ ] **Step 1:** Add the task composer and extend the resolver. After `composeProjectPreFill`, add:

  ```ts
  export interface TaskShape {
    id: string;
    title: string;
    description: string | null;
    status: string;            // 'not_started' | 'in_progress' | 'completed' | 'blocked'
    priority: string | null;
    due_date: string | null;
    agency: string | null;
    created_at: string;
    assignee_name: string | null;
  }

  const TASK_STATUS_LABEL: Record<string, string> = {
    not_started: 'not started',
    in_progress: 'in progress',
    completed: 'completed',
    blocked: 'blocked',
  };

  export function composeTaskPreFill(t: TaskShape, _now: Date): ReferralPreFill {
    const statusLabel = TASK_STATUS_LABEL[t.status] ?? t.status;
    const createdDate = fmtGuyanaDate(t.created_at);
    const assignee = t.assignee_name ?? 'unassigned';
    const description = (t.description && t.description.trim().length > 0) ? t.description : t.title;
    const background = stripEmDash(description);
    const currentStatus = stripEmDash(
      `Task assigned ${createdDate}. Status: ${statusLabel}. Assignee: ${assignee}.`,
    );
    return {
      agency: (t.agency ?? '').toUpperCase(),
      title: stripEmDash(t.title),
      days_overdue: t.due_date ? daysSinceISO(t.due_date, _now) : null,
      contract_value: null,
      background,
      current_status: currentStatus,
    };
  }
  ```

- [ ] **Step 2:** Extend `resolvePreFill` to handle the task source:

  ```ts
  if (sourceType === 'task') {
    const { data } = await supabaseAdmin
      .from('tasks')
      .select('id, title, description, status, priority, due_date, agency, created_at, owner:owner_user_id ( name )')
      .eq('id', sourceId)
      .single();
    if (!data) return null;
    const owner = (data as { owner: { name: string | null } | null }).owner;
    return composeTaskPreFill(
      {
        id: data.id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        due_date: data.due_date,
        agency: data.agency,
        created_at: data.created_at,
        assignee_name: owner?.name ?? null,
      },
      now,
    );
  }
  ```

- [ ] **Step 3:** Write a small unit test in `tests/unit/referrals/pre-fill.test.ts`:

  ```ts
  describe('composeTaskPreFill', () => {
    it('uppercases agency, embeds status and assignee, computes days_overdue from due_date', () => {
      const t = {
        id: 't-1', title: 'Sign decision memo', description: null,
        status: 'in_progress', priority: 'high', due_date: '2026-04-01',
        agency: 'gpl', created_at: '2026-03-15T00:00:00Z',
        assignee_name: 'Keisha Crighton',
      };
      const out = composeTaskPreFill(t, new Date('2026-05-17'));
      expect(out.agency).toBe('GPL');
      expect(out.title).toBe('Sign decision memo');
      expect(out.background).toBe('Sign decision memo');
      expect(out.current_status).toContain('in progress');
      expect(out.current_status).toContain('Keisha Crighton');
      expect(out.days_overdue).toBeGreaterThan(0);
    });
  });
  ```

- [ ] **Step 4:** Run: `npx vitest run tests/unit/referrals/pre-fill.test.ts` — must pass.

- [ ] **Step 5:** Commit
  ```bash
  git add lib/referrals/pre-fill.ts tests/unit/referrals/pre-fill.test.ts
  git commit -m "feat(referrals): task source pre-fill composer"
  ```

---

### Task 7: Refer to Minister on delayed project — RegistryTable + ProjectDetailPanel

**Files:**
- Modify: `components/delayed-projects/RegistryTable.tsx`
- Modify: `components/delayed-projects/ProjectDetailPanel.tsx`

- [ ] **Step 1:** RegistryTable. Find each row's action area (likely a dropdown menu or trailing buttons). Add a "Refer to Minister" item that opens an `EscalateModal` with the project pre-fill. Since RegistryTable may render many rows, lift the modal state to the parent and open via a callback (avoid one modal per row).

  ```tsx
  // In the table parent (top of RegistryTable.tsx component):
  const [escalateProject, setEscalateProject] = useState<{ id: string; name: string; agency: string } | null>(null);

  // ... inside row render, add a menu/button:
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); setEscalateProject({ id: row.project_id, name: row.project_name ?? row.project_id, agency: (row.sub_agency ?? '').toUpperCase() }); }}
    className="text-xs text-gold-400 hover:text-gold-300"
  >
    Refer to Minister
  </button>

  // ... after the table:
  {escalateProject && (
    <EscalateModal
      isOpen={true}
      onClose={() => setEscalateProject(null)}
      sourceType="project"
      sourceId={escalateProject.id}
      preFillTitle={escalateProject.name}
      preFillAgency={escalateProject.agency}
    />
  )}
  ```
  Use the existing action-menu pattern in this file (read it first; many delayed-projects rows already have an actions column — colocate the new item there).

- [ ] **Step 2:** ProjectDetailPanel. Add a top-right "Refer to Minister" button in the panel header. Similar wiring — open the modal with the panel's project as the source.

- [ ] **Step 3:** Visually verify both surfaces work end-to-end: click → modal opens with pre-filled project agency/title/background/current_status.

- [ ] **Step 4:** Commit
  ```bash
  git add components/delayed-projects/RegistryTable.tsx components/delayed-projects/ProjectDetailPanel.tsx
  git commit -m "feat(referrals): Refer to Minister action on delayed projects"
  ```

---

### Task 8: Refer to Minister on tasks — TaskDetailPanel + TaskContextMenu

**Files:**
- Modify: `components/tasks/TaskDetailPanel.tsx`
- Modify: `components/tasks/TaskCard.tsx`

- [ ] **Step 1:** Read `components/tasks/TaskContextMenu.tsx` to find the context-menu item shape; add a new entry "Refer to Minister" that fires a parent callback. Wire `TaskCard` and `TaskDetailPanel` to receive the callback and open `EscalateModal` with `sourceType="task"`, `sourceId={task.id}`, `preFillTitle={task.title}`, `preFillAgency={task.agency?.toUpperCase() ?? null}`. The form fetches the rest via `/api/referrals/pre-fill?source_type=task&source_id=…`.

- [ ] **Step 2:** Verify: open a task via Mission Control task card right-click, choose Refer to Minister, modal opens with task pre-fill (status, assignee, created-on).

- [ ] **Step 3:** Commit
  ```bash
  git add components/tasks/TaskDetailPanel.tsx components/tasks/TaskCard.tsx components/tasks/TaskContextMenu.tsx
  git commit -m "feat(referrals): Refer to Minister action on tasks"
  ```

---

## Phase D — NPTAB Reports (Change 4)

### Task 9: Migration 119

**Files:**
- Create: `supabase/migrations/119_nptab_reports.sql`

- [ ] **Step 1:** Write the migration with the full DDL from the **Migration 119** SQL block at the top of this plan.

- [ ] **Step 2:** Commit
  ```bash
  git add supabase/migrations/119_nptab_reports.sql
  git commit -m "feat(nptab): tables, sequence, RLS, module seed"
  ```

---

### Task 10: lib/nptab/types.ts + period.ts + tests

**Files:**
- Create: `lib/nptab/types.ts`
- Create: `lib/nptab/period.ts`
- Create: `tests/unit/nptab/period.test.ts`

- [ ] **Step 1:** Types module:

  ```ts
  // lib/nptab/types.ts
  export const NPTAB_REPORT_STATUSES = ['drafted', 'submitted', 'closed'] as const;
  export const NPTAB_DELIVERY_METHODS = ['email', 'hand_delivered', 'in_meeting', 'other'] as const;

  export type NptabReportStatus = (typeof NPTAB_REPORT_STATUSES)[number];
  export type NptabDeliveryMethod = (typeof NPTAB_DELIVERY_METHODS)[number];

  export interface NptabReport {
    id: string;
    reference_number: string | null;
    period_start: string;
    period_end: string;
    generated_at: string;
    generated_by: string;
    status: NptabReportStatus;
    submitted_at: string | null;
    delivery_method: NptabDeliveryMethod | null;
    delivered_to: string | null;
    narrative: string;
    tender_count: number;
    total_value: number | null;
    closed_at: string | null;
    closure_reason: string | null;
    updated_at: string;
  }

  export interface NptabQueueRow {
    id: string;
    tender_id: string;
    queued_at: string;
    queued_by: string;
    reason: string | null;
    dequeued_at: string | null;
    dequeued_by: string | null;
    dequeue_reason: string | null;
    included_in_report_id: string | null;
  }

  export interface NptabAuditEntry {
    id: string;
    report_id: string;
    changed_by: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
    timestamp: string;
  }

  export interface NptabReportTenderSnapshot {
    tender_id: string;
    title: string;
    agency: string;
    contract_value: number | null;
    days_past_sla: number | null;
    contractor: string | null;
    status: string;
  }

  export const NPTAB_STATUS_LABELS: Record<NptabReportStatus, string> = {
    drafted: 'Drafted',
    submitted: 'Submitted',
    closed: 'Closed',
  };

  export const NPTAB_DELIVERY_LABELS: Record<NptabDeliveryMethod, string> = {
    email: 'Email',
    hand_delivered: 'Hand Delivered',
    in_meeting: 'In Meeting',
    other: 'Other',
  };
  ```

- [ ] **Step 2:** Period helpers:

  ```ts
  // lib/nptab/period.ts
  // Quarter math in Guyana local time (UTC-4, no DST).

  export type Quarter = 1 | 2 | 3 | 4;

  function guyanaParts(d: Date): { year: number; month: number; day: number } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guyana',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  }

  export function quarterOf(d: Date): { year: number; quarter: Quarter } {
    const { year, month } = guyanaParts(d);
    const q = (Math.ceil(month / 3) as Quarter);
    return { year, quarter: q };
  }

  export function periodToDates(year: number, quarter: Quarter): { start: string; end: string } {
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const start = `${year}-${String(startMonth).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
    const end = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
  }

  export function nextQuarterEnd(now: Date): { year: number; quarter: Quarter; start: string; end: string } {
    const { year, quarter } = quarterOf(now);
    return { year, quarter, ...periodToDates(year, quarter) };
  }

  export function periodLabel(start: string, end: string): string {
    const startYear = Number(start.slice(0, 4));
    const startMonth = Number(start.slice(5, 7));
    const q = Math.ceil(startMonth / 3) as Quarter;
    const endYear = Number(end.slice(0, 4));
    return startYear === endYear ? `Q${q} ${startYear}` : `${start} to ${end}`;
  }
  ```

- [ ] **Step 3:** Tests:

  ```ts
  // tests/unit/nptab/period.test.ts
  import { describe, it, expect } from 'vitest';
  import { quarterOf, periodToDates, periodLabel, nextQuarterEnd } from '@/lib/nptab/period';

  describe('quarterOf', () => {
    it('maps Jan -> Q1, Apr -> Q2, Jul -> Q3, Oct -> Q4 (Guyana TZ)', () => {
      expect(quarterOf(new Date('2026-01-15T12:00:00Z')).quarter).toBe(1);
      expect(quarterOf(new Date('2026-04-15T12:00:00Z')).quarter).toBe(2);
      expect(quarterOf(new Date('2026-07-15T12:00:00Z')).quarter).toBe(3);
      expect(quarterOf(new Date('2026-10-15T12:00:00Z')).quarter).toBe(4);
    });
    it('respects Guyana TZ at year boundary', () => {
      // 2027-01-01T03:30:00Z = 23:30 31 Dec 2026 in Guyana
      expect(quarterOf(new Date('2027-01-01T03:30:00Z')).year).toBe(2026);
      expect(quarterOf(new Date('2027-01-01T03:30:00Z')).quarter).toBe(4);
    });
  });

  describe('periodToDates', () => {
    it('returns correct boundaries per quarter', () => {
      expect(periodToDates(2026, 1)).toEqual({ start: '2026-01-01', end: '2026-03-31' });
      expect(periodToDates(2026, 2)).toEqual({ start: '2026-04-01', end: '2026-06-30' });
      expect(periodToDates(2026, 3)).toEqual({ start: '2026-07-01', end: '2026-09-30' });
      expect(periodToDates(2026, 4)).toEqual({ start: '2026-10-01', end: '2026-12-31' });
    });
  });

  describe('periodLabel', () => {
    it('formats single-year quarters as Q? YYYY', () => {
      expect(periodLabel('2026-04-01', '2026-06-30')).toBe('Q2 2026');
    });
    it('falls back to date range for cross-year', () => {
      expect(periodLabel('2026-11-01', '2027-02-01')).toBe('2026-11-01 to 2027-02-01');
    });
  });

  describe('nextQuarterEnd', () => {
    it('returns the current quarter end based on Guyana TZ', () => {
      const r = nextQuarterEnd(new Date('2026-05-17T12:00:00Z'));
      expect(r.quarter).toBe(2);
      expect(r.end).toBe('2026-06-30');
    });
  });
  ```

- [ ] **Step 4:** Run tests: `npx vitest run tests/unit/nptab/period.test.ts` — 12/12 pass.

- [ ] **Step 5:** Commit
  ```bash
  git add lib/nptab/types.ts lib/nptab/period.ts tests/unit/nptab/period.test.ts
  git commit -m "feat(nptab): types and Guyana-TZ quarter helpers"
  ```

---

### Task 11: lib/nptab/reference-number.ts + test

**Files:**
- Create: `lib/nptab/reference-number.ts`
- Create: `tests/unit/nptab/reference-number.test.ts`

- [ ] **Step 1:** Mirror `lib/referrals/reference-number.ts`:

  ```ts
  // lib/nptab/reference-number.ts
  import type { PoolClient } from 'pg';

  export function guyanaYearOf(d: Date): number {
    return Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guyana', year: 'numeric' }).format(d),
    );
  }

  export function formatNptabReferenceNumber(seq: number, year: number): string {
    return `MPUA-NPTAB-${year}-${seq.toString().padStart(4, '0')}`;
  }

  export async function allocateNptabReferenceNumber(now: Date = new Date(), client?: PoolClient): Promise<string> {
    const sql = "SELECT nextval('nptab_report_ref_seq') AS seq";
    let result;
    if (client) {
      result = await client.query(sql);
    } else {
      const { query } = await import('@/lib/db-pg');
      result = await query(sql);
    }
    const seq = Number(result.rows[0].seq);
    return formatNptabReferenceNumber(seq, guyanaYearOf(now));
  }
  ```

- [ ] **Step 2:** Test mirrors referral test:

  ```ts
  // tests/unit/nptab/reference-number.test.ts
  import { describe, it, expect } from 'vitest';
  import { formatNptabReferenceNumber } from '@/lib/nptab/reference-number';

  describe('formatNptabReferenceNumber', () => {
    it('zero-pads to 4 digits', () => {
      expect(formatNptabReferenceNumber(1, 2026)).toBe('MPUA-NPTAB-2026-0001');
      expect(formatNptabReferenceNumber(42, 2026)).toBe('MPUA-NPTAB-2026-0042');
    });
    it('does not truncate beyond 9999', () => {
      expect(formatNptabReferenceNumber(12345, 2027)).toBe('MPUA-NPTAB-2027-12345');
    });
  });
  ```

- [ ] **Step 3:** Run + commit:
  ```bash
  npx vitest run tests/unit/nptab/reference-number.test.ts
  git add lib/nptab/reference-number.ts tests/unit/nptab/reference-number.test.ts
  git commit -m "feat(nptab): MPUA-NPTAB-YYYY-NNNN reference number helper"
  ```

---

### Task 12: lib/nptab/aggregate.ts + test

**Files:**
- Create: `lib/nptab/aggregate.ts`
- Create: `tests/unit/nptab/aggregate.test.ts`

- [ ] **Step 1:** Pure aggregation function:

  ```ts
  // lib/nptab/aggregate.ts
  import type { NptabReportTenderSnapshot } from './types';

  export interface AgencyAggregate { agency: string; count: number; total_value: number; }
  export interface ValueBracket { label: string; count: number; total_value: number; }
  export interface ContractorAggregate { contractor: string; count: number; total_value: number; }

  const BRACKETS: { label: string; min: number; max: number | null }[] = [
    { label: '< 10M', min: 0, max: 10_000_000 },
    { label: '10M to 50M', min: 10_000_000, max: 50_000_000 },
    { label: '50M to 200M', min: 50_000_000, max: 200_000_000 },
    { label: '200M+', min: 200_000_000, max: null },
  ];

  export function buildAggregates(rows: NptabReportTenderSnapshot[]): {
    byAgency: AgencyAggregate[];
    byValueBracket: ValueBracket[];
    byContractor: ContractorAggregate[];
  } {
    const agencyMap = new Map<string, AgencyAggregate>();
    for (const r of rows) {
      const a = agencyMap.get(r.agency) ?? { agency: r.agency, count: 0, total_value: 0 };
      a.count++;
      a.total_value += r.contract_value ?? 0;
      agencyMap.set(r.agency, a);
    }

    const bracketArr: ValueBracket[] = BRACKETS.map((b) => ({ label: b.label, count: 0, total_value: 0 }));
    for (const r of rows) {
      const v = r.contract_value ?? 0;
      const idx = BRACKETS.findIndex((b) => v >= b.min && (b.max === null || v < b.max));
      if (idx >= 0) {
        bracketArr[idx].count++;
        bracketArr[idx].total_value += v;
      }
    }

    const contractorMap = new Map<string, ContractorAggregate>();
    for (const r of rows) {
      if (!r.contractor) continue;
      const c = contractorMap.get(r.contractor) ?? { contractor: r.contractor, count: 0, total_value: 0 };
      c.count++;
      c.total_value += r.contract_value ?? 0;
      contractorMap.set(r.contractor, c);
    }

    return {
      byAgency: [...agencyMap.values()].sort((a, b) => b.count - a.count),
      byValueBracket: bracketArr,
      // Only contractors with 2+ tenders (per spec)
      byContractor: [...contractorMap.values()].filter((c) => c.count >= 2).sort((a, b) => b.total_value - a.total_value),
    };
  }
  ```

- [ ] **Step 2:** Tests:

  ```ts
  // tests/unit/nptab/aggregate.test.ts
  import { describe, it, expect } from 'vitest';
  import { buildAggregates } from '@/lib/nptab/aggregate';
  import type { NptabReportTenderSnapshot } from '@/lib/nptab/types';

  const mk = (over: Partial<NptabReportTenderSnapshot>): NptabReportTenderSnapshot => ({
    tender_id: 't', title: 'x', agency: 'GPL', contract_value: 0, days_past_sla: 0, contractor: null, status: 'evaluation', ...over,
  });

  describe('buildAggregates', () => {
    it('groups by agency with count and total_value', () => {
      const r = buildAggregates([
        mk({ agency: 'GPL', contract_value: 5_000_000 }),
        mk({ agency: 'GPL', contract_value: 15_000_000 }),
        mk({ agency: 'GWI', contract_value: 7_000_000 }),
      ]);
      expect(r.byAgency).toEqual([
        { agency: 'GPL', count: 2, total_value: 20_000_000 },
        { agency: 'GWI', count: 1, total_value: 7_000_000 },
      ]);
    });

    it('buckets by value bracket', () => {
      const r = buildAggregates([
        mk({ contract_value: 5_000_000 }),     // < 10M
        mk({ contract_value: 25_000_000 }),    // 10-50M
        mk({ contract_value: 100_000_000 }),   // 50-200M
        mk({ contract_value: 500_000_000 }),   // 200M+
      ]);
      expect(r.byValueBracket.map((b) => b.count)).toEqual([1, 1, 1, 1]);
    });

    it('only includes contractors with 2+ tenders', () => {
      const r = buildAggregates([
        mk({ contractor: 'Acme', contract_value: 10 }),
        mk({ contractor: 'Acme', contract_value: 20 }),
        mk({ contractor: 'Bravo', contract_value: 5 }),
      ]);
      expect(r.byContractor).toHaveLength(1);
      expect(r.byContractor[0].contractor).toBe('Acme');
      expect(r.byContractor[0].total_value).toBe(30);
    });
  });
  ```

- [ ] **Step 3:** Run + commit:
  ```bash
  npx vitest run tests/unit/nptab/aggregate.test.ts
  git add lib/nptab/aggregate.ts tests/unit/nptab/aggregate.test.ts
  git commit -m "feat(nptab): aggregate analyzer (byAgency, byValueBracket, byContractor)"
  ```

---

### Task 13: lib/nptab/audit.ts + lib/nptab/queries.ts

**Files:**
- Create: `lib/nptab/audit.ts`
- Create: `lib/nptab/queries.ts`

- [ ] **Step 1:** Audit writer — mirror `lib/referrals/audit.ts` with table name `nptab_report_audit_log` and field `report_id`:

  ```ts
  // lib/nptab/audit.ts
  import type { PoolClient } from 'pg';
  import { supabaseAdmin } from '@/lib/db';
  import { logger } from '@/lib/logger';

  export interface NptabAuditEntry {
    report_id: string;
    changed_by: string;
    field_changed: string;
    old_value: string | null;
    new_value: string | null;
  }

  export async function writeNptabAuditEntries(entries: NptabAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await supabaseAdmin.from('nptab_report_audit_log').insert(entries);
    if (error) { logger.error({ err: error, entries }, 'nptab_report_audit_log insert failed'); throw new Error('Failed to write NPTAB audit log'); }
  }

  export async function writeNptabAuditEntriesTx(client: PoolClient, entries: NptabAuditEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const placeholders: string[] = [];
    const values: unknown[] = [];
    entries.forEach((e, i) => {
      const base = i * 5;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
      values.push(e.report_id, e.changed_by, e.field_changed, e.old_value, e.new_value);
    });
    await client.query(
      `INSERT INTO nptab_report_audit_log (report_id, changed_by, field_changed, old_value, new_value)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }
  ```

- [ ] **Step 2:** Queries module. This is substantial — ~250 lines. Exports needed:

  - `listActiveQueue()` → joins to `tender` for display columns: id, tender_id, queued_at, queued_by, reason, queued_by_name, tender_title, tender_agency, days_past_sla, contract_value, contractor
  - `queueTender(tenderId, userId, reason)` → INSERT into `nptab_report_queue`. Catches unique-violation when an active queue row exists; returns a structured error code `ALREADY_QUEUED`.
  - `dequeueTender(queueId, userId, reason)` → UPDATE `dequeued_at = NOW(), dequeued_by = userId, dequeue_reason = reason`. Em-dash guarded.
  - `listReports()` → all rows ordered by `submitted_at DESC NULLS LAST, generated_at DESC`
  - `getReportById(id)` → row + included tender snapshots (join `nptab_report_queue` with `included_in_report_id = id` ∪ tender table for snapshot columns)
  - `getReportAuditLog(reportId)`
  - `createDraftFromQueue(userId)` → transactional:
    1. Lock `nptab_report_queue` rows where `dequeued_at IS NULL AND included_in_report_id IS NULL` `FOR UPDATE`
    2. Compute period via `quarterOf(now)` + `periodToDates`
    3. INSERT into `nptab_reports` (status='drafted', period_start, period_end, generated_by=userId, narrative='', tender_count=0)
    4. UPDATE the locked queue rows: `included_in_report_id = newReport.id`
    5. INSERT audit row `'status_transition' NULL -> drafted` and `'included_tenders' NULL -> '<count>'`
    Returns the new report row
  - `updateReportNarrative(id, narrative, userId)` → em-dash guard; transactional UPDATE + audit
  - `addTenderToReport(reportId, tenderId, userId)` → only when status='drafted'; insert a queue row with `included_in_report_id = reportId` directly (bypassing the active-queue stage)
  - `removeTenderFromReport(reportId, tenderId, userId)` → only when status='drafted'; clear the included_in_report_id (back to active queue is wrong since the queue row may have been dequeued; spec says "clears included_in_report_id and dequeues" — so set `dequeued_at = NOW(), dequeued_by = userId, dequeue_reason = 'Removed from report'`)
  - `submitReport(id, deliveryMethod, deliveredTo, userId, renderPdf)` → transactional:
    1. Lock report row; assert status='drafted'
    2. Compute snapshot: sum contract_value, count tenders
    3. `allocateNptabReferenceNumber()`
    4. UPDATE status='submitted', reference_number, submitted_at=NOW(), delivery_method, delivered_to, tender_count, total_value
    5. Audit rows for each field change
    6. Call `renderPdf(report)` — if throws, transaction rolls back (sequence value is consumed gap-style; same trade as referrals)
    Returns the updated report
  - `closeReport(id, closureReason, userId)` → status drafted|submitted → closed; em-dash guard; audit
  - `getActiveNptabQueueRowForTender(tenderId)` → returns the open queue row or null
  - `getLatestSubmittedReportContainingTender(tenderId)` → returns `{ report_id, reference_number, submitted_at }` or null — used by the source banner

  Implement with `transaction()` from `lib/db-pg.ts` for writes; `supabaseAdmin` for reads. All em-dash text fields run through `rejectEmDash` from `lib/referrals/em-dash-guard` (shared helper).

  *(Engineer note: write the file as one focused module. Test coverage for status-transition logic in Task 14.)*

- [ ] **Step 3:** Commit:
  ```bash
  git add lib/nptab/audit.ts lib/nptab/queries.ts
  git commit -m "feat(nptab): queries with transactional audit + queue ops"
  ```

---

### Task 14: PDF renderer `lib/pdf/nptab-report-render.tsx`

**Files:**
- Create: `lib/pdf/nptab-report-render.tsx`

- [ ] **Step 1:** Mirror `lib/pdf/referral-render.tsx` exactly for Font.register + page styles. Build the document with sections per spec:

  - Letterhead (logo + ministry name + address, gold bottom border)
  - Right-aligned ref + date block (ref number, "Date: {generated/submitted date}")
  - Addressee: "The Chairperson, National Procurement and Tender Administration Board"
  - Subject: `Procurement Performance Report — ${periodLabel(period_start, period_end)}`
  - Executive Summary: auto-text + optional first 200 chars of narrative
  - Tender Details Table — uses `<View>` rows because @react-pdf doesn't have a real table primitive: columns Title (40%), Agency (12%), Value (15%), Days Past SLA (15%), Contractor (18%)
  - Aggregate Analysis: three blocks (by agency, by value bracket, by contractors with ≥2 tenders)
  - Findings and Narrative: the DG's commentary, wrapped in justified body text
  - Signature block: "Respectfully submitted," / DG name / DG title

  Use `fmtGuyanaDate` from `lib/format.ts` and `fmtBudgetAmount` from same.

  Export `renderNptabReportPDF(params: { report: NptabReport; tenders: NptabReportTenderSnapshot[]; aggregates: ReturnType<typeof buildAggregates>; referrerName: string; referrerTitle: string }): Promise<Buffer>`.

- [ ] **Step 2:** Smoke test with a fixture:
  ```bash
  npx tsx -e "import('./lib/pdf/nptab-report-render').then(async m => { const fs=require('fs'); const buf = await m.renderNptabReportPDF({ report: { /* fixture */ }, tenders: [], aggregates: { byAgency: [], byValueBracket: [], byContractor: [] }, referrerName:'Test',referrerTitle:'DG'}); fs.writeFileSync('/tmp/nptab.pdf', buf); console.log(buf.length); })"
  ```
  Open the PDF to confirm.

- [ ] **Step 3:** Commit
  ```bash
  git add lib/pdf/nptab-report-render.tsx
  git commit -m "feat(nptab): A4 PDF renderer with letterhead and aggregate blocks"
  ```

---

### Task 15: API routes

**Files:**
- Create: `app/api/nptab-reports/route.ts` (GET list, POST create-from-queue)
- Create: `app/api/nptab-reports/[id]/route.ts` (GET, PATCH narrative/close/manual-override)
- Create: `app/api/nptab-reports/[id]/pdf/route.ts`
- Create: `app/api/nptab-reports/[id]/submit/route.ts`
- Create: `app/api/nptab-reports/[id]/tenders/route.ts` (POST add, DELETE remove)
- Create: `app/api/nptab-reports/queue/route.ts` (GET, POST queue, DELETE dequeue)

- [ ] **Step 1:** Each route follows the established pattern: `export const runtime = 'nodejs'`, `requireRole(['dg'])` for mutations and `requireRole(['dg', 'ps'])` for reads, JSON body, em-dash guard via `EmDashError` catch returning 422. The submit route imports `renderNptabReportPDF` and passes it to `submitReport` as the renderPdf callback (parallels the referral submit pattern).

  For `POST /api/nptab-reports/queue` body shape: `{ tender_id: string, reason?: string }`. On unique violation (already queued), respond 409 with `{ error: 'Already queued for the upcoming NPTAB report', queueId: <existing-row-id> }`.

  For `DELETE /api/nptab-reports/queue?queue_id=...&reason=...` → dequeues. DG only.

  For `POST /api/nptab-reports` → calls `createDraftFromQueue(userId)`. Returns `{ report, redirectTo: '/nptab-reports/<id>' }`.

  Other route shapes follow `app/api/referrals/*` precedent line for line.

- [ ] **Step 2:** Commit
  ```bash
  git add app/api/nptab-reports
  git commit -m "feat(nptab): API surface (queue, list, draft, submit, edit, pdf)"
  ```

---

### Task 16: `/nptab-reports` page + QueueSection + NptabReportsList

**Files:**
- Create: `app/nptab-reports/page.tsx`
- Create: `app/nptab-reports/_components/QueueSection.tsx`
- Create: `app/nptab-reports/_components/NptabReportsList.tsx`

- [ ] **Step 1:** Server page:

  ```tsx
  // app/nptab-reports/page.tsx
  import { NextResponse } from 'next/server';
  import { notFound } from 'next/navigation';
  import { requireRole } from '@/lib/auth-helpers';
  import { listActiveQueue, listReports } from '@/lib/nptab/queries';
  import { QueueSection } from './_components/QueueSection';
  import { NptabReportsList } from './_components/NptabReportsList';

  export const dynamic = 'force-dynamic';

  export default async function NptabReportsPage() {
    const result = await requireRole(['dg', 'ps']);
    if (result instanceof NextResponse) notFound();
    const { session } = result;
    const [queue, reports] = await Promise.all([listActiveQueue(), listReports()]);
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <QueueSection queue={queue} canEdit={session.user.role === 'dg'} />
        <NptabReportsList reports={reports} />
      </div>
    );
  }
  ```

- [ ] **Step 2:** `QueueSection` (client component): table of queue rows with columns Title, Agency, Contract Value, Days Past SLA, Queued At, Queued By, Reason, Action. DG sees a Remove button (prompts for reason) on each row. Header right side: "Generate Draft Report" button (DG only) that POSTs to `/api/nptab-reports` and on success `router.push(redirectTo)`. Above the table: `<p>{queue.length} tenders queued. Upcoming report period: {periodLabel(next.start, next.end)}.</p>`.

- [ ] **Step 3:** `NptabReportsList`: same table style as `ReferralsTable`. Columns: Reference, Period, Status (use a shared badge), Generated, Tender Count, Total Value. Row link to `/nptab-reports/[id]`. Filter by status if useful — defer if not necessary for first ship.

- [ ] **Step 4:** Commit
  ```bash
  git add app/nptab-reports
  git commit -m "feat(nptab): /nptab-reports queue + reports list page"
  ```

---

### Task 17: `/nptab-reports/[id]` detail page

**Files:**
- Create: `app/nptab-reports/[id]/page.tsx`
- Create: `app/nptab-reports/_components/NptabReportDetailClient.tsx`
- Create: `app/nptab-reports/_components/AggregateBlocks.tsx`

- [ ] **Step 1:** Server page fetches the report, the included tender snapshots, audit log, and the referrer user record. Passes everything to the client component. Use the same Forbidden-or-NotFound pattern as `/referrals/[id]`.

- [ ] **Step 2:** `NptabReportDetailClient` renders:
  - Header: reference number (or "DRAFT"), period label, status badge, generated date / by
  - Included Tenders table (sortable by days breach desc default; columns as in spec)
  - `<AggregateBlocks aggregates={...} />` — three side-by-side panels
  - Narrative section — read-only when not drafted; textarea + Save when drafted (em-dash guard live + on save)
  - Action buttons row (DG only):
    - Edit Narrative (drafted)
    - Mark Submitted (drafted) — opens a small inline form for delivery_method + delivered_to → POST `/api/nptab-reports/[id]/submit`
    - Close Report (drafted | submitted) — reason prompt → PATCH with `{ closure_reason }` (the API route maps to closeReport)
    - Add Tender to Report (drafted) — picker over tenders NOT already queued / not in another report
    - Remove Tender (drafted) — per-row in the included-tenders table
  - Audit log at bottom (reuse `ReferralAuditList` component but with the NPTAB audit entry shape — they're structurally identical except for `report_id` vs `referral_id`; consider extracting a shared `AuditList` taking a `getId(entry)` callback, or just duplicate this once — duplication is acceptable for one extra surface)

- [ ] **Step 3:** Commit
  ```bash
  git add app/nptab-reports/[id] app/nptab-reports/_components/NptabReportDetailClient.tsx app/nptab-reports/_components/AggregateBlocks.tsx
  git commit -m "feat(nptab): report detail with narrative editor and submit flow"
  ```

---

### Task 18: NptabQueueButton — replace Coming soon in EscalateModal

**Files:**
- Create: `components/nptab/NptabQueueButton.tsx`
- Modify: `components/today/EscalateModal.tsx`

- [ ] **Step 1:** Build the confirmation panel:

  ```tsx
  // components/nptab/NptabQueueButton.tsx
  'use client';
  import { useState } from 'react';
  import { containsEmDash } from '@/lib/referrals/em-dash-guard';
  // Confirmation panel: shows tender title + agency + days breach,
  // optional reason textarea, Queue button. Also detects already-queued
  // state via /api/nptab-reports/queue (GET) and offers Remove.

  interface Props {
    tenderId: string;
    tenderTitle: string;
    tenderAgency: string;
    daysBreach: number | null;
    onQueued: () => void;
    onCancel: () => void;
  }

  export function NptabQueueButton(props: Props) {
    // ... implementation as described
    return null;
  }
  ```

  Layout: tender summary block at top, optional reason textarea (em-dash live check + submit disabled when present), primary "Add to NPTAB Queue" button + secondary Cancel. If POST returns 409 ALREADY_QUEUED, swap to "Already queued (since [date])" view with a Remove from Queue button (reason prompt). After successful queue or dequeue, call `onQueued()`.

- [ ] **Step 2:** In `EscalateModal.tsx`, replace the disabled NPTAB option button with an active button that switches to a new view value `'nptab'`. Add the third view rendering `<NptabQueueButton ... onCancel={() => setView('menu')} onQueued={() => { setToast('Added to NPTAB queue.'); setView('menu'); setTimeout(close, 1400); }} />`. The button label stays "Queue for NPTAB Report".

  Only render this option when `sourceType === 'tender'` — NPTAB is procurement-specific. For other source types, the NPTAB option is hidden.

- [ ] **Step 3:** Commit
  ```bash
  git add components/nptab/NptabQueueButton.tsx components/today/EscalateModal.tsx
  git commit -m "feat(nptab): replace Coming soon stub with queue confirmation panel"
  ```

---

### Task 19: NptabSourceBanner + procurement card wiring

**Files:**
- Create: `components/nptab/NptabSourceBanner.tsx`
- Modify: `lib/tender/queries.ts` (extend attachActiveReferrals to also attach NPTAB status)
- Modify: `lib/tender/types.ts` (add optional NPTAB fields)
- Modify: `components/procurement/ProcurementCard.tsx`
- Modify: `components/procurement/ProcurementDetailPanel.tsx`

- [ ] **Step 1:** Banner component sibling to `ReferralSourceBanner`:

  ```tsx
  // components/nptab/NptabSourceBanner.tsx
  import { fmtGuyanaDate } from '@/lib/format';

  export interface ActiveNptabQueueBrief {
    queue_id: string;
    queued_at: string;
    upcoming_period_label: string;
  }
  export interface NptabReportBrief {
    report_id: string;
    reference_number: string;
    submitted_at: string;
  }

  interface Props {
    queued?: ActiveNptabQueueBrief | null;
    reported?: NptabReportBrief | null;
    compact?: boolean;
  }

  export function NptabSourceBanner({ queued, reported, compact = false }: Props) {
    if (reported) {
      return (
        <div className={`text-[11px] text-blue-300 bg-blue-500/10 border border-blue-500/30 rounded px-2 py-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          Reported to NPTAB {fmtGuyanaDate(reported.submitted_at)}, Ref{' '}
          <a href={`/nptab-reports/${reported.report_id}`} className="font-mono underline">{reported.reference_number}</a>.
        </div>
      );
    }
    if (queued) {
      return (
        <div className={`text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1 ${compact ? 'mt-1.5' : 'mt-2'}`}>
          Queued for NPTAB report {fmtGuyanaDate(queued.queued_at)}. Will be included in {queued.upcoming_period_label}.
        </div>
      );
    }
    return null;
  }
  ```

- [ ] **Step 2:** Extend `lib/tender/types.ts`:

  ```ts
  // append to the Tender interface
  activeNptabQueue?: ActiveNptabQueueBrief | null;
  latestNptabReport?: NptabReportBrief | null;

  // and add to ActiveReferralBrief block:
  export interface ActiveNptabQueueBrief {
    queue_id: string;
    queued_at: string;
    upcoming_period_label: string;
  }
  export interface NptabReportBrief {
    report_id: string;
    reference_number: string;
    submitted_at: string;
  }
  ```

- [ ] **Step 3:** Extend `lib/tender/queries.ts` `attachActiveReferrals` to ALSO attach NPTAB status. Rename to `attachReferralAndNptabBriefs` for clarity. Use new helpers from `lib/nptab/queries.ts`: `getActiveQueueRowsForTenders` and `getLatestReportsForTenders` (add both batched helpers to `lib/nptab/source-lookup.ts` so we don't drag in `db-pg` via `transaction` — same trick used for referrals).

- [ ] **Step 4:** In `ProcurementCard.tsx`, add `<NptabSourceBanner queued={tender.activeNptabQueue} reported={tender.latestNptabReport} compact />` next to the existing `<ReferralSourceBanner ... compact />`.

- [ ] **Step 5:** Same for `ProcurementDetailPanel.tsx`.

- [ ] **Step 6:** Commit
  ```bash
  git add components/nptab/NptabSourceBanner.tsx components/procurement/ProcurementCard.tsx components/procurement/ProcurementDetailPanel.tsx lib/tender lib/nptab
  git commit -m "feat(nptab): source-card banner for queue + submitted state"
  ```

---

## Phase E — Verification, ship

### Task 20: Verification

- [ ] **Step 1:** `npx tsc --noEmit` — clean across all referrals/nptab/today/tender/components/app paths I touched.
- [ ] **Step 2:** `npx vitest run` — only the documented pre-existing baseline failures remain; all my new tests pass.
- [ ] **Step 3:** `npm run build` — green; new routes registered: `/nptab-reports`, `/nptab-reports/[id]`, all `/api/nptab-reports/*`.
- [ ] **Step 4:** `/simplify` skill pass over the diff. Apply low-risk suggestions; defer noisy ones.

### Task 21: Push, surface SQL, await migrations

- [ ] **Step 1:** `git push -u origin feature/referrals-r2-and-nptab`
- [ ] **Step 2:** Open PR to `main` with the test plan from this document. Surface the SQL contents of migrations 118 and 119 verbatim in the PR description AND in a chat reply to the operator (they apply via the Supabase connector before merge).
- [ ] **Step 3:** Wait for confirmation that migrations 118 and 119 are applied to production Supabase (`ozcdsnpieeetzzwjqvjo`).

### Task 22: Merge and watch deploy

- [ ] **Step 1:** `gh pr merge <n> --merge --admin`
- [ ] **Step 2:** Monitor production deploy via `vercel inspect` until status transitions to Ready.
- [ ] **Step 3:** Confirm `dg-work-os.vercel.app` is bound to the new prod deploy via `vercel inspect`.
- [ ] **Step 4:** Report back: `main` commit SHA, prod deploy URL, alias confirmation, and one sentence per change confirming production behavior.

---

## Self-Review

**Spec coverage**

- Sidebar gating fix (Change 1): Task 1 (requireRole filter). ✓
- /minister/referrals 404 -> 403 (Change 1): Task 2 (Forbidden component + 403 branch). ✓
- EscalateModal re-verification (Change 1): Already fixed in PR #7. Noted in pre-flight. ✓
- Migration 118 (Change 2): Task 3. ✓
- ReferralForm source-type dropdown (Change 3): Task 4. ✓
- New Referral on /referrals (Change 3): Task 5. ✓
- Refer to Minister on delayed project (Change 3): Task 7. ✓
- Refer to Minister on task (Change 3): Tasks 6 + 8. ✓
- Refer to Minister on agency issue (Change 3): **Flagged in Open Questions as inapplicable**; reachable via source-type dropdown only. Awaiting your call.
- NPTAB migration 119 (Change 4): Task 9. ✓
- NPTAB types + period helpers (Change 4): Task 10. ✓
- NPTAB reference numbers at Submit (Change 4): Task 11. ✓ (sequence allocated by `allocateNptabReferenceNumber` called from `submitReport` only)
- NPTAB aggregator (Change 4): Task 12. ✓
- NPTAB queries (Change 4): Task 13 includes all CRUD + queue ops + add/remove tender.
- NPTAB PDF (Change 4): Task 14.
- NPTAB API surface (Change 4): Task 15.
- NPTAB queue + list page (Change 4): Task 16.
- NPTAB detail page (Change 4): Task 17.
- NPTAB queue button in EscalateModal (Change 4): Task 18.
- NPTAB source banner on procurement cards (Change 4): Task 19.
- NPTAB sidebar entry (Change 4): Task 1 (added alongside other nav items).
- Module seed bump (minister-referrals sort_order 76 -> 77, nptab-reports at 76) (Change 4): Task 9.

**Type consistency**

- `NptabReportStatus`, `NptabDeliveryMethod` defined once in `lib/nptab/types.ts`, derived from const arrays (matches the referrals pattern).
- Function names match: `composeTaskPreFill`, `allocateNptabReferenceNumber`, `buildAggregates`, `submitReport`, `createDraftFromQueue`, `addTenderToReport`, `removeTenderFromReport`, `queueTender`, `dequeueTender`, `getActiveNptabQueueRowForTender`, `getLatestSubmittedReportContainingTender`.
- Both `EscalateModal` views (refer, nptab) use the same SlidePanel host with no new modal infra.

**Placeholder scan**

- One spot intentionally not over-specified: Task 13 Step 2 describes the queries module by exported function signatures rather than full implementation, because mechanically translating each into TypeScript inflates the plan without adding clarity. The exports list is exhaustive; the engineer has the spec, the schema, and the `lib/referrals/queries.ts` reference implementation to mirror.
- Task 17's Audit log render: noted the option to extract a shared `AuditList` or duplicate the existing referral one. Either is fine — duplication is acceptable when used twice.

**Decisions confirmed**

- Modal primitive: SlidePanel (already portaled in PR #7). No shadcn.
- Migration paths and apply mechanism: `node scripts/run-migrations.mjs 118 119`.
- Reference number for NPTAB allocates **at Mark Submitted**, never at draft creation. Drafts don't burn sequence values.
- Agency issue entry point: flagged for confirmation in Open Question 1; default behavior is to skip the per-record button.
