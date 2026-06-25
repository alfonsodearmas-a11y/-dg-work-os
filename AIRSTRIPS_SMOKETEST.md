# Hinterland Airstrips — Automated Verification (Phases 0–1)

Branch `feature/airstrips-accountability`. Every manual smoke-check converted to an assertion.
Run: `TZ=America/Guyana npx vitest run lib/airstrips app/api/airstrips` → **32 tests, all green.**

No browser harness exists in this repo (no Playwright/Cypress), so the UI-behaviour checks are covered at
the **integration (route-handler) layer**, not as true browser E2E — flagged per check below. Integration
tests mock `@/lib/auth` + `@/lib/db` (the established repo convention); the DB-level guarantees that mocks
can't prove (data shape, RPC atomicity) are verified directly against the live schema **read-only or in a
rolled-back transaction** — prod is never mutated.

## Unit (warning engine + date math) — `lib/airstrips/__tests__/warnings.test.ts`, `queries.test.ts`
- ✅ Null `lastMaintenanceOn` → a **red, critical "no maintenance on record"** warning (asserts not-green,
  not-empty, severity critical) — the never-maintained case.
- ✅ Overdue strip → overdue warning with exact days-overdue (25). Upcoming strip (within window) → upcoming.
- ✅ Null interval override **inherits** the global default; an explicit override **uses its own** value
  (both via `resolveIntervalDays` and end-to-end via `augmentAirstrip`).
- ✅ Each warning carries contractor + manager names; missing either → `responsibilityIncomplete`.
- ✅ Date math asserted independent of host TZ: `guyanaToday(2026-10-01T01:00Z)='2026-09-30'`,
  `addDays`/`daysBetween` exact across month/quarter/year boundaries. Whole suite also run under
  `TZ=America/Guyana`.
- ✅ Changing a setting recomputes warnings against the new value (`augmentAirstrip`: 60→overdue, 120→clear).

## Integration — photo proxy (Phase 0) — `app/api/airstrips/[id]/photos/[photoId]/file/__tests__/route.test.ts`
- ✅ Authorized HAS manager + superadmin stream the object (200, `Content-Type` from blob, `Cache-Control: private`).
- ✅ Non-HAS, non-superadmin agency_manager → **403** (storage never touched).
- ✅ photoId not belonging to `[id]` in the path → **404** (the `.eq('airstrip_id', id)` filter).
- ✅ Unauthenticated → 401.
- ✅ **Static guard** (`storage-access.test.ts`): no airstrip source constructs `/object/public/airstrip-photos/`
  and none calls `createSignedUrl` (scans app/lib/components airstrip roots).
- ✅ **Live DB (read-only):** all 104 photo rows store a relative `storage_path` (e.g.
  `{uuid}/general/{ts}_Karisparu_1.jpeg`); **0** hold an absolute/public URL → migration 131 won't break any row.

## Integration — responsibility / settings / status
- ✅ **Cadence settings are superadmin-edit-only** (`settings/__tests__/route.test.ts`): superadmin PATCH 200;
  HAS manager PATCH **403** (denied before any write); HAS manager GET 200 (may view, not edit). *(This tightened
  the Phase 1 route, which had allowed HAS managers — the test is the spec.)*
- ✅ **Contractor management is HAS-allowed** (`contractors.test.ts`): HAS manager can list (200) and create (201).
- ✅ Contractor swap routes through the **atomic** `airstrip_assign_contractor` RPC; clear closes the open row.
- ✅ Status route and bulk route **both** change status through `airstrip_change_status` and write **no**
  `airstrip_status_log` directly (`status-atomic.test.ts`) — B9 cannot recur at the route layer.
- ✅ **Live DB (rolled-back `DO` block):** `airstrip_change_status` updates status **and** inserts exactly one
  log in one transaction; `airstrip_assign_contractor` reassignment closes the prior open row and leaves exactly
  **one** open assignment. Terminal `RAISE EXCEPTION 'ROLLBACK_OK'` reached (all asserts passed) → rolled back;
  confirmed 0 leftover rows.

