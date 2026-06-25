# Hinterland Airstrips — Debugging Pass: Bugs Found

**Date:** 2026-06-25
**Scope:** Read-only investigation of the existing Hinterland Airstrips module (no feature work).
**Method:** Reproduce → isolate → diagnose. All findings documented here **before** any fix.

## Module inventory (what is actually present)

- **Tables** (in `000_baseline_prod_schema.sql`, originally migrations `_archive/067,068,070,092`):
  `airstrips`, `airstrip_maintenance_log`, `airstrip_inspections`, `airstrip_photos`,
  `airstrip_status_log`, `airstrip_option_types`. FKs are `ON DELETE CASCADE` (logs/photos/inspections → airstrip)
  and `airstrip_photos.maintenance_log_id` is `ON DELETE SET NULL`. `airstrips.name` is `UNIQUE`.
- **API:** `app/api/airstrips/` — `route.ts` (list/create), `bulk/route.ts` (upsert + bulk status),
  `options/route.ts`, `[id]/route.ts`, `[id]/status`, `[id]/maintenance(+[logId])`,
  `[id]/inspections(+[inspectionId])`, `[id]/photos`.
- **UI:** `app/airstrips/page.tsx` (list), `app/airstrips/[id]/page.tsx` (detail + all modals inline),
  `components/airstrips/{AddEditAirstripModal,BulkUploadAirstripsModal,AirstripBulkActionBar}.tsx`.
- **Parsing:** `lib/airstrip-upload-parser.ts` + shared `lib/procurement/bulk-upload-parser.ts` (xlsx, `cellDates:true`).
- **Access:** `airstrips` module granted to `agency_manager` with agency **`HAS`** + `superadmin`
  (`lib/modules/role-modules.ts`). Akeem = `akeems@mpua.gov.gy`, agency `HAS` (confirmed live).
- **NOT present:** the described "maintenance-cadence" upgrade with `next_due_on` / `days_overdue` /
  Attention Queue. Those terms appear nowhere. "Overdue" is computed ad-hoc as "no inspection in 6 months."
  Derived-status is just the stored `airstrips.status` column; there is no status VIEW.

**Live data snapshot (prod `dg-command-center`):** 52 airstrips (operational:46, under_rehabilitation:4,
closed:1, unknown:1), 8 maintenance logs, 15 inspections, 104 photo rows, 11 status-log rows.
Integrity: 0 FK orphans, 0 quarter mismatches, 0 out-of-range dates, 0 null regions. Current data is clean —
most correctness bugs below are **latent** (they corrupt *future* writes / off-UTC runtimes / Guyana browsers).

**Superadmin hard-constraint check:** `alfonso.dearmas@mpua.gov.gy` = role `superadmin`, `is_owner=true`,
`agency=NULL`, active. No airstrip code path reads or writes the `users` table beyond storing
`*_by = session.user.id` FKs. **No code path can modify the superadmin.** Constraint holds. ✔

---

## Findings (severity order)

### B1 — [SECURITY / HIGH] No agency scoping on any airstrip API route
**Files:** all 9 route files in `app/api/airstrips/**` — every handler uses
`requireRole(['superadmin','agency_manager'])` and nothing else (16 call-sites, grep-confirmed).
`lib/auth-helpers.ts:22` `requireRole` checks the **role only**, never the agency. A scoped helper
`requireUploadRole(agency)` (and `canAccessAgency`/`canUploadData` in `lib/auth-roles.ts`) exists but is
**not used** by airstrips.

**What's wrong:** The `airstrips` module is granted in the UI only to `HAS` managers + superadmin
(`ModuleGate` / `role-modules.ts`), but the API enforces no such scope. The client gate and server gate
disagree — the server is strictly more permissive.

**Repro / impact (verified live):** 16 active `agency_managers` across 7 agencies; only **2** are `HAS`.
The other **14 non-Hinterland managers** (GPL/GWI/CJIA/GCAA/HECI/MARAD) are blocked in the UI but can still
`GET/POST/PATCH/DELETE /api/airstrips/*` directly — reading all airstrip data and mutating airstrips,
maintenance logs, statuses, inspections, and photos. Horizontal privilege escalation / broken access control.

**Proposed fix:** Add a shared `requireAirstripAccess()` in `lib/auth-helpers.ts` that returns the session
only if `superadmin` **or** (`agency_manager` && `canAccessModule(role, agency, 'airstrips')`, i.e. agency `HAS`).
Replace the 16 `requireRole([...])` calls in the airstrip routes with it. Additive, no schema change.

