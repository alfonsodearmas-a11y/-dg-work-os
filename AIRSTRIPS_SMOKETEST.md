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

## Coverage honesty
- **True browser E2E:** none (no harness in repo; not stood up per instruction).
- **Integration-level (stands in for E2E):** all route/auth/RPC/proxy checks above. The *rendered* UI (Needs
  Attention list, badges, modal interactions) is exercised only via the data/route layer it depends on, not a
  real browser — a gap to close with Playwright if/when a harness is added.
- **Live-DB-verified (not in the mocked vitest run):** photo storage_path shape; RPC atomicity. Re-runnable via
  the queries in this session's history.
