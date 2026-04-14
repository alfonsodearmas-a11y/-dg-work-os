# Phase 3A: Module Access Audit — Results

**Date:** 2026-04-13
**Accounts tested:** 4 (GPL Manager, GWI Manager, HECI Analyst, MARAD Manager)
**Screenshots captured:** 35
**Bugs found:** 6 (2 security, 2 data scoping, 2 UX)

---

## Summary

All 4 test accounts can log in via email+password. The sidebar correctly shows only the user's own agency, hides admin links for non-ministry users, and displays the correct role label. Admin pages (`/admin`, `/admin/people`) properly deny access with a styled "Access Denied" page.

However, several routes bypass the ModuleGate access system entirely, exposing data and edit controls that agency users should not see.

---

## Bugs Found

### BUG 1 (SECURITY) — `/airstrips` exposes full edit controls to all authenticated users
**Severity:** HIGH
**Affected:** All 4 test accounts (any authenticated user)
**Details:** The `/airstrips` page loads for all users with full edit controls — "Add Airstrip", "Bulk Upload", and "Export CSV" buttons are visible and presumably functional. This page is GCAA-specific but has no ModuleGate mapping and no role-based UI gating. A GPL Manager or HECI Officer has no business accessing airstrip management.
**Root cause:** Missing entry in `ROUTE_MODULE_MAP` (ModuleGate.tsx) + no server-side role check on the airstrips API.
**Screenshots:** `gpl-manager/19-airstrips.png`, `gwi-manager/04-airstrips.png`, `heci-analyst/05-airstrips.png`

### BUG 2 (DATA SCOPING) — `/projects` shows all 515 projects unscoped
**Severity:** HIGH
**Affected:** All 4 test accounts
**Details:** The Project Tracker shows 515 Active Projects for every user regardless of agency. The API is supposed to scope via `getViewAsAgencyScope()` for non-ministry users, but the UI shows all agencies' project data. The "Upload Excel" button is also visible to all users.
**Root cause:** Missing entry in `ROUTE_MODULE_MAP` + possible API scoping bug (the `/projects` page may not be passing the agency filter to the API).
**Screenshots:** `gpl-manager/17-projects.png`, `gwi-manager/03-projects.png`, `heci-analyst/04-projects.png`

### BUG 3 (DATA SCOPING) — `/projects/delayed` shows all delayed projects unscoped
**Severity:** MEDIUM
**Details:** Same scoping issue as `/projects` — all delayed projects visible to all users, including CJIA-specific projects shown to GPL/GWI/HECI/MARAD users.
**Screenshot:** `gpl-manager/18-projects-delayed.png`

