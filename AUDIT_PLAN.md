# DG Work OS — Agency User UX Audit

## Context

The app was built DG-first. Agency user paths (agency_admin, officer) have never been tested end-to-end. This audit systematically verifies every module from the perspective of 4 test accounts — surfacing permission bugs, data leaks, broken UIs, and missing functionality.

---

## Permission Architecture (from code review)

### Roles
| Role | Scope | Module Access | Edit Access |
|------|-------|---------------|-------------|
| `dg` | All data | All modules | All modules |
| `minister` / `ps` / `parl_sec` | All data | All modules | All modules |
| `agency_admin` | Own agency | All except people/settings/applications | View-only (canEdit=false) |
| `officer` | Own agency (tasks: own only) | Same as agency_admin | Same + cannot assign tasks |

### Module Access System (Two-Tier)
1. **Role defaults** — `modules.default_roles` array. All modules except `people`, `settings`, `applications` include all 6 roles.
2. **Per-user overrides** — `user_module_access` table with `access_type` (grant/deny) and `can_edit` boolean.
3. **Ministry bypass** — Ministry roles skip module checks entirely (always canView=true, canEdit=true).

### Agency Scoping per Module
| Module | Scoping | Mechanism |
|--------|---------|-----------|
| Tasks | officer=own tasks, agency_admin=agency, ministry=all | API: `.eq('owner_user_id')` or `.ilike('agency')` |
| Projects | Agency-scoped for non-ministry | API: `getViewAsAgencyScope()` |
| Documents | Agency + untagged for non-ministry | API: `.or('agency.ilike.${scope},agency.is.null')` |
| Procurement | Agency-scoped for non-ministry | API: `getPackagesByAgency(agencyFilter)` |
| Budget | NO scoping — everyone sees everything | No filter applied |
| Meetings | NO scoping — everyone sees everything | No filter applied |
| Intel | NO scoping — everyone sees all agencies | By design |
| Oversight | NO data scoping; upload restricted to dg/ps | `canUpload = role === 'dg' \|\| role === 'ps'` |
| Admin | Ministry-only access | Module default_roles = ['dg','minister','ps'] |

### Key Files
- `lib/auth-helpers.ts` — `requireRole()`, `canAccessAgency()`, `canUploadData()`, `canAssignTasks()`
- `lib/modules/access.ts` — `getUserModulePermissions()`, grant/deny/default logic
- `components/layout/ModuleGate.tsx` — Client-side route-to-module gating
- `components/layout/Sidebar.tsx` — Role-aware nav filtering via `useModuleAccess()`
- `hooks/useModuleAccess.ts` — Client hook for `canAccess()` / `canEdit()`

---

## Test Accounts

**File:** `supabase/migrations/075_audit_test_accounts.sql`
**Password for all:** `TestAudit2026!`

| Account | Role | Agency | Purpose |
|---|---|---|---|
| test.gpl.manager@mpua.gov.gy | agency_admin | GPL | Highest project value agency |
| test.gwi.manager@mpua.gov.gy | agency_admin | GWI | Most projects (13) |
| test.heci.analyst@mpua.gov.gy | officer | HECI | Most restricted role |
| test.marad.manager@mpua.gov.gy | agency_admin | MARAD | Smaller agency |

**Pre-requisite:** Run migration 075 against production Supabase before testing. It's idempotent (`ON CONFLICT DO UPDATE`).

---

## Pre-Audit Findings (from code review alone)

### BUG 1: ModuleGate missing 5 route mappings
**File:** `components/layout/ModuleGate.tsx:12-28`

`ROUTE_MODULE_MAP` does NOT include entries for:
- `/projects`, `/projects/*`
- `/airstrips`, `/airstrips/*`
- `/pulse/gpl/grid-health`
- `/intel/heci`
- `/intel/marad`

**Impact:** Any authenticated user can access these pages via direct URL even if their module access is denied. The page shell renders; only API-level auth prevents data access.

### BUG 2: `grid-health` module not registered in DB
No migration inserts `grid-health` into the `modules` table. The sidebar checks `canAccess('grid-health')` which always returns false for non-ministry users (module not found). Combined with BUG 1, the page is accessible via URL but hidden in sidebar.

### FINDING 3: Procurement scoping tighter than expected
`app/api/procurement/route.ts:17` — Agency users only see their own agency's procurement packages (`getPackagesByAgency(agencyFilter)`). This may be intentional or overly restrictive — needs product decision.

---

## Phase 3A: Module Access Audit

**4 sessions, ~57 screenshots**

For EACH test account:
1. Log in via credential form at `/login`
2. Screenshot home page after login
3. Screenshot full sidebar (expanded) — verify:
   - Main nav: 9 items (Mission Control, Intel, Tasks, Procurement, Oversight, Budget, Meetings, Calendar, Documents)
   - Agencies section: ONLY the user's own agency
   - Admin section: NOT visible
4. Navigate to every URL and screenshot:

| URL | Expected for agency_admin | Expected for officer |
|-----|--------------------------|---------------------|
| `/` | Loads (scoped briefing) | Loads (scoped briefing) |
| `/intel` | Loads (all agencies visible) | Loads |
| `/intel/gpl` | Loads | Loads |
| `/intel/gwi` | Loads | Loads |
| `/intel/cjia` | Loads | Loads |
| `/intel/gcaa` | Loads | Loads |
| `/intel/heci` | Loads (GAP: no ModuleGate) | Loads |
| `/intel/marad` | Loads (GAP: no ModuleGate) | Loads |
| `/tasks` | Loads (agency tasks) | Loads (own tasks only) |
| `/procurement` | Loads (agency packages) | Loads (agency packages) |
| `/oversight` | Loads (no upload btn) | Loads (no upload btn) |
| `/budget` | Loads (all data) | Loads (all data) |
| `/meetings` | Loads | Loads |
| `/calendar` | Loads (may show no-Google-auth) | Loads |
| `/documents` | Loads (agency + untagged) | Loads |
| `/projects` | Loads (GAP: no ModuleGate) | Loads |
| `/projects/delayed` | Loads (GAP: no ModuleGate) | Loads |
| `/airstrips` | Loads (GAP: no ModuleGate) | Loads |
| `/pulse/gpl/grid-health` | Loads? (GAP: no module + no gate) | Loads? |
| `/admin` | Access Denied → redirect | Access Denied → redirect |
| `/admin/people` | Access Denied → redirect | Access Denied → redirect |

