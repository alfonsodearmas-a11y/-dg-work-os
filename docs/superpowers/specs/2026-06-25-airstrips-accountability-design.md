# Hinterland Airstrips — Storage Security, Warnings, Accountability & Reports

**Date:** 2026-06-25
**Branch:** `feature/airstrips-accountability` (off debug pass `6200398`)
**Status:** design — awaiting review before migrations/code

Builds on the debug pass: route access is scoped via `requireAirstripAccess`/`requireModuleAccess`
(`canAccessModule`, agency `HAS`); bulk import is insert/update split; Excel serial + quarter math are
TZ-safe (Guyana UTC-4) via `quarterFromISODate`/`guyanaToday`/`currentQuarter` in `lib/airstrip-types.ts`.

## Decisions (from the DG)

- **Photo access — proxy-stream, NOT signed URLs** (overrides the original spec). Match the
  documents/procurement convention: auth-gated route + `supabaseAdmin.storage.download()`, re-checking auth
  per request. Zero `createSignedUrl`. One storage pattern across the app. (See memory
  `feedback_storage_pattern_consistency`.)
- **Attention Queue** — enhance the existing `/airstrips` list (pinned "Needs Attention" section + filter +
  row/detail badges). No new route. No DG-briefing injection this task, but warning states are shaped so that
  injection is additive later.
- **Cadence config** — singleton settings table (mirrors `psip_nag_settings`) + nullable per-airstrip override.
  `airstrips.target_maintenance_interval_days` NULL = inherit global. **Do not seed per-row values** (null-inherit
  is what makes the global control real). No per-region/type tiers.
- **Payments — deferred.** Build contractors + responsibility history now; no payment tables. The report's
  payment section stays conditional (renders only once a payment model exists later).
- Editable by **superadmin + HAS `agency_manager`** (operational domain), gated by `requireAirstripAccess`.
- Plan gate: migrations applied only after approval; the one destructive change (B10) re-confirmed before running.

## Phase 0 — Lock down photo storage (proxy-stream)

- **Migration 131** `airstrip_photos_private`: set `airstrip-photos` bucket `public=false`; ensure
  `storage.objects` for the bucket has no anon/authenticated read policy (private → only the service role our
  API uses can read/write). Old public links stop resolving (intended).
- **New route** `GET /api/airstrips/[id]/photos/[photoId]/file`: `requireAirstripAccess` → load the photo row,
  assert `airstrip_id === [id]` → `supabaseAdmin.storage.from('airstrip-photos').download(storage_path)` →
  stream the blob with its content type and `Cache-Control: private, no-store`. Mirrors
  `app/api/procurement/[id]/documents/[docId]/route.ts`.
- Replace the 4 `getStorageUrl(...)` calls in `app/airstrips/[id]/page.tsx` (≈583/661/705/1409) with this route;
  **delete** the `getStorageUrl` helper. Log-Maintenance previews keep local `URL.createObjectURL` blob URLs.
- Verify: no remaining code constructs a raw `/object/public/airstrip-photos/...` URL.

## Phase 1 — Schema, warning engine, responsibility, UI

### Migrations
- **132 `airstrip_settings`** — singleton (`id` int default 1 PK, `default_interval_days` int NOT NULL default
  **60**, `upcoming_window_days` int NOT NULL default **14**, `verification_stale_after_days` int NOT NULL
  default **90**, `updated_at` timestamptz default now(), `updated_by` uuid). Seed one row (`id=1`). RLS: read for
  authenticated; writes via service role only. (Upcoming window is config too — nothing hardcoded.)
- **133 `airstrip_responsibility`** —
  - `ALTER TABLE airstrips ADD COLUMN target_maintenance_interval_days integer NULL` (null = inherit; not seeded),
    `ADD COLUMN responsible_manager_id uuid NULL REFERENCES users(id)`.
  - `CREATE TABLE contractors` (id uuid pk, name text not null, contact text, whatsapp text, active boolean
    default true, notes text, created_at, created_by).
  - `CREATE TABLE airstrip_contractors` (id uuid pk, airstrip_id uuid not null FK→airstrips ON DELETE CASCADE,
    contractor_id uuid not null FK→contractors, effective_from date not null, effective_to date NULL,
    created_at, created_by). Partial unique index: at most one open assignment per airstrip
    (`WHERE effective_to IS NULL`). Indexes on airstrip_id. RLS mirroring the other airstrip tables.

### Warning engine — `lib/airstrips/warnings.ts` (pure, client-safe, serializable output)
```
type AirstripWarning = {
  type: 'overdue' | 'upcoming' | 'verification_stale';
  severity: 'critical' | 'warning' | 'info';
  nextDueOn: string | null;          // YYYY-MM-DD (Guyana)
  daysOverdue?: number;              // overdue
  daysUntilDue?: number;             // upcoming
  message: string;                   // "Kato is 22 days overdue"
  contractorName: string | null;
  managerName: string | null;
};
computeAirstripWarnings(input: {
  name; lastMaintenanceOn: string|null; lastVerifiedOn: string|null;
  intervalDays: number; upcomingWindowDays: number; verificationStaleAfterDays: number;
  contractorName: string|null; managerName: string|null; today: string;  // guyanaToday()
}): AirstripWarning[]
```
- Date math uses the TZ-safe Guyana helpers (string-based; add/diff days without local-getter drift).
- `nextDueOn = addDays(lastMaintenanceOn, intervalDays)`; null `lastMaintenanceOn` → overdue ("no maintenance on record").
- `overdue` if `today > nextDueOn`; `upcoming` if `0 ≤ daysUntilDue ≤ upcomingWindowDays`.
- `verification_stale` if `lastVerifiedOn` null or `today - lastVerifiedOn > verificationStaleAfterDays`.
- Output is plain serializable objects — a future cron/push digest reads the same shape (additive, nothing sends here).
- `lastMaintenanceOn` = MAX(`performed_date`); `lastVerifiedOn` = MAX(`verified_at`) where `verified`. **Derived in
  queries** (no denormalized column → no sync bug).