### BUG 4 (UX) — Home page links to `/applications` which is Access Denied
**Severity:** MEDIUM
**Affected:** GPL Manager, GWI Manager (not HECI/MARAD — they don't have the card)
**Details:** The Mission Control home page shows a clickable "Open Applications" card (e.g., "GPL: 5112 pending") that links to `/applications`. Clicking it shows "Access Denied". The card should either be hidden for users without access, or the module should be granted.
**Screenshot:** `gpl-manager/23-applications.png`

### BUG 5 (SECURITY) — Procurement agency filter tabs visible to all users
**Severity:** LOW
**Affected:** HECI Analyst (officer) confirmed; likely all non-ministry users
**Details:** The Procurement Pipeline page shows agency filter tabs (All, GPL, GWI, HECI, CJIA, MARAD, GCAA, HAS) for the officer role. While the API may still scope data correctly, the UI implies the officer can browse other agencies' procurement data. Needs verification whether clicking other agency tabs actually returns data.
**Screenshot:** `heci-analyst/03-procurement.png`

### BUG 6 (CONFIRMED PRE-AUDIT) — ModuleGate missing 5+ route mappings
**Severity:** MEDIUM
**Details:** Pre-audit finding confirmed via browser testing. The following routes have NO ModuleGate mapping, meaning any authenticated user can access them via direct URL:
- `/projects`, `/projects/*`
- `/airstrips`, `/airstrips/*`
- `/pulse/gpl/grid-health`
- `/intel/heci`
- `/intel/marad`
- `/applications` (has its own Access Denied, but not via ModuleGate)

---

## Correct Behaviors Verified

| Check | Result |
|-------|--------|
| Sidebar shows only own agency | ALL 4 accounts ✓ |
| Admin section hidden in sidebar | ALL 4 accounts ✓ |
| `/admin` redirects to home | ALL 4 accounts ✓ |
| `/admin/people` shows Access Denied page | ALL 4 accounts ✓ |
| Home page scoped to own agency | ALL 4 accounts ✓ |
| Tasks scoped to own agency (agency_admin) | GPL (14 tasks), GWI (7 tasks), MARAD (13 tasks) ✓ |
| Tasks scoped to own user (officer) | HECI (0 tasks — correct, new user) ✓ |
| Intel overview shows all agencies | ALL 4 accounts ✓ (by design) |
| Budget shows all data | ALL 4 accounts ✓ (by design) |
| Oversight — no upload button | ALL 4 accounts ✓ |
| Procurement — "New Tender" hidden for officer | HECI ✓ |
| Procurement — "New Tender" visible for agency_admin | GPL ✓ |
| Role label displays correctly | "Agency Manager" for agency_admin, "Analyst" for officer ✓ |

---

## Per-Account Access Matrix

| URL | GPL Mgr | GWI Mgr | HECI Analyst | MARAD Mgr |
|-----|---------|---------|--------------|-----------|
| `/` (home) | ✓ GPL | ✓ GWI | ✓ HECI | ✓ MARAD |
| `/intel` | ✓ all | ✓ all | ✓ all | ✓ all |
| `/intel/gpl` | ✓ | ✓ | ✓ | ✓ |
| `/intel/gwi` | ✓ | ✓ | ✓ | ✓ |
| `/intel/cjia` | ✓ | ✓ | ✓ | ✓ |
| `/intel/gcaa` | ✓ | ✓ | ✓ | ✓ |
| `/intel/heci` | ✓ (no gate) | ✓ (no gate) | ✓ (no gate) | ✓ (no gate) |
| `/intel/marad` | ✓ (no gate) | ✓ (no gate) | ✓ (no gate) | ✓ (no gate) |
| `/tasks` | ✓ GPL 14 | ✓ GWI 7 | ✓ own 0 | ✓ MARAD 13 |
| `/procurement` | ✓ empty | ✓ | ✓ (no create) | ✓ |
| `/oversight` | ✓ no upload | ✓ | ✓ no upload | ✓ |
| `/budget` | ✓ all | ✓ all | ✓ all | ✓ all |
| `/meetings` | ✓ API err | ✓ | ✓ | ✓ |
| `/calendar` | ✓ | ✓ | ✓ | ✓ |
| `/documents` | ✓ empty | ✓ | ✓ | ✓ |
| `/projects` | **BUG** 515 all | **BUG** 515 all | **BUG** 515 all | — |
| `/projects/delayed` | **BUG** all | — | — | — |
| `/airstrips` | **BUG** edit | **BUG** edit | **BUG** edit | — |
| `/pulse/gpl/grid-health` | ✓ (no gate) | — | — | — |
| `/applications` | **DENIED** | — | — | — |
| `/admin` | ✓ redirect | — | — | — |
| `/admin/people` | ✓ denied | ✓ denied | ✓ denied | ✓ denied |

---

## Recommendations

1. **Immediate (Security):** Add `/airstrips` and `/projects` to `ROUTE_MODULE_MAP` in ModuleGate.tsx. Add server-side role checks on the airstrips API endpoints.
2. **Immediate (Data Scoping):** Verify the `/projects` API actually applies `getViewAsAgencyScope()` — the UI shows 515 projects for all users which suggests scoping isn't working.
3. **Short-term:** Register `grid-health` module in the modules database table. Add `/pulse/gpl/grid-health`, `/intel/heci`, `/intel/marad` to `ROUTE_MODULE_MAP`.
4. **Short-term:** Hide the "Open Applications" card on Mission Control for users without module access, or grant the `applications` module to agency users.
5. **Low priority:** Review procurement filter tabs — either scope the tab list to the user's agency or verify the API enforces scoping when different tabs are selected.