**Bug = module that should be denied loads content, or module that should load shows Access Denied.**

---

## Phase 3B: Data Scoping Audit

**4 sessions, ~20 screenshots**

For each agency_admin (GPL, GWI, MARAD):
1. `/tasks` — verify ALL visible tasks belong to user's agency
2. `/projects` — verify ALL visible projects belong to user's agency
3. `/documents` — verify only agency + untagged docs visible
4. `/procurement` — verify only agency packages visible

For HECI analyst (officer):
1. `/tasks` — verify ONLY tasks owned by this specific user (not all HECI tasks)
2. `/projects` — verify only HECI projects
3. `/documents` — verify only HECI + untagged

Cross-checks (all accounts):
1. `/budget` — identical data for all users
2. `/meetings` — identical data for all users
3. `/intel` — all agencies visible for all users

**Bug = seeing data from another agency in a scoped module, or missing data in an unscoped module.**

---

## Phase 3C: Edit Permissions Audit

**4 sessions, ~18 screenshots**

| Action | GPL Mgr (agency_admin) | HECI Analyst (officer) |
|--------|----------------------|----------------------|
| Create task | YES (can assign within agency) | YES (self-assigned only, no assignee picker) |
| Edit task | Own/agency tasks | Own tasks only |
| Delete task | Own new tasks only | Own new tasks only |
| Create procurement tender | YES ("New Tender" visible) | NO (button hidden) |
| Upload oversight data | NO (button hidden — dg/ps only) | NO |
| Upload documents | YES (own agency) | YES (own agency) |
| Upload GPL data | Only if agency=GPL | NO |
| Edit project status | NO (canEdit=false) | NO |
| Access admin/people | NO (Access Denied) | NO |

Screenshot targets:
- Procurement header — "New Tender" visible/hidden?
- Task form — assignee picker visible/hidden?
- Oversight page — "Upload" button visible/hidden?
- Document vault — upload zone visible?

---

## Phase 3D: UI/UX Broken States Audit

**3 sessions, ~38 screenshots**

### Empty States (test accounts have no pre-seeded data)
| Page | Expected |
|------|----------|
| `/tasks` | Empty Kanban with CTA |
| `/documents` | "No documents yet" + upload prompt |
| `/procurement` | Empty pipeline |
| `/projects` | Empty list or "no projects" |
| `/meetings` | "No meetings found" |
| `/calendar` | No-Google-auth state |

### Responsive Breakpoints
4 pages (Home, Tasks, Procurement, Intel) x 3 widths (1024, 1440, 1920px) = 12 screenshots

### Navigation Highlighting
Each main page — verify correct sidebar item is highlighted.
- `/projects` has NO sidebar entry — what happens?
- `/intel/gpl` — does GPL sub-item highlight, or just Intel parent?

### Error Pages
- `/nonexistent` — styled 404?
- `/403` — styled Access Denied?

### Sidebar
- Collapsed state — icons + tooltips
- Mobile (375px) — hamburger menu

---

## Phase 3E: Workflow Completeness Audit

**4 sessions, ~18 screenshots**

### Workflow 1: Task Lifecycle (GPL Manager)
Create task → Open detail → Move to active → Complete

### Workflow 2: Procurement Tender (GPL Manager)
Click "New Tender" → Fill form → Submit → View in pipeline

### Workflow 3: Search & Filter (GPL Manager)
`/projects` search → Apply filter → `/documents` search

### Workflow 4: CSV Export (GPL Manager)
`/projects` → Export button → Verify download

### Workflow 5: Officer Restrictions (HECI Analyst)
Create self-assigned task → Verify no procurement create → Verify no oversight upload

---

## Totals

| Phase | Sessions | Screenshots | Focus |
|-------|----------|-------------|-------|
| 3A: Module Access | 4 | ~57 | Sidebar + URL access per account |
| 3B: Data Scoping | 4 | ~20 | Agency/user data isolation |
| 3C: Edit Permissions | 4 | ~18 | Create/edit/delete gating |
| 3D: UI/UX States | 3 | ~38 | Empty, loading, responsive, nav |
| 3E: Workflows | 4 | ~18 | End-to-end flows |
| **TOTAL** | **~12 browser sessions** | **~151** | |

---

## Risks & Blockers

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| 1 | Playwright MCP not connected | BLOCKER | Fix `.mcp.json` to use `@playwright/mcp` (not `@anthropic-ai/mcp-playwright`), restart |
| 2 | Test accounts not provisioned | BLOCKER | Run migration 075 in Supabase SQL Editor |
| 3 | Password hash mismatch | HIGH | Test login first; regenerate hash if needed |
| 4 | Empty data for test accounts | MEDIUM | Good for 3D; limits 3B. Can pre-seed via API |
| 5 | Calendar requires Google OAuth | LOW | Document no-auth state, skip calendar workflows |
| 6 | ModuleGate gaps (5 routes) | FINDING | Documented as pre-audit bug |
| 7 | grid-health module missing from DB | FINDING | Documented as pre-audit bug |
| 8 | Vercel rate limiting | LOW | 30s delays between navigations |