---

### B2 — [DATA INTEGRITY / HIGH] Bulk re-upload resets `status` to 'operational' and overwrites `created_by`
**File:** `app/api/airstrips/bulk/route.ts:74-94`
**What's wrong:** The upsert payload hardcodes `status: 'operational'` and `created_by: session.user.id`
for **every** row, then `.upsert(..., { onConflict: 'name' })`. On conflict (an existing airstrip — i.e. the
documented "re-upload the tracker" dedup path) PostgREST does `DO UPDATE` on **all** provided columns. So a
re-upload:
1. Resets every existing airstrip's `status` back to `operational`, silently wiping
   `closed` / `under_rehabilitation` / `limited` / `unknown` — **with no `airstrip_status_log` entry**.
2. Overwrites the original `created_by` with the re-uploader.
`status` is an operational state owned by the status workflow, not a tracker column.

**Repro / impact (verified live):** 6 airstrips currently carry a non-operational status
(1 closed, 1 unknown, 4 under_rehabilitation). Re-uploading the seed tracker silently reverts all 6.

**Proposed fix:** Split the operation using the existing-name snapshot already computed (lines 54-60):
INSERT new names with the full payload (status + created_by); for existing names, UPDATE only the
descriptive tracker fields + `updated_by` — **exclude `status` and `created_by`**. Additive, no schema change.

---

### B3 — [CORRECTNESS / MEDIUM] Excel serial dates mis-parsed into garbage far-future years
**File:** `lib/airstrip-upload-parser.ts:245-274` (`parseFlexibleDate`)
**What's wrong:** The generic `new Date(value)` branch (line 260) runs **before** the Excel-serial branch
(line 266). Empirically (`TZ` independent): `new Date("45000")` → a valid date in **year 45000**, whose
`getFullYear() (45000) >= 2000`, so line 261-262 returns `toISOString().slice(0,10)` =
`"+045000-01"` — garbage. The dedicated serial branch (which correctly yields `2023-03-15` for 45000)
is **dead code**. Reachable because `parseSpreadsheet` (`cellDates:true`) only converts *date-formatted*
cells to `Date`; cells formatted as **Number/General** arrive as raw serial strings (`"45000"`).

**Repro:** `parseFlexibleDate("45000")` → far-future garbage instead of `2023-03-15`.
Latent today (seed used `DD-MMM-YYYY`, which parses fine; 0 corrupt rows live) — corrupts a future tracker
whose inspection-date column is number-formatted.

**Proposed fix:** Move the Excel-serial check **before** the generic `new Date(value)` parse; gate the generic
parse to non-numeric strings and a sane year range (e.g. 2000–2100). No schema change.

---

