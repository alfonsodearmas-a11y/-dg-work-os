# Phase 3B: Data Scoping Audit — Results

**Date:** 2026-04-13
**Accounts tested:** 4 (GPL Manager, GWI Manager, HECI Analyst, MARAD Manager)
**Screenshots captured:** 14
**Bugs found:** 1 confirmed (projects), 1 cosmetic (procurement tabs)

---

## Summary

Data scoping was verified across 5 modules: Projects, Documents, Procurement, Budget, and Intel. Three modules scope correctly (Documents, Procurement, Budget/Intel). One module has a confirmed data leak (Projects).

---

## Module-by-Module Results

### Projects — BROKEN (DATA LEAK)
**Severity:** HIGH
**Confirmed accounts:** All 4

The `/projects` page shows all 515 projects to every authenticated user regardless of role or agency. No agency filtering is applied.

**Root cause identified:** The `/api/projects/list` endpoint (used by the client page) trusts client-provided filter parameters without enforcing server-side agency scoping. In contrast, the `/api/projects/route.ts` endpoint correctly calls `getViewAsAgencyScope()` to enforce agency filtering.

Specifically:
- `/api/projects/list` — No session role/agency check, passes client `agencies` param directly to query
- `/api/projects/route.ts` — Calls `getViewAsAgencyScope(session, viewAsRole, viewAsAgency)` and enforces scope
- Client `page.tsx` line 865 — Initializes `agencies` as empty array, sends no filter to API if empty
- `project-queries.ts` line 369 — Only filters if `filters.agencies?.length` is truthy; empty = all data

**Fix:** `/api/projects/list` must enforce agency scoping server-side, mirroring `/api/projects/route.ts` logic.

**Evidence:**
- MARAD Manager sees 515 projects with GPL/GWI tags visible in table (`01-marad-projects-table.png`)
- Agency filter dropdown shows all agencies (`03-marad-projects-filters-expanded.png`)
- GPL Manager, GWI Manager, HECI Analyst all see same 515 projects (Phase 3A screenshots)

### Documents — CORRECT
**Confirmed accounts:** MARAD Manager, GPL Manager, HECI Analyst

- MARAD Manager: 1 document (MARAD-tagged) ✓
- GPL Manager: 0 documents (no GPL-tagged docs) ✓
- HECI Analyst: 0 documents (no HECI-tagged docs) ✓
- Cross-agency documents NOT leaked (MARAD doc not visible to GPL/HECI)

**Scoping mechanism:** API applies `.or('agency.ilike.${scope},agency.is.null')` — works correctly.

### Procurement — CORRECT (with cosmetic issue)
**Confirmed accounts:** HECI Analyst (officer)

**API scoping works correctly:**
- "All" filter → shows only HECI tenders ✓
- "GPL" filter → 0 tenders (can't see GPL data) ✓
- "MARAD" filter → 0 tenders (can't see MARAD data) ✓

**Cosmetic issue:** Agency filter tabs (All, GPL, GWI, HECI, CJIA, MARAD, GCAA, HAS) show all agencies for all users. Clicking non-own-agency tabs returns empty results. Not a security issue, but misleading UX — tabs should be limited to the user's own agency for non-ministry users.

### Budget — CORRECT (unscoped by design)
- HECI Analyst: G$139.98B total ✓
- GPL Manager: G$139.98B total ✓
- Identical data for all users — intentional, no scoping required

### Intel — CORRECT (unscoped by design)
- All 4 agencies visible for all users ✓
- By design — intel overview shows cross-agency health scores

### Meetings — API ERROR (not scoping-related)
- "Failed to fetch meetings" error for all users
- Functional bug, not a scoping issue

---

## Scoping Summary Matrix

| Module | Scoping Type | Status |
|--------|-------------|--------|
| Tasks | Agency (admin) / User (officer) | ✓ Correct (Phase 3A) |
| Projects | Agency (non-ministry) | **BROKEN** — shows all 515 |
| Documents | Agency + untagged | ✓ Correct |
| Procurement | Agency | ✓ Correct (API enforces) |
| Budget | None (by design) | ✓ Correct |
| Intel | None (by design) | ✓ Correct |
| Meetings | None (by design) | API error |
| Oversight | None (view) / DG+PS (upload) | ✓ Correct (Phase 3A) |

---

## Recommendations

1. **Critical fix:** Patch `/api/projects/list` to call `getViewAsAgencyScope()` and enforce the resulting scope before passing to `getProjectsList()`. Non-ministry users must only see their own agency's projects.
2. **UX improvement:** Filter procurement agency tabs to show only the user's own agency (or "All" showing only own data) for non-ministry users. Current behavior is confusing but not insecure.
3. **UX improvement:** Similarly, the projects Agency filter dropdown should be pre-populated with the user's agency and ideally restricted to it for non-ministry users.
