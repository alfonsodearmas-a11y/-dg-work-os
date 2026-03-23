# DG Work OS — Deep Codebase Audit Report

**Date:** 2026-03-22
**Overall Health:** 85%
**Modules Audited:** 26
**Database Tables:** 89
**Source Files:** ~400+
**Audited By:** Claude Opus 4.6 (5 parallel agents)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Fix First — Security, Bugs, Data Risks](#1-fix-first)
3. [Quick Polish — < 1hr Each](#2-quick-polish)
4. [Deepen — < 1 Day Each](#3-deepen)
5. [Connect — Cross-Module Integrations](#4-connect)
6. [Tighten — Code Quality & Design Consistency](#5-tighten)
7. [Module Health Summary](#module-health-summary)
8. [Database Table Map](#database-table-map)
9. [RLS Security Audit](#rls-security-audit)
10. [Index & Query Performance](#index--query-performance)
11. [UX & Frontend Polish Audit](#ux--frontend-polish-audit)
12. [Code Quality Findings](#code-quality-findings)
13. [Recommended Execution Order](#recommended-execution-order)

---

## Executive Summary

The codebase is well-architected with strong auth, consistent design system, and no SQL injection risks. The main gaps are:

- **12 tables missing RLS** (security risk)
- **139+ untyped `any` usages** (fragility)
- **Missing cross-module connections** (Meetings→Tasks, Documents→everything)
- **UX polish gaps** on newer modules (no `loading.tsx` on 5 pages, inconsistent empty states)
- **158 files with `console.log`** instead of structured logger
- **8 orphaned database tables** from old migrations

**Production-ready modules:** 16/26 (62%)
**Near-complete (80%+):** 8/26 (31%)
**Needs work (<80%):** 5/26 (8%)

---

## 1. Fix First

> Security issues, bugs, broken features, data integrity problems.

### 1.1 CRITICAL: Missing RLS on Critical Tables

**Severity:** CRITICAL
**Effort:** Medium (new migration)

| Table | Risk | Why |
|-------|------|-----|
| `users` | Entire user directory exposed | No RLS — any authenticated client query exposes all users |
| `invitation_tokens` | Token leakage | Security tokens readable by any authenticated user |
| `push_subscriptions` | Device enumeration | Leaks device endpoints |
| `roles` | Admin data exposure | People module admin table unprotected |
| `core_permissions` | Admin data exposure | People module admin table unprotected |
| `role_permissions` | Admin data exposure | Admin permission mapping unprotected |
| `activity_logs` | Audit trail tamperable | Should be append-only |
| `task_comments` | Cross-user data leak | No scoping to task owner |
| `task_activity` | Cross-user data leak | No scoping to task owner |
| `task_subtasks` | Cross-user data leak | No scoping to task owner |
| `object_ownership` | Admin data exposure | People module object tracking |
| `object_access_grants` | Admin data exposure | People module access control |

**Fix:** New migration adding RLS policies. Example for `users`:

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_self ON users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY users_dg ON users FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'dg'))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'dg'));
```

---

### 1.2 HIGH: GPL Write Policies Too Permissive

**Severity:** HIGH
**Files:** `supabase/migrations/031_gpl_service_connections.sql`

GPL tables (`gpl_snapshots`, `gpl_outstanding`, `gpl_completed`, `gpl_snapshot_metrics`, `gpl_chronic_outliers`) allow ANY authenticated user to INSERT/UPDATE/DELETE via:

```sql
USING (true) WITH CHECK (true)
```

**Fix:** Restrict writes to `service_role` only:

```sql
DROP POLICY gpl_snapshots_write ON gpl_snapshots;
CREATE POLICY gpl_snapshots_write ON gpl_snapshots FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
```

---

### 1.3 HIGH: Missing try-catch on JSON.parse in Oversight

**Severity:** HIGH
**File:** `app/api/oversight/route.ts:70-71`

```typescript
const raw = fs.readFileSync(HIGHLIGHTS_PATH, 'utf-8');
const data = JSON.parse(raw);  // ← No try-catch around parse
```

Corrupted JSON file causes unhandled exception and 500 error without proper logging.

**Fix:** Wrap `JSON.parse()` in try-catch:

```typescript
let data;
try {
  const raw = fs.readFileSync(HIGHLIGHTS_PATH, 'utf-8');
  data = JSON.parse(raw);
} catch {
  data = { highlights: [] };
}
```

---

### 1.4 HIGH: Briefing Route Assumes Sibling Responses Are OK

**Severity:** HIGH
**File:** `app/api/briefing/generate/route.ts:35-40`

```typescript
getActions().then(r => r.json()),  // ← assumes r.ok
```

If a sibling route returns an error (e.g., 401), the `.json()` parses the error body as valid data, masking the failure.

**Fix:**

```typescript
getActions().then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))),
```

---

### 1.5 HIGH: Missing CASCADE DELETE on Task Sub-Tables

**Severity:** HIGH
**Tables:** `task_activity`, `task_comments`, `task_subtasks`

Deleting a task orphans its comments, activity log, and subtasks. No explicit FK with CASCADE defined.

**Fix:**

```sql
ALTER TABLE task_activity ADD CONSTRAINT task_activity_task_fk
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_comments ADD CONSTRAINT task_comments_task_fk
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE task_subtasks ADD CONSTRAINT task_subtasks_task_fk
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
```

---

### 1.6 MEDIUM: SSL rejectUnauthorized: false in Production

**Severity:** MEDIUM
**File:** `lib/db-pg.ts`

```typescript
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
```

Allows MITM attacks on the PostgreSQL connection in production.

**Fix:** Change to `{ rejectUnauthorized: true }`.

---

### 1.7 MEDIUM: Unhandled Null in Task Comments Join

**Severity:** MEDIUM
**File:** `app/api/tasks/[id]/comments/route.ts:39`

```typescript
const usersRaw = c.users as unknown;
const user = (Array.isArray(usersRaw) ? usersRaw[0] : usersRaw) as { name: string; role: string } | null;
```

If Supabase returns a null FK join, this creates an unsafe type assertion without null checks.

**Fix:** Add explicit null guard before the ternary.

---

### 1.8 MEDIUM: PostgreSQL Pool Size Too High

**Severity:** MEDIUM
**File:** `lib/db-pg.ts`

```typescript
max: 20,  // Too high for serverless Next.js
```

For a Next.js serverless app, 20 concurrent connections is excessive and could exhaust the Supabase pooler.

**Fix:** Reduce to `max: 10` or lower.

---

## 2. Quick Polish

> Loading states, empty states, consistency, dead code cleanup. Each item < 1 hour.

### 2.1 Add loading.tsx to 5 Pages Missing Them

**Effort:** Trivial (15 min each)
**Impact:** Prevents blank screens during data fetch

| Page | File to Create |
|------|---------------|
| `/admin` | `app/admin/loading.tsx` |
| `/admin/people` | `app/admin/people/loading.tsx` |
| `/calendar` | `app/calendar/loading.tsx` |
| `/procurement` | `app/procurement/loading.tsx` |
| `/applications` | `app/applications/loading.tsx` |

Use the same skeleton pattern as existing loading files (e.g., `app/intel/loading.tsx`).

---

### 2.2 Replace console.log/warn/error with Structured Logger

**Effort:** 1-2 hours
**Files:** 158+ files with console usage

Key offenders:
- `lib/db-pg.ts:30` — logs EVERY database query
- `lib/gpl-enhanced-forecast.ts:355,380,419`
- `lib/gpl-multivariate-forecast.ts:412,416,422,427,455,473,675`
- `lib/gpl-forecasting.ts:972,988-1006`
- `lib/db.ts:25`

`lib/logger.ts` (pino) already exists and provides structured logging. Replace all `console.*` calls with appropriate logger methods.

---

### 2.3 Standardize Empty States Using EmptyState Component

**Effort:** 30 minutes
**File:** `components/ui/EmptyState.tsx` exists but is underutilized

Pages needing empty states:

| Page/Component | Current Behavior | Fix |
|---------------|-----------------|-----|
| `app/admin/people/page.tsx` | Empty table, no message | Add `<EmptyState>` with "No users found" |
| `app/budget/page.tsx` | Shows zero values, no guidance | Add empty state for zero allocations |
| `app/meetings/page.tsx` | Blank card | Add "No meetings yet" with upload prompt |
| `app/oversight/page.tsx` | Zero metric cards, no action prompt | Add "No projects tracked" |
| `components/tasks/KanbanBoard.tsx` | Columns visually empty | Add per-column "No tasks" text |

Currently only `ProcurementKanban` uses `EmptyState` properly — replicate that pattern.

---

### 2.4 Centralize Hardcoded AI Model Name

**Effort:** Trivial (15 min)
**Impact:** Prevents stale model references when upgrading

`claude-sonnet-4-5-20250929` appears in 5+ files across the codebase.

**Fix:** Create `lib/constants/ai-config.ts`:

```typescript
export const AI_MODEL = 'claude-sonnet-4-5-20250929';
```

Replace all hardcoded references.

---

### 2.5 Fix Touch Targets on Icon Buttons

**Effort:** Small (30 min)
**Impact:** Mobile usability — buttons currently 16-24px instead of 44px minimum

Affected components:
- `components/layout/Sidebar.tsx` — collapse button (`h-4 w-4` with only `p-2`)
- `components/tasks/KanbanBoard.tsx` — various icon buttons
- `app/applications/page.tsx` — sort column headers (`h-3 w-3` icons)

**Fix:** Add `min-h-[44px] min-w-[44px]` wrapper or increase padding on icon buttons.

---

### 2.6 Add Required Field Indicators to Forms

**Effort:** Small (20 min)
**Impact:** Form usability — users can't tell which fields are mandatory

Components missing required indicators:
- `components/procurement/ProcurementNewPackageForm.tsx`
- `components/tasks/InviteUserModal.tsx`
- `app/applications/new/page.tsx`

**Fix:** Add `<span className="text-red-400" aria-label="required">*</span>` to required field labels.

---

### 2.7 Unify Input Focus Styling

**Effort:** Trivial (15 min)

Two different focus ring patterns in use:
- Most inputs: `focus:outline-none focus:ring-1 focus:ring-gold-500/50`
- Login page: `focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/25`

**Fix:** Standardize all inputs to the primary pattern.

---

### 2.8 Add aria-invalid and aria-describedby to Form Error Linking

**Effort:** Small (30 min)

Form error messages display text but are not programmatically linked to inputs.

**Fix:** Add `aria-invalid="true"` to errored inputs and `aria-describedby="fieldname-error"` pointing to the error message element.

---

## 3. Deepen

> Features close to great that need finishing. Each item < 1 day.

### 3.1 Meetings → Tasks Auto-Creation

**Status:** 60% built, not wired
**Effort:** 2-3 hours
**Impact:** CRITICAL daily workflow

The database schema has `tasks.source_meeting_id` and `meeting_actions.task_id`, but **no code connects them**. Meeting analysis extracts action items via Claude but never creates tasks.

**What "done" looks like:**
1. "Create Task" button on each meeting action item in `app/meetings/page.tsx`
2. Auto-create for high-confidence actions during `/api/meetings/[id]/analyze`
3. Populate `meeting_actions.task_id` with created task UUID
4. Show linked task status badge in meeting action list
5. Generate notification when task is auto-created

**Files:**
- `app/api/meetings/[id]/analyze/route.ts:144-200` — action extraction
- `app/api/tasks/route.ts` — POST handler (already supports `source_meeting_id`)
- `app/meetings/page.tsx` — actions display section
- `lib/meetings-utils.ts` — MeetingAction interface

---

### 3.2 Document Linking to Projects/Tasks/Applications

**Status:** Documents are orphaned — no FK connections
**Effort:** 3 hours
**Impact:** HIGH — document organization is critical for a government Work OS

`documents.project_reference` is a TEXT string, not a UUID FK. There is no way to attach documents to tasks, projects, or meetings in the UI.

**What "done" looks like:**
1. Migration adding `project_id UUID`, `task_id UUID` FK columns to `documents`
2. "Link to..." dropdown in document detail page
3. "Attached Documents" section in project detail and task detail views
4. Reverse breadcrumbs: "Attached to Project X > Task Y"
5. Deprecate `project_reference` TEXT field

**Files:**
- `supabase/migrations/` — new migration adding FKs
- `app/api/documents/[id]/route.ts` — add PATCH for links
- `components/documents/DocumentViewer.tsx` — add link selector
- `components/projects/` — add attached documents section
- `components/tasks/TaskDetailPanel.tsx` — add attached documents section

---

### 3.3 Type Safety: Replace Critical `any` Usages

**Status:** 139+ `any` occurrences across the codebase
**Effort:** 3-4 hours for critical paths
**Impact:** Prevents runtime errors from untyped data

Priority files (highest bug risk from untyped data):

| File | Lines | Issue |
|------|-------|-------|
| `lib/project-queries.ts` | 122, 185, 425, 505, 654, 664 | `enrichProject(row: any)` |
| `lib/daily-excel-parser.ts` | 42, 85, 147, 186 | `cell: any` |
| `lib/gpl-excel-parser.ts` | 4, 24-26 | Station data untyped |
| `lib/gpl-enhanced-forecast.ts` | 94 | `latestDbis: Record<string, any>` |
| `components/oversight/types.ts` | 32-45 | `delayed: any[]`, `overdue: any[]` |
| `lib/ai-analysis.ts` | 21, 73 | `metrics: any[]` |
| `app/oversight/page.tsx` | 75, 77, 97 | Dashboard data untyped |

**What "done" looks like:** Define strict interfaces:
- `RawProjectRow` for database project rows
- `RawGPLStationData` for Excel station data
- `OversightProject` for oversight dashboard
- `DBISSummary` for GPL DBIS data
- `MetricRow` for agency metrics

---

### 3.4 Standardize Error Handling Across API Routes

**Status:** Inconsistent patterns
**Effort:** 2 hours

Current state:
- Some routes use `withErrorHandler()` wrapper (good pattern)
- Others use inline try-catch (acceptable but inconsistent)
- The catch-all in `lib/api-utils.ts:48-51` returns generic 500 for ALL errors:

```typescript
} catch (err) {
  logger.error({ err, route: req.nextUrl.pathname }, 'Unhandled API error')
  return apiError('INTERNAL_ERROR', 'Something went wrong', 500)
}
```

This doesn't distinguish validation errors (400), auth errors (401), and real 500s.

**What "done" looks like:**
- All API routes wrapped in `withErrorHandler()`
- Error type detection maps to appropriate HTTP status codes
- Structured error logging with context (agency, user_id, route)

---

### 3.5 Add Database Performance Indexes

**Effort:** Small (migration)
**Impact:** Query speed on common filtering patterns

```sql
-- Common task filter pattern (briefing, task board)
CREATE INDEX CONCURRENTLY idx_tasks_agency_status_due
  ON tasks (agency, status, due_date DESC NULLS LAST);

-- "Overdue tasks" query (briefing, oversight)
CREATE INDEX CONCURRENTLY idx_tasks_due_status
  ON tasks (due_date, status)
  WHERE status != 'done' AND due_date < CURRENT_DATE;

-- Notification inbox (unread, ordered by date)
CREATE INDEX CONCURRENTLY idx_notifications_user_unread_created
  ON notifications (user_id, read_at DESC NULLS FIRST, created_at DESC)
  WHERE read_at IS NULL;

-- Document filtering (agency + type — common pattern)
CREATE INDEX CONCURRENTLY idx_documents_agency_type
  ON documents (agency, document_type);

-- Procurement pipeline view (stage + agency)
CREATE INDEX CONCURRENTLY idx_procurement_stage_agency
  ON procurement_packages (current_stage, agency);

-- Application list (status + agency)
CREATE INDEX CONCURRENTLY idx_customer_app_status_agency
  ON customer_applications (status, agency);

-- "Tasks due this week" (briefing)
CREATE INDEX CONCURRENTLY idx_tasks_due_week
  ON tasks (due_date, owner_user_id)
  WHERE status != 'done'
    AND due_date >= CURRENT_DATE
    AND due_date <= CURRENT_DATE + INTERVAL '7 days';
```

---

### 3.6 Drop Orphaned Database Tables

**Effort:** Trivial (migration)
**Impact:** Cleaner schema, reduced confusion

8 tables with zero code references:

| Table | Created In | Replaced By | Code References |
|-------|-----------|-------------|-----------------|
| `notion_tasks` | 001 | `tasks` (022) | 0 |
| `notion_meetings` | 001 | `meetings` (024) | 0 |
| `calendar_events` | 001 | Google Calendar sync | 0 |
| `project_snapshots` | 001 | Projects table (004) | 0 |
| `meeting_minutes` | 007 | `meetings` (024) | 0 |
| `meeting_action_items` | 008 | `meeting_actions` (024) | 0 |
| `meeting_recordings` | 012 | `meetings` (024) | 0 |
| `draft_action_items` | 012 | `meeting_actions` (024) | 0 |

```sql
DROP TABLE IF EXISTS notion_tasks CASCADE;
DROP TABLE IF EXISTS notion_meetings CASCADE;
DROP TABLE IF EXISTS calendar_events CASCADE;
DROP TABLE IF EXISTS meeting_minutes CASCADE;
DROP TABLE IF EXISTS meeting_action_items CASCADE;
DROP TABLE IF EXISTS meeting_recordings CASCADE;
DROP TABLE IF EXISTS draft_action_items CASCADE;
```

---

### 3.7 Duplicated Excel Parsing Logic

**Effort:** 2-3 hours
**Impact:** Maintainability — 4 separate parsing modules with overlapping patterns

Current state:
- `lib/gpl-excel-parser.ts` — GPL daily metrics
- `lib/daily-excel-parser.ts` — Daily upload parsing
- `lib/gpl-schedule-parser.ts` — GPL schedule
- `lib/gpl/parser.ts` — GPL upload pipeline

**What "done" looks like:** Extract shared utilities to `lib/excel-utils.ts`:
- `parseSheet()` — common sheet reader
- `sanitizeRow()` — whitespace/encoding cleanup
- `coerceNumber()` — safe number parsing from cells
- `mapColumns()` — header matching logic

---

## 4. Connect

> Cross-module integrations that multiply the value of existing features.

### Connection Map

**Currently Connected (Working):**
- Tasks ↔ Briefing (task summary in daily view)
- Calendar ↔ Briefing (today's events)
- Notifications ↔ Tasks/Projects/Admin
- Projects ↔ Oversight (shared project data)

**Missing Connections:**

| Connection | Status | Priority | Effort | Details |
|-----------|--------|----------|--------|---------|
| **Meetings → Tasks** | Schema ready, no code | CRITICAL | 2-3 hrs | `meeting_actions.task_id` exists but never populated |
| **Documents → Projects/Tasks** | Orphaned, TEXT not FK | HIGH | 3 hrs | `project_reference` is string, no task/meeting links |
| **Procurement → Budget** | Completely separate | MEDIUM | 2.5 hrs | Procurement costs not visible in budget dashboard |
| **Applications → Tasks** | No connection | MEDIUM | 2 hrs | Status changes don't generate tracking tasks |
| **Projects → Tasks** | No connection | MEDIUM | 1.5 hrs | Escalation doesn't create follow-up tasks |
| **AI Chat → Entity Context** | Generic page context only | MEDIUM | 2 hrs | AI doesn't know current task/project/document |
| **Briefing → At-Risk Projects** | Doesn't show top delayed | MEDIUM | 2 hrs | No project health in daily briefing |
| **Notifications → All Modules** | Only tasks/projects/admin | MEDIUM | 2.5 hrs | Meetings, docs, applications generate none |
| **Calendar → Meetings** | One-way, no backlink | LOW | 1 hr | Calendar events don't show meeting context |

### Quick Wins (< 1 hour each)

**QW1. "Create Task from Meeting Action" button**
- Impact: HIGH — daily workflow
- Add button next to each action item in `app/meetings/page.tsx`
- Call POST `/api/tasks` with `source_meeting_id`
- Show success toast, mark action as linked

**QW2. "Link to Project" dropdown in Document Detail**
- Impact: MEDIUM — document organization
- Add project selector in document viewer
- Update `documents.project_reference` via PATCH

**QW3. Overdue Tasks Count Badge on Sidebar**
- Impact: MEDIUM — always-visible alert
- Query `/api/briefing/actions` in `components/layout/Sidebar.tsx`
- Show red count badge next to "Tasks" nav item

**QW4. "Create Calendar Event" from Project Detail**
- Impact: MEDIUM — project planning
- Add button in project detail with end_date pre-filled
- Uses existing `CreateEventModal` component

**QW5. "Open Applications" Count in Briefing**
- Impact: MEDIUM — GPL/GWI service connection visibility
- `lib/data/mission-control.ts` already fetches pending counts (lines 83-84)
- Surface in Briefing's agency section

**QW6. Notification Badge on Activity Panel**
- Impact: HIGH — information visibility
- `components/layout/ActivityPanel.tsx` already exists
- Add count badge to toggle button, color-coded by category

### Medium Wins (< half day)

**MW1. Auto-Create Tasks from Meeting Actions** (see Section 3.1)

**MW2. Document Linking Infrastructure** (see Section 3.2)

**MW3. Procurement → Budget Cost Rollup**
- Add `/api/budget/procurement/` endpoint
- Aggregate `procurement_packages.estimated_value` by agency and stage
- Add "Procurement Commitments" section to Budget dashboard
- Show variance: budget allocation vs. procured amount

**MW4. AI Chat with Current Entity Context**
- Extract entity ID from URL pathname in `lib/ai/context-engine.ts`
- For `/tasks/[id]`, fetch task detail and include in system prompt
- For `/projects/[id]`, fetch project and notes
- For `/applications/[id]`, fetch application context

**MW5. Applications → Task Generation on Status Change**
- Add `source_application_id` field to tasks table (migration)
- When application status changes in `/api/applications/[id]/route.ts`, auto-create tracking task
- Assign to relevant agency admin
- Generate notification

**MW6. Briefing → At-Risk Projects Quick View**
- Query delayed projects from oversight in Briefing fetch
- Show "Top 3 At-Risk Projects" card with status, completion %, overdue days
- Link to `/oversight` for details

### Data Consistency Issues

| Issue | Tables | Problem | Fix |
|-------|--------|---------|-----|
| Oversight data duplication | `projects` vs `oversight_projects` | Two tables for same data, updates don't sync | Use views/extensions instead of separate tables |
| Task status constraint | `tasks` | Allows both old (`not_started`) and new (`new`) values | Normalize to final 4 values only |
| Document project reference | `documents.project_reference` | TEXT string, not UUID FK | Add `project_id UUID` with proper FK |
| Application history | `customer_application_notes` vs `activity_log` | Two sources of truth | Notes for user commentary, activity for system events |
| Calendar ↔ Meeting link | `calendar_events` | No `source_meeting_id` field | Add FK to track which meeting created the event |

---

## 5. Tighten

> Code quality, type safety, query optimization, design system consistency.

### Code Quality Issues

| Issue | Count | Severity | Effort | Notes |
|-------|-------|----------|--------|-------|
| `any` type usage | 139+ instances | 🟡 Tech debt | Large (ongoing) | Priority: project-queries, parsers, oversight |
| `console.log` in production | 158 files | 🟡 Security/perf | Small-Medium | Replace with `lib/logger.ts` |
| Fire-and-forget promises | 4 locations | 🔴 Bug risk | Small | Notifications silently fail |
| `as any` / `as unknown as X` | 109 files | 🟡 Type safety | Large (ongoing) | Bypasses TypeScript safety |
| ESLint disables | 30+ | 🟢 Style | Trivial | Add explanation comments |
| Duplicated Excel parsing | 4 lib files | 🟡 Maintainability | Medium | Extract to shared utils |
| Missing API response types | 12+ routes | 🟡 Type safety | Medium | Create `lib/api-types.ts` |
| Hardcoded model names | 5+ files | 🟢 Maintainability | Trivial | Centralize in constants |

### Fire-and-Forget Promise Locations

These operations may silently fail without user feedback:

| File | Lines | Operation |
|------|-------|-----------|
| `app/api/tasks/[id]/comments/route.ts` | 90-161 | Mention notifications |
| `app/api/tasks/[id]/route.ts` | 126+ | Task update notifications |
| `app/api/procurement/bulk/route.ts` | 163-164 | Batch insert fallback |

**Fix:** Either await critical operations or add a background job queue with retry logic.

### Design System Issues

| Issue | Location | Fix |
|-------|----------|-----|
| Input focus styling inconsistency | Login page vs rest of app | Standardize to `focus:ring-1 focus:ring-gold-500/50` |
| Status colors not tied to CSS vars | `PRIORITY_STYLES`, `STATUS_STYLES` | Bind to design system custom properties |
| Empty state icon sizes vary | Documents: `h-8 w-8`, Applications: `h-10 w-10` | Standardize on `h-12 w-12` |
| Loader styles differ | Root spinner vs Lucide `Loader2` | Unify to one pattern |
| Non-standard status colors | Gray/orange/blue in priority badges | Map to design system palette |

### Catch-All Error Handler Doesn't Discriminate

**File:** `lib/api-utils.ts:48-51`

```typescript
} catch (err) {
  logger.error({ err, route: req.nextUrl.pathname }, 'Unhandled API error')
  return apiError('INTERNAL_ERROR', 'Something went wrong', 500)
}
```

All errors return generic 500. Should detect validation errors (400), auth errors (401), not-found (404), and only use 500 for genuine server errors.

---

## Module Health Summary

| # | Module | Page | Status | Readiness | Key Gap |
|----|--------|------|--------|-----------|---------|
| 1 | Auth / Login | `/login`, `/admin/people` | 🟢 Solid | 95% | Password reset, 2FA |
| 2 | Daily Briefing | `/` | 🟢 Solid | 100% | — |
| 3 | Tasks / War Room | `/tasks` | 🟢 Solid | 95% | Calendar sync, task dependencies |
| 4 | Agency Intel Overview | `/intel` | 🟢 Solid | 100% | — |
| 5 | GPL Deep Dive | `/intel/gpl` | 🟢 Solid | 90% | Forecast UI polish, auto-alerts |
| 6 | CJIA Analytics | `/intel/cjia` | 🟡 Incomplete | 80% | Incident tracking, forecasting |
| 7 | GWI Metrics | `/intel/gwi` | 🟡 Incomplete | 85% | Complaint SLA, root cause analysis |
| 8 | GCAA Compliance | `/intel/gcaa` | 🟡 Incomplete | 75% | Audit trail, corrective actions |
| 9 | Pending Applications | `/intel/pending-applications` | 🟢 Solid | 95% | Email notifications, SLA timers |
| 10 | Oversight Dashboard | `/oversight` | 🟢 Solid | 95% | Async recalculate UI feedback |
| 11 | PSIP Projects | `/projects` | 🟢 Solid | 95% | Excel upload integration |
| 12 | Project Detail | `/projects/[id]` | 🟢 Solid | 95% | Email on escalation |
| 13 | Delayed Projects | `/projects/delayed` | 🟢 Solid | 100% | — |
| 14 | Budget 2026 | `/budget` | 🟡 Incomplete | 85% | Variance tracking, year-over-year |
| 15 | Documents | `/documents` | 🟢 Solid | 85% | Preview rendering, cross-module links |
| 16 | Document Viewer | `/documents/[id]` | 🟡 Incomplete | 70% | PDF works; DOCX/OCR fail |
| 17 | Meetings | `/meetings` | 🟡 Incomplete | 70% | Audio transcription, task sync |
| 18 | Calendar | `/calendar` | 🟢 Solid | 95% | Recurring event editing |
| 19 | Procurement | `/procurement` | 🟡 Incomplete | 85% | Notifications, NPTAB validation |
| 20 | Applications | `/applications` | 🟡 Incomplete | 80% | Email on status change, SLA tracking |
| 21 | Upload Portal | `/upload/pending-applications` | 🟡 Incomplete | 70% | Async processing, template download |
| 22 | Admin Settings | `/admin` | 🟢 Solid | 100% | — |
| 23 | People Management | `/admin/people` | 🟢 Solid | 100% | — |
| 24 | Agency Management | `/admin/agencies` | 🟡 Incomplete | 70% | Verify stats endpoints, edit flow |
| 25 | Service Connections | (library only, no page) | 🟡 Incomplete | 60% | No UI page — lib functions only |
| 26 | Agency Projects | `/projects/agency/[agency]` | 🟢 Solid | 100% | — |

### Cross-Cutting Strengths

1. **Auth & Permissions** — NextAuth v5 + granular module-level permissions, well-architected
2. **Data Integration** — Seamless Supabase + PostgreSQL split with View-As support
3. **AI Integration** — Claude-powered summaries on projects, meetings, budgets, well-cached
4. **Agency Scoping** — Consistent role-based filtering across all modules
5. **Design System** — Dark navy + gold theme applied consistently, good responsive design
6. **No SQL Injection** — All queries use parameterized queries or Supabase query builders

### Cross-Cutting Weaknesses

1. **Email Notifications** — Infrastructure exists but not wired to most status changes
2. **Document Preview** — PDF works; DOCX/XLSX fail; no OCR for scanned documents
3. **Forecasting** — GPL has it; CJIA/GWI/GCAA don't
4. **SLA Tracking** — No timers/alerts for "stuck" items (applications pending > 30d, etc.)
5. **Audio/Media** — Meetings accept transcripts only; no audio transcription or playback

---

## Database Table Map

### Core User & Auth (8 tables)

| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `users` | User accounts | ❌ NO | id, email, name, role, agency, is_active, status |
| `roles` | Role definitions (People module) | ❌ NO | name, display_name, hierarchy_level |
| `core_permissions` | Permission catalog | ❌ NO | name, resource, action, is_admin_only |
| `role_permissions` | Role ↔ Permission mapping | ❌ NO | role_id (FK), permission_id (FK) |
| `object_ownership` | Object owner tracking | ❌ NO | object_type, object_id, owner_user_id (FK) |
| `object_access_grants` | Granular access grants | ❌ NO | user_id (FK), object_type, access_level |
| `activity_logs` | Audit trail | ❌ NO | user_id (FK), action, changes (JSONB) |
| `invitation_tokens` | User invite tokens | ❌ NO | email, token, role_id (FK), expires_at |

### Task Management (5 tables)

| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `tasks` | Main task store | ✅ YES | title, status, priority, due_date, owner_user_id |
| `task_templates` | Recurring task patterns | ❌ NO | name, agency_slug, checklist (JSONB) |
| `task_activity` | Task change log | ❌ NO | task_id (FK), action, old_value, new_value |
| `task_comments` | Task comments | ❌ NO | task_id (FK), user_id (FK), content |
| `task_subtasks` | Task subtasks | ❌ NO | task_id (FK), title, done |

### Project Oversight (6 tables)

| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `projects` | PSIP project data | ✅ YES | project_id, executing_agency, contract_value, health |
| `project_notes` | Project notes | ✅ YES | project_id (FK), note_text, note_type |
| `project_summaries` | AI-generated summaries | ✅ YES | project_id (FK), summary (JSONB) |
| `saved_filters` | User saved filter presets | ✅ YES | user_id (FK), filter_params (JSONB) |
| `project_progress_details` | Progress tracking | ✅ YES | project_id (FK), expected/actual progress |
| `funding_distributions` | Funding breakdown | ✅ YES | project_id (FK), amount_distributed/expended |

### Meetings (6 tables — 4 deprecated)

| Table | Purpose | RLS | Status |
|-------|---------|-----|--------|
| `meetings` | Current meeting data | ❌ NO | **ACTIVE** |
| `meeting_actions` | Extracted action items | ❌ NO | **ACTIVE** |
| `meeting_minutes` | Old schema | ❌ NO | **DEPRECATED** |
| `meeting_action_items` | Old schema | ❌ NO | **DEPRECATED** |
| `meeting_recordings` | Old schema | ❌ NO | **DEPRECATED** |
| `draft_action_items` | Old schema | ❌ NO | **DEPRECATED** |

### Documents (3 tables)

| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `documents` | Document store | ✅ YES | filename, title, summary, document_type, agency |
| `document_chunks` | Search chunks | ❌ NO | document_id (FK), chunk_index, content |
| `document_queries` | Q&A history | ❌ NO | document_id (FK), question, answer |

### Notifications (3 tables)

| Table | Purpose | RLS | Key Columns |
|-------|---------|-----|-------------|
| `notifications` | Notification inbox | ✅ YES | user_id, type, title, body, read_at |
| `notification_preferences` | User prefs | ✅ YES | user_id (PK), digest_frequency, quiet_hours |
| `push_subscriptions` | Web push endpoints | ❌ NO | user_id, endpoint, keys_p256dh |

### Agency Intel (12 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `gwi_monthly_reports` | GWI monthly data | ❌ NO |
| `gwi_weekly_reports` | GWI weekly complaints | ❌ NO |
| `gwi_uploaded_files` | GWI upload tracking | ❌ NO |
| `gwi_ai_insights` | GWI AI analysis | ❌ NO |
| `cjia_monthly_reports` | CJIA monthly data | ❌ NO |
| `cjia_ai_insights` | CJIA AI analysis | ❌ NO |
| `gcaa_monthly_reports` | GCAA monthly data | ❌ NO |
| `gcaa_ai_insights` | GCAA AI analysis | ❌ NO |
| `agency_health_snapshots` | Mission Control health | ✅ YES |
| `kpi_alerts` | KPI threshold alerts | ✅ YES |
| `gpl_snapshots` | GPL service connection snapshots | ✅ YES |
| `gpl_outstanding` | GPL outstanding connections | ✅ YES |

### Customer Applications (6 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `customer_applications` | Application records | ✅ YES (agency scoped) |
| `customer_application_documents` | Application docs | ✅ YES (agency scoped) |
| `customer_application_activity_log` | Audit trail | ✅ YES (agency scoped) |
| `customer_application_notes` | Notes/comments | ✅ YES (agency scoped) |
| `pending_applications` | Import-only data | ❌ NO |
| `pending_application_snapshots` | Import tracking | ❌ NO |

### Procurement (5 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `procurement_packages` | Procurement items | ✅ YES (agency + DG) |
| `procurement_stage_history` | Stage transitions | ✅ YES (agency + DG) |
| `procurement_documents` | Package documents | ✅ YES (agency + DG) |
| `procurement_notes` | Package notes (immutable) | ✅ YES (agency + DG) |
| `procurement_import_batches` | Bulk upload tracking | ❌ NO |

### Module Access (2 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `modules` | Module registry | ✅ YES |
| `user_module_access` | Per-user module grants | ✅ YES |

### AI & Integration (5 tables)

| Table | Purpose | RLS |
|-------|---------|-----|
| `ai_chat_sessions` | Conversation history | ❌ NO |
| `ai_response_cache` | Response cache | ❌ NO |
| `ai_usage_log` | Token usage tracking | ❌ NO |
| `ai_metric_snapshot` | Briefing cache | ❌ NO |
| `integration_tokens` | Google OAuth tokens | ✅ YES |

---

## RLS Security Audit

### Summary

| Category | Count |
|----------|-------|
| Tables WITH RLS | 31 |
| Tables WITHOUT RLS (need fixing) | 12 critical |
| Tables WITHOUT RLS (acceptable) | ~15 (agency metrics, AI cache — low risk) |
| Orphaned tables | 8 |

### Policy Quality Issues

**Issue 1: JWT Path Inconsistency**
- Some tables use `auth.jwt()->>'userId'` (procurement, customer_applications)
- Others use `auth.uid()` (tasks, saved_filters)
- Others use `auth.role()` (notifications)

**Recommendation:** Standardize to `auth.uid()` with role lookup from users table.

**Issue 2: GPL Write Policies Too Permissive**
All GPL tables allow `USING (true) WITH CHECK (true)` for authenticated users — any officer can insert/update/delete GPL data.

**Issue 3: Missing RLS on User Settings**
`user_settings` and `push_subscriptions` have no RLS, allowing any user to see/modify others' settings and enumerate device endpoints.

---

## Index & Query Performance

### Existing Indexes (Good Coverage)

| Table | Indexed Columns |
|-------|----------------|
| `tasks` | owner_user_id, assigned_by, status, due_date, agency |
| `projects` | sub_agency, region, completion, end_date, project_status |
| `notifications` | user+unread, user+scheduled, dedup, recipient+created |
| `customer_applications` | agency, status, created_by, submitted_at |
| `procurement_packages` | agency, stage, submitted_by, created_at |
| `activity_logs` | user_id, object, created_at, action |

### Missing Indexes (Recommended)

```sql
-- Common task filter (briefing + task board)
CREATE INDEX idx_tasks_agency_status_due ON tasks (agency, status, due_date DESC NULLS LAST);

-- Notification inbox performance
CREATE INDEX idx_notifications_user_unread_created ON notifications (user_id, read_at, created_at DESC) WHERE read_at IS NULL;

-- Document search pattern
CREATE INDEX idx_documents_agency_type ON documents (agency, document_type);

-- Procurement pipeline view
CREATE INDEX idx_procurement_stage_agency ON procurement_packages (current_stage, agency);

-- Application list filtering
CREATE INDEX idx_customer_app_status_agency ON customer_applications (status, agency);
```

### N+1 Query Patterns

**No N+1 issues found.** All API routes use either:
- Single queries with Supabase joins (`select('*, owner:users!fk(id, name)')`)
- Parallel `Promise.all()` for independent fetches

### Query Anti-Patterns

**Procurement Bulk Insert Fallback** (`app/api/procurement/bulk/route.ts:163-164`)
If batch insert fails, falls back to one-by-one serial inserts. Better: identify constraint violation first, or use UPSERT.

---

## UX & Frontend Polish Audit

### Loading States

| Status | Pages |
|--------|-------|
| ✅ Has `loading.tsx` | `/intel`, `/tasks`, `/oversight`, `/projects`, `/budget`, `/documents`, `/meetings` |
| ❌ Missing `loading.tsx` | `/admin`, `/admin/people`, `/calendar`, `/procurement`, `/applications` |

### Empty States

| Status | Component |
|--------|-----------|
| ✅ Good | `/documents` ("No documents yet"), `/applications` ("No applications found"), `ProcurementKanban` |
| ❌ Missing | `/admin/people`, `/budget`, `/meetings`, `/oversight`, `KanbanBoard` columns |

### Error States

Excellent coverage — `ErrorBoundary`, `SegmentError` components, per-route `error.tsx` files for all major routes.

### Accessibility

| Status | Area |
|--------|------|
| ✅ Good | ARIA labels on modals, `aria-current="page"`, `aria-modal="true"`, keyboard shortcuts |
| ⚠️ Gaps | Kanban drag-drop (no ARIA for draggable items), forms missing `aria-invalid`/`aria-describedby`, some dynamic content lacks ARIA |

### Mobile

| Status | Area |
|--------|------|
| ✅ Good | Responsive grids, BottomNav for mobile, collapsible sidebar, touch targets on most buttons |
| ⚠️ Gaps | Icon buttons < 44px, OversightTable mobile fallback unclear, OversightFilters fixed widths |

---

## Code Quality Findings

### By Severity

#### Bug Risk (6 items)

1. Missing `JSON.parse` try-catch in oversight route
2. Briefing route assumes sibling responses are OK
3. Null FK join in task comments route
4. Missing CASCADE DELETE on task sub-tables
5. Fire-and-forget promises (4 locations — notifications silently fail)
6. Unsafe type assertion in GPL enhanced forecast

#### Tech Debt (10 items)

1. 139+ `any` type usages across codebase
2. 158 files with `console.log` instead of structured logger
3. Inconsistent error handling patterns across API routes
4. 109 files with `as any` / `as unknown as X` bypasses
5. Untyped function parameters in critical paths
6. Missing interface definitions for API responses
7. 30+ ESLint disables without explanations
8. Duplicated Excel parsing logic (4 modules)
9. Catch-all error handler returns 500 for all errors
10. Mixed promise patterns (`.then()` chains vs `async/await`)

#### Nitpicks (4 items)

1. Hardcoded model names in 5+ files
2. Over-generic types in oversight (`delayed: any[]`, `overdue: any[]`)
3. Inconsistent state management styles in comments
4. Empty state icon sizes vary across pages

---

## Recommended Execution Order

### Sprint 1: Security (1-2 days)
1. RLS migration for `users`, `push_subscriptions`, task sub-tables, people module tables
2. CASCADE DELETE migration for `task_activity`, `task_comments`, `task_subtasks`
3. Restrict GPL write policies to `service_role`
4. Fix SSL `rejectUnauthorized` in `db-pg.ts`
5. Fix JSON.parse try-catch in oversight route
6. Fix briefing route response validation

### Sprint 2: Quick Polish (1 day)
1. Add `loading.tsx` to 5 missing pages
2. Replace `console.log` with logger in top 20 files
3. Standardize empty states (5 pages)
4. Centralize AI model name constant
5. Fix touch targets on icon buttons
6. Add required field indicators to forms

### Sprint 3: Cross-Module Connections (2 days)
1. Meetings → Tasks auto-creation (QW1 + MW1)
2. Document linking infrastructure (MW2)
3. "Create Task from Meeting Action" button
4. Overdue tasks badge on Sidebar

### Sprint 4: Type Safety (1-2 days)
1. Define critical interfaces (`RawProjectRow`, `OversightProject`, etc.)
2. Replace top 50 `any` usages in project-queries, parsers, oversight
3. Create `lib/api-types.ts` for API response types
4. Standardize error handling with `withErrorHandler()`

### Sprint 5: Performance & Cleanup (1 day)
1. Add 5 composite database indexes (migration)
2. Drop 8 orphaned tables (migration)
3. Reduce PostgreSQL pool size
4. Extract duplicated Excel parsing to shared utils

---

*Generated by Claude Opus 4.6 — 5 parallel analysis agents, ~400+ files audited*