### B4 — [CORRECTNESS / MEDIUM] Quarter computed via `new Date(dateStr).getMonth()` (UTC parse + local getters)
**Files (server):** `app/api/airstrips/[id]/maintenance/route.ts:58-60`,
`app/api/airstrips/[id]/maintenance/[logId]/route.ts:9`, `app/api/airstrips/[id]/route.ts:50-53`.
**Files (client):** `app/airstrips/[id]/page.tsx:84-87` (`getQuarter`, used for the modal "Quarter:" preview
and maintenance grouping).
**What's wrong:** `performed_date` is a date-only string (`"2026-01-01"`). `new Date("2026-01-01")` parses as
**UTC midnight**, but `.getMonth()`/`.getFullYear()` read **local** time. Empirically under `TZ=America/Guyana`
(UTC-4, the DG's timezone), `new Date("2026-01-01").getMonth()` → 11 (Dec) → **"Q4 2025"** instead of "Q1 2026"
(UTC gives the correct "Q1 2026"). Wrong by a quarter/year for every quarter-boundary date (Jan/Apr/Jul/Oct 1)
on any non-UTC runtime and in every Guyana browser.

**Repro:** `TZ=America/Guyana node -e 'd=new Date("2026-01-01");console.log(Math.ceil((d.getMonth()+1)/3))'` → 4.
Latent on UTC prod (0 live mismatches), but the **client** preview/grouping is already wrong in Guyana browsers,
and the stored quarter would be wrong if the runtime is ever non-UTC.

**Proposed fix:** Derive the quarter from the date **string** components (`YYYY-MM`), never via a `Date` object.
Add a client-safe `quarterFromISODate()` helper and use it on both server and client. For the "current quarter"
stat, derive "today" in Guyana local time (fixed UTC-4, no DST). No schema change; existing rows already match.

---

### B5 — [CORRECTNESS + UX / MEDIUM] Bulk-import client/server validation mismatch aborts the whole batch opaquely
**Files:** `lib/airstrip-upload-parser.ts:180-213` (transform) vs `app/api/airstrips/bulk/route.ts:12-28`
(`rowSchema`), driven by `components/airstrips/BulkUploadAirstripsModal.tsx:179,188-200`.
**What's wrong:** `transformRows` marks an unrecognized `surface_condition` / `flight_frequency` as a
**'warning'** (not 'error') while keeping the **raw string** value. The modal imports all rows where
`status !== 'error'` and sends the raw string. The server's `rowSchema` uses strict
`z.enum(SURFACE_CONDITIONS)` / `z.enum(FLIGHT_FREQUENCIES)`, so one such value makes the **entire atomic batch**
fail Zod with a generic `"Validation failed"` — **zero** rows imported, and the modal surfaces only the opaque
top-level error (no row/field detail).

**Repro:** A tracker row with surface condition e.g. "Fair" (not Good/Satisfactory/Poor) → whole upload rejected.

**Proposed fix:** In `transformRows`, when a value isn't recognized, set the field to `null` (keep the warning
issue text) so the payload is enum-valid and the descriptive raw value simply isn't stored. (Optionally have the
server return per-row Zod issues.) No schema change.

---

### B6 — [DATA INTEGRITY / MEDIUM] Photo upload orphans storage files and reports false success
**Files:** `app/api/airstrips/[id]/photos/route.ts:52-84`; maintenance modal `app/airstrips/[id]/page.tsx:960-971`.
**What's wrong:**
1. In the per-file loop, the storage upload (52-54) succeeds, then on DB-insert failure (76-79) the code
   `continue`s **without removing the just-uploaded file** → orphaned storage object.
2. If every file fails its DB insert, the route still returns `201 { photos: [] }` — a success status for a
   no-op.
3. The Log-Maintenance modal uploads verification photos with `await fetch(.../photos)` **and never checks
   `res.ok`** (line 966). A failed/partial photo upload is swallowed; the modal shows success
   (`onSaved()`/`onClose()`). If the upload *throws*, the `catch` alerts **"Failed to log maintenance"** even
   though the maintenance log was already saved → the user re-submits → **duplicate maintenance log**.

**Repro / impact (verified live):** The `airstrip-photos` bucket holds **105** objects but only **104** DB rows
(0 broken DB refs) — **1 orphaned file already exists**, matching path (1).

**Proposed fix:** On DB-insert failure, `remove()` the uploaded object before continuing; accumulate per-file
errors and return them (e.g. `{ photos, failures }`) with a non-2xx if nothing succeeded. In the modal, check the
photo-upload response and surface a precise "maintenance saved, but N photo(s) failed" message rather than a
blanket failure. (The 1 existing orphan can be removed as a one-off cleanup — flagged, not auto-deleted.)

---

### B7 — [LOW / OBSERVATION] `airstrip-photos` storage bucket is public with no storage RLS
**Evidence:** `storage.buckets` → `airstrip-photos public=true`; no `storage.objects` policy references it;
`getStorageUrl` (`app/airstrips/[id]/page.tsx:89`) builds `/object/public/...` URLs. Photos are therefore
world-readable by anyone who knows/guesses the path. Writes are safe (service-role only, via the API). This is a
design choice (signed-URL plumbing would be a feature change) — **flagged for confirmation, not changed in this pass.**

### B8 — [LOW] "Overdue inspection" cutoff uses server/client `new Date()` not Guyana-local
**Files:** `app/api/airstrips/route.ts:76-78`, `app/airstrips/[id]/page.tsx:77-82`. The 6-month cutoff is computed
from machine "now"; near midnight it can flip a day early/late vs Guyana local. Cosmetic ±1-day drift on a fuzzy
"overdue" flag. Can be folded into the B4 Guyana-today helper.

### B9 — [LOW] Parallel update + log writes can desync
**Files:** `app/api/airstrips/[id]/route.ts:149-167`, `[id]/status/route.ts:43-55`,
`bulk/route.ts:187-207`. Status update and `airstrip_status_log` insert run via `Promise.all`; a log failure is
either ignored (`[id]` PATCH) or 500s after the status already changed (`status` PATCH). Low likelihood; note only.

