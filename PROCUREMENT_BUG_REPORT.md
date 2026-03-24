## Bug Report: Add New Tender

### Flow Traced

1. **Entry**: "New Tender" button on `/procurement` page → opens `ProcurementNewPackageForm` SlidePanel
2. **Form fields**: Title (required), NPTAB No., Description, Procurement Method (required), Agency (required for DG only), Expected Delivery Date, Notes, Files
3. **Submit**: POST `/api/procurement` with JSON body → `requireRole(['dg', 'agency_admin'])` → validates fields → calls `createPackage()` from `lib/procurement-queries.ts`
4. **createPackage()**: Inserts into `procurement_packages` (via `supabaseAdmin`, bypasses RLS), then inserts stage history, then optional note
5. **Post-create**: Uploads files (if any) in parallel → toasts success/warning → calls `onCreated()` (increments `refreshTrigger`) → closes form

### Root Cause Found

**Case mismatch between stored agency values and validation constant.**

- The **People module** stores agencies as **lowercase** in the `users` table (e.g., `'gpl'`, `'cjia'`, `'has'`). This is because `UserRolesSection.tsx` and `MPUA_AGENCIES` in `people-types.ts` use lowercase `value` fields: `{ value: 'gpl', label: 'GPL' }`.
- The **API validation** in `POST /api/procurement` checks: `AGENCY_CODES.includes(packageAgency)` where `AGENCY_CODES = ['GPL', 'GWI', 'HECI', 'CJIA', 'MARAD', 'GCAA', 'HAS', 'MOPUA']` — **all uppercase**.
- For **agency_admin** users, `packageAgency = session.user.agency` which is lowercase (from the DB).
- Result: `AGENCY_CODES.includes('gpl')` → **false** → returns 400: "A valid agency is required".

**This means every agency_admin user is blocked from creating tenders.** Only DG can create, because DG picks from the `SELECTABLE_AGENCIES` dropdown which sends uppercase values.

Verified with live data: all agency_admin users have lowercase agencies (e.g., Kesh Nandlall → `'gpl'`, Ramesh Ghir → `'cjia'`).

### Secondary Issues Found

1. **Inconsistent agency casing in procurement_packages**: Tenders created by DG store uppercase agency (`'GPL'`), but if the fix only normalizes for validation and not storage, agency_admin-created tenders would store lowercase. The `fetchPackages` query uses `ilike` (case-insensitive) which masks this, but it's fragile.

2. **No agency_admin-specific error message**: The generic "A valid agency is required" doesn't help the user understand their agency configuration is the issue.

### Proposed Fix

1. **Normalize agency to uppercase** before validation AND before passing to `createPackage()` — ensures consistent storage and passes the `AGENCY_CODES` check regardless of session casing.
2. This is a one-line change in the API route: uppercase `packageAgency` before the check.
