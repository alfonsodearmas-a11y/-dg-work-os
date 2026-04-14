# Agency User UX Audit — Full Summary

**Date:** 2026-04-13
**Duration:** Single session
**Accounts tested:** 4 (3 agency_admin, 1 officer)
**Total screenshots:** ~67
**Total bugs found:** 12

---

## Test Accounts

| Account | Role | Agency |
|---------|------|--------|
| test.gpl.manager@mpua.gov.gy | agency_admin | GPL |
| test.gwi.manager@mpua.gov.gy | agency_admin | GWI |
| test.heci.analyst@mpua.gov.gy | officer | HECI |
| test.marad.manager@mpua.gov.gy | agency_admin | MARAD |

---

## All Bugs — Priority Order

### CRITICAL (fix before next deploy)

| # | Bug | Phase | Severity |
|---|-----|-------|----------|
| 1 | **Task assignee dropdown shows ALL 17 system users** — officer/agency_admin can assign tasks to users in any agency | 3C | HIGH |
| 2 | **Task agency dropdown shows ALL 10 agencies** — not locked to user's own agency, defaults to "No Agency" | 3C | HIGH |
| 3 | **`/projects` shows all 515 projects unscoped** — `/api/projects/list` trusts client filters without enforcing `getViewAsAgencyScope()` | 3B | HIGH |
| 4 | **`/airstrips` exposes full edit controls** — Add Airstrip, Bulk Upload, Export CSV visible to all users including HECI officers | 3A | HIGH |

### MEDIUM (fix soon)

| # | Bug | Phase | Severity |
|---|-----|-------|----------|
| 5 | **ModuleGate missing 5+ route mappings** — `/projects`, `/airstrips`, `/pulse/gpl/grid-health`, `/intel/heci`, `/intel/marad` bypass client-side gating | 3A | MEDIUM |
| 6 | **`/projects/delayed` unscoped** — same data leak as `/projects` | 3A | MEDIUM |
| 7 | **Home "Open Applications" card → Access Denied** — GPL/GWI managers see clickable card linking to denied page | 3A | MEDIUM |
| 8 | **`grid-health` module not registered in DB** — sidebar `canAccess('grid-health')` always false | 3A | MEDIUM |

### LOW (improve when convenient)

| # | Bug | Phase | Severity |
|---|-----|-------|----------|
| 9 | **Projects "Upload Excel" visible to agency_admin** — should be hidden (canEdit=false) | 3C | LOW |
| 10 | **Procurement filter tabs show all agencies** — API correctly scopes, but tabs are misleading | 3B | LOW |
| 11 | **404 page unstyled** — white background clashes with dark theme | 3D | LOW |
| 12 | **No CSV export on projects page** — missing feature | 3E | LOW |

---

## What Works Correctly

| Area | Status |
|------|--------|
| Login via email+password | ✓ All 4 accounts |
| Sidebar shows only own agency | ✓ All 4 accounts |
| Admin pages denied for non-ministry | ✓ All 4 accounts |
| Role labels display correctly | ✓ Agency Manager / Analyst |
| Task data scoping (agency/user) | ✓ Correct |
| Document data scoping (agency + untagged) | ✓ Correct |
| Procurement API scoping | ✓ Correct (server enforces) |
| Budget unscoped (by design) | ✓ Identical for all |
| Intel unscoped (by design) | ✓ All agencies visible |
| Oversight upload hidden for non-DG/PS | ✓ Correct |
| Procurement "New Tender" hidden for officers | ✓ Correct |
| Access Denied page styling | ✓ Branded, with redirect |
| Mobile responsive (375px) | ✓ Excellent — bottom nav, hamburger |
| Tablet responsive (1024px) | ✓ Good |
| Navigation highlighting | ✓ Correct active states |
| Standup Digest AI feature | ✓ Works for agency users |
| Mission Control agency scoping | ✓ Shows only own agency data |

---

## Fix Priority Recommendations

### Immediate (1-2 hours)

1. **Task form scoping** — Scope the Assignee `<select>` to only show users from the current user's agency. For officers, remove the dropdown and auto-assign to self. Scope the Agency `<select>` to lock to the user's own agency.

2. **Projects list API** — In `/api/projects/list`, add the same `getViewAsAgencyScope()` call that exists in `/api/projects/route.ts`. Enforce the resulting scope before passing to `getProjectsList()`.

3. **ModuleGate routes** — Add entries to `ROUTE_MODULE_MAP` in `components/layout/ModuleGate.tsx`:
   ```
   '/projects': 'projects',
   '/airstrips': 'airstrips',
   '/pulse/gpl/grid-health': 'grid-health',
   '/intel/heci': 'intel',
   '/intel/marad': 'intel',
   ```

4. **Airstrips access** — Add server-side role check on airstrip mutation APIs. Hide Add/Upload buttons for non-GCAA users.

### Short-term (next sprint)

5. Register `grid-health` module in the `modules` database table.
6. Hide "Open Applications" card for users without module access.
7. Hide "Upload Excel" on projects for users with `canEdit=false`.
8. Filter procurement agency tabs to own agency for non-ministry users.

### Low priority

9. Create custom 404 page matching dark theme.
10. Add CSV export to projects page.
11. Fix meetings API error.

---

## Phase Reports

- **Phase 3A** (Module Access): `audit-screenshots/phase3a/PHASE3A_REPORT.md`
- **Phase 3B** (Data Scoping): `audit-screenshots/phase3b/PHASE3B_REPORT.md`
- **Phase 3C** (Edit Permissions): `audit-screenshots/phase3c/PHASE3C_REPORT.md`
- **Phase 3D** (UI/UX States): `audit-screenshots/phase3d/PHASE3D_REPORT.md`
- **Phase 3E** (Workflows): `audit-screenshots/phase3e/PHASE3E_REPORT.md`