### Routes
- `GET/PATCH /api/airstrips/settings` — read/update the singleton (`requireAirstripAccess`).
- `GET/POST /api/airstrips/contractors`, `PATCH /api/airstrips/contractors/[id]` (edit/deactivate).
- `POST /api/airstrips/[id]/contractor` — assign: close the current open row (`effective_to = guyanaToday()`),
  open a new one. Atomic via a small transaction/RPC.
- Responsible manager set via existing `PATCH /api/airstrips/[id]` (+`responsible_manager_id`).
- `GET /api/airstrips` and `GET /api/airstrips/[id]` now compute & return `warnings` + `responsibility`
  (contractor + manager names), using one aggregate query for maintenance MAXes + one for open assignments.

### UI (match existing design system / save patterns)
- `/airstrips` list: pinned "Needs Attention" section (strips with active warnings, sorted by urgency, each
  naming contractor + manager), a "Needs Attention" filter, and warning badges in rows. **Remove old `isOverdue`.**
- Detail: warning badges; a "Responsibility" card (current contractor + manager, editable — pick existing
  contractor or create one; pick manager from eligible airstrip-access users). Remove old overdue alert.
- "Cadence Settings" modal from the list header (`requireAirstripAccess`) editing the three thresholds.

## Phase 2 — Per-airstrip PDF report
- `GET /api/airstrips/[id]/report.pdf?from=&to=` (`requireAirstripAccess`, `runtime='nodejs'`,
  `dynamic='force-dynamic'`, `maxDuration` ~120, default range = last 12 months Guyana). Mirrors
  `app/api/intel/[agency]/report.pdf/route.ts`.
- `lib/airstrips/report/prepare-airstrip-report.ts` (data-gather, returns a typed model) + `lib/pdf/
  airstrip-report-render.tsx` (`@react-pdf/renderer`, MPUA branding like `nptab-report-render.tsx`).
  Sections: profile (name/region/coords/status/contractor/manager), health (state/cadence/last/next/days-overdue
  via the warning engine), maintenance timeline for the range (date, activity, verification method + date,
  embedded photo bytes), inspection history, simple overdue/health trend. Payment section conditional/omitted.
- Photos in PDF: generator calls `storage.download()` **directly** → `<Image src={{ data: Buffer, format }}>`.
  No URL layer (consistent with Phase 0 decision).
- Split data-gather from render so a future network-wide rollup reuses the engine (not built now).
- "Generate Report" button + date-range on detail; opens the PDF route as a download.

## Phase 3 — clean hooks only (NOT built)
Forward maintenance schedule (planned vs actual), no-signal physical-inspection requirement flag + last-physical
age, per-contractor response-time metric. The serializable warning shape is the seam for a future cron/push
digest and WhatsApp intake. No sending code here.

## Debug carryover (eliminate, not patch)
- **B8** — delete the 6-month `isOverdue` from list + detail; cadence engine replaces it everywhere.
- **B9** — **Migration 134** `airstrip_change_status` SQL function does the status UPDATE + `airstrip_status_log`
  INSERT in one transaction; `status` PATCH, `[id]` PATCH (on status change), and bulk PATCH call it instead of
  the parallel `Promise.all`. Eliminates the desync at the source.
- **B10** — **Migration 135** `DROP POLICY airstrip_option_types_write` (stale retired-role policy; writes use the
  service role). **Destructive — re-confirm before applying.**

## Migrations summary
| # | File | Additive? |
|---|------|-----------|
| 131 | airstrip_photos_private (bucket private + storage RLS) | config flip (old public links break — intended) |
| 132 | airstrip_settings (+seed id=1) | additive |
| 133 | airstrip_responsibility (cols + contractors + airstrip_contractors) | additive |
| 134 | airstrip_change_status() function | additive |
| 135 | drop airstrip_option_types_write policy | **DESTRUCTIVE — confirm** |

## Acceptance
- Bucket private; all photo display + PDF embedding flow through proxy-stream / direct download; no public URL or
  `createSignedUrl` remains; a user without airstrip access cannot fetch a photo.
- Every airstrip can carry a responsible contractor (history-tracked) + manager; warnings name both.
- Overdue derives from `last_maintenance_on + (target ?? global default)`, TZ-safe; the 6-month check is gone.
- Thresholds (interval/upcoming/stale) editable in-app; changing the global affects all null-inherit strips.
- Per-airstrip PDF downloads with embedded photos; data-gather reusable for a future rollup.
- B8 removed, B9 atomic, B10 dropped. Phased commits + `/simplify` per phase + `AIRSTRIPS_FEATURES.md`. No deploy.