## Part B — Migration 135 (B10) code-gated drop
- **Precondition (static search, repo-wide):** zero `insert/update/delete/upsert/rpc` on
  `airstrip_option_types` anywhere; the only DB touchpoint is the read-only options route via `supabaseAdmin`;
  the client hook reads through that API route; no anon/browser client touches the table. → service-role-only,
  policy is dead. Applied 135 alone.
- **Post-drop (live, rolled-back DO block):** `airstrip_option_types_write` gone (only `_read` remains); read
  works (34 rows); service-role write still works (insert landed, rolled back). 0 leftover rows.
- Residual risk noted: a dynamic writepath would require the literal table name, which appears only in the read
  route + a type comment + migrations — none is a write.

## Part C — Phase 2 PDF report (built with tests)
- ✅ `prepareAirstripReport` returns correct structured data for a known strip + range; default range = last
  12 months; `resolveReportRange`/`buildTrend`/`photoFormat` unit-tested (incl. chronological quarter sort).
- ✅ **Never-maintained strip** → `prepare` returns empty timeline/trend without throwing; `render` produces a
  valid PDF that says so.
- ✅ **Photos embedded as bytes, no URL layer:** `prepare` downloads via `storage.download()` (asserted
  `Buffer`, asserted `storage.download` called with the path); `render` proves real embedding by a PDF-size
  delta (a distinct image inflates the PDF — a skipped/corrupt image would not).
- ✅ Report route auth-gated: 403 non-HAS, 401 unauth, 404 missing strip, 200 `application/pdf` authorized.
- ✅ Static guard extended to `lib/pdf/airstrip-report-render.tsx` — no public/signed URL in the PDF path.

## Browser E2E (Playwright) — `npm run test:e2e` → 7/7 green against a real rendered build
Renders the real Next app in Chromium with a **bulletproof-gated** test session (`lib/e2e-auth.ts`, dead in any
production build) + fully-mocked APIs (no request reaches prod; a leak would fail the fixture-only assertions).
Screenshots in `e2e/screenshots/`.
- **List:** Needs-Attention section renders; the never-recorded strip appears **red in the actual DOM** with
  "responsibility unassigned"; the overdue strip names contractor + manager inline; queue counts match.
- **Detail:** page loads; **Maintenance Health** + **Responsibility** cards render; a photo **paints through the
  proxy** (`/api/airstrips/[id]/photos/[photoId]/file`, asserted `naturalWidth > 0`); **Generate Report** opens
  the PDF route with the chosen range; **contractor swap** updates the badge to the new contractor.
- **RBAC:** superadmin can open + edit **Cadence Settings**; the HAS agency_manager does **not** see the control.
- **Safety:** `lib/__tests__/e2e-auth.test.ts` asserts the gate is enabled only in non-prod-with-flag and **dead
  in production** even with the flag set.

## Coverage honesty
- **True browser E2E: now exists** (Playwright, 7 tests, real Chromium render of the real Next app). Closes the
  prior "no UI ever rendered" gap for the list, detail, report, contractor-swap, and RBAC surfaces, with
  screenshots as visual evidence.
- **What the browser E2E mocks:** the API layer (so no prod contact) and the photo *bytes* (a real PNG returned
  by the mocked proxy so the `<img>` paints). It therefore proves the UI **uses** the proxy URL and renders the
  image, but **not** the real private-bucket `storage.download()` round-trip.
- **UNVERIFIED-PENDING-DEPLOY:** the real private-bucket photo round-trip (Migration 131 applied + a real storage
  object served through the proxy in the deployed app). Not provable in the sandbox without paid
  branch+preview infra; covered by post-deploy human check #1 in `AIRSTRIPS_DEPLOY.md`. 131 is **not** flipped on
  prod.
- **Live-DB-verified (read-only / rolled-back, not in the mocked runs):** photo storage_path shape (0 baked
  URLs), one-open-contractor invariant, FK integrity, RPC atomicity, superadmin intact.
