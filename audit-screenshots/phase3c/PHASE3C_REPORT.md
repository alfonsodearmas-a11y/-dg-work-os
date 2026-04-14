# Phase 3C: Edit Permissions Audit — Results

**Date:** 2026-04-13
**Accounts tested:** 2 (HECI Analyst/officer, GPL Manager/agency_admin)
**Screenshots captured:** 7
**Bugs found:** 3 (2 security, 1 permission)

---

## Summary

The task creation form has systemic permission bugs — both the Agency and Assignee dropdowns are completely unscoped, showing all agencies and all system users regardless of the current user's role or agency. The Projects page also exposes an "Upload Excel" button to agency_admin users who should have view-only access.

---

## Bugs Found

### BUG 1 (SECURITY) — Task assignee dropdown shows ALL system users
**Severity:** HIGH
**Affected:** Both agency_admin and officer roles
**Details:** The "New Task" form's Assignee dropdown lists all 17 users across every agency:
- GPL users (Keisha Crighton, Kesh Nandlall, Test GPL Manager)
- GWI users (Christopher Vandeyar, Mark David, Test GWI Manager)
- CJIA users (Ramesh Ghir, Vashana Lall)
- MARAD users (Alicia Lyken, Stephen Thomas, Test MARAD Manager)
- GCAA users (Saheed Sulaman)
- HAS users (Akeem St. Louis)
- HECI users (Test HECI Analyst)
- Ministry-level users (Alfonso De Armas, Thandi McAllister)

**Expected behavior:**
- Officer: "Assign to me" only (no dropdown)
- Agency admin: "Assign to me" + users from own agency only

**Root cause:** The task creation form fetches all users without filtering by the current user's role or agency. The API endpoint returning the user list likely doesn't scope by agency.

**Screenshots:** `05-heci-assignee-dropdown.png`, `06-gpl-task-create-form.png`

### BUG 2 (SECURITY) — Task agency dropdown shows ALL agencies
**Severity:** MEDIUM
**Affected:** Both agency_admin and officer roles
**Details:** The "New Task" form's Agency dropdown shows all 10 agency options (GPL, GWI, HECI, CJIA, MARAD, GCAA, HAS, Hinterland, Ministry) and defaults to "No Agency" instead of the user's own agency.

**Expected behavior:**
- Officer: Locked to own agency (HECI), no dropdown
- Agency admin: Pre-set to own agency, possibly locked

**Combined impact with BUG 1:** An officer from HECI could create a task, assign it to a GPL user, and tag it as a MARAD task. This completely bypasses the intended agency isolation.

### BUG 3 (PERMISSION) — Projects "Upload Excel" visible to agency_admin
**Severity:** LOW
**Affected:** GPL Manager (agency_admin), likely all agency_admin users
**Details:** The Project Tracker shows an "Upload Excel" button for agency_admin users. Per the permission architecture, agency_admin users have `canEdit=false` for projects — they should only have view access.
**Screenshot:** `07-gpl-projects-edit-controls.png`

---

## Correct Behaviors Verified

| Check | Expected | Result |
|-------|----------|--------|
| Procurement "New Tender" visible for agency_admin | YES | ✓ GPL Manager |
| Procurement "New Tender" hidden for officer | YES | ✓ HECI Analyst |
| Oversight upload button hidden for agency_admin | YES | ✓ GPL Manager (Phase 3A) |
| Oversight upload button hidden for officer | YES | ✓ HECI Analyst (Phase 3A) |
| Document "Upload" visible for agency_admin | YES | ✓ GPL Manager (Phase 3A) |
| Document "Upload" visible for officer | YES | ✓ HECI Analyst (Phase 3A) |
| Admin/People access denied | YES | ✓ All accounts (Phase 3A) |
| Task "Add Task" button visible for both roles | YES | ✓ Both accounts |

---

## Recommendations

1. **Critical fix:** Scope the task Assignee dropdown:
   - Officer role: Remove dropdown entirely, auto-assign to self
   - Agency admin: Filter to only show users from own agency
   - API: Add agency filtering to the user list endpoint used by the task form

2. **Critical fix:** Scope the task Agency dropdown:
   - Officer role: Lock to own agency, no dropdown
   - Agency admin: Pre-set to own agency, ideally locked
   - Or remove the dropdown entirely and auto-set from the user's profile

3. **Low priority:** Hide "Upload Excel" button on Project Tracker for users with `canEdit=false`.