### B10 — [LOW / OBSERVATION] Stale RLS policy on `airstrip_option_types`
The `airstrip_option_types_write` policy keys on retired roles `'dg','minister','ps'` (baseline schema). App
writes go through the service role (RLS-bypassing), so the policy is dead. Cosmetic; note only.

---

## Fix plan (severity order)

1. **B1** (security) — shared `requireAirstripAccess()`, applied to all 16 airstrip handlers.
2. **B2** (data) — split bulk upsert into insert-new / update-existing (exclude status & created_by).
3. **B3** (correctness) — reorder/guard Excel-serial parsing.
4. **B4** (correctness) — string-based quarter helper (client+server) + Guyana-today.
5. **B5** (correctness/UX) — null-coerce unrecognized enum values in the parser.
6. **B6** (data/UX) — photo cleanup on DB failure + truthful response + modal partial-failure surfacing.
7. **B7/B8/B9/B10** — flagged; B8 folded into B4's helper. B7/B10 left as decisions for review.

Run `/simplify` after fixes. Commit. **Do not deploy until reviewed.**

---

## Resolution (applied 2026-06-25)

**Fixed (B1–B6):**
- **B1** — added `requireModuleAccess(slug)` + `requireAirstripAccess` (`lib/auth-helpers.ts`); all 18
  airstrip route handlers (9 files) now gate on superadmin / `HAS`-agency manager. 0 bare role checks remain.
- **B2** — `app/api/airstrips/bulk/route.ts` POST split into insert-new / update-existing; `status` and
  `created_by` are written on insert only, never on re-upload.
- **B3** — `lib/airstrip-upload-parser.ts` checks the Excel-serial branch before the generic `Date()` parse
  and converts in UTC. Verified: `"45000"` → `2023-03-15` (was garbage). Bare numbers outside range → null.
- **B4** — added TZ-safe `quarterFromISODate` / `guyanaToday` / `currentQuarter` (`lib/airstrip-types.ts`);
  wired into the maintenance POST, maintenance `[logId]` PATCH, the `[id]` detail route's current-quarter,
  and **all three** client quarter sites (list-page modal preview, detail-page `getQuarter`, and the
  detail-page `selectedQuarter` default — the last found during `/simplify`).
- **B5** — `transformRows` now nulls unrecognized `surface_condition` / `flight_frequency` (keeping the
  warning) so importable rows always satisfy the server's strict `z.enum`; one odd value no longer aborts
  the whole batch.
- **B6** — `photos` route removes the uploaded object when the DB insert fails (no more orphans), returns
  `failures[]`, and 502s when nothing saved; the Log-Maintenance modal surfaces a precise
  "N photo(s) failed" warning without mislabeling a saved log as failed.

**`/simplify` outcomes:** generalized the auth helper to `requireModuleAccess(slug)` (the `applications`
module hand-rolls the same gate 8×, can adopt it later); deduped the modal photo-warning string; fixed the
missed `selectedQuarter` quarter site. Kept the local Excel-serial parser (shared `parseExcelDate` only
handles *numeric* serials, not the *string* serials this pipeline produces — delegating would reintroduce the
year-45000 bug) and the airstrip-local quarter helpers (reconciling with `lib/nptab/period.ts`'s Intl/Date-based
quarter math is a refactor, out of scope).

**Verification:** `tsc --noEmit` clean on all touched files (8 remaining errors are pre-existing, in untouched
test files); `lib/modules/role-modules.test.ts` 10/10; date logic empirically validated under `TZ=America/Guyana`.

**Flagged, NOT changed (need your call / out of scope):**
- **B7** — `airstrip-photos` bucket is public. Making it private needs signed-URL plumbing (a feature change).
- **B8** — "overdue inspection" 6-month cutoff still uses machine `new Date()` (≤1-day drift at midnight).
- **B9** — parallel update+log writes can desync on a rare partial failure.
- **B10** — stale `airstrip_option_types` RLS policy references retired roles (dead; service-role writes bypass it).
- **1 orphaned storage file** already in the bucket (105 objects vs 104 rows). Safe to remove as a one-off
  cleanup — left for your go-ahead rather than auto-deleting.

Not deployed — awaiting review.
