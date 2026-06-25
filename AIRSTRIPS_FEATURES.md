# Hinterland Airstrips — Feature Build

Branch `feature/airstrips-accountability` (on debug pass `6200398`). Design:
`docs/superpowers/specs/2026-06-25-airstrips-accountability-design.md`. Not deployed until reviewed.

## Phase 0 — Photo storage lockdown (proxy-stream) — ✅ shipped

- New auth-gated proxy route `GET /api/airstrips/[id]/photos/[photoId]/file` — `requireAirstripAccess`,
  verifies the photo belongs to the airstrip, streams the object via the service role
  (`supabaseAdmin.storage.download()`). Mirrors `app/api/procurement/[id]/documents/[docId]/route.ts`.
  Serves inline with `Cache-Control: private, no-store`.
- `app/airstrips/[id]/page.tsx`: replaced the public-URL `getStorageUrl` helper with `photoFileUrl(photo)`
  (keyed off `photo.airstrip_id`+`photo.id`, so no airstrip id threading); all 4 display sites updated. The
  old helper is deleted; no code constructs a public `airstrip-photos` URL anymore.
- Log-Maintenance previews keep local blob URLs (no change).
- Migration `131_airstrip_photos_private.sql` written (bucket → `public=false`). **Applied at deploy**, not
  during the build — flipping it before the proxy code ships would break photo display in the live app. The
  proxy route works whether the bucket is public or private (service-role download).

**Decision:** signed URLs rejected per DG — one storage pattern (auth-gated proxy-stream), matching
documents/procurement. See memory `feedback_storage_pattern_consistency`.

**Deferred:** server-side thumbnail resizing (private buckets can't use Supabase's `?width=` transform; would
need a `sharp` dependency). Full-size images are served with `loading="lazy"` — acceptable for this low-traffic
tool; revisit if photo sizes hurt the list view.

## Phase 1 — Warnings & accountability — ✅ shipped

**Schema (migrations applied to prod; 135 deferred):**
- `132` `airstrip_settings` singleton (default_interval_days=60, upcoming_window_days=14,
  verification_stale_after_days=90) — all thresholds editable in-app, nothing hardcoded.
- `133` `target_maintenance_interval_days` (nullable = inherit global, NOT seeded) +
  `responsible_manager_id` on airstrips; `contractors` + `airstrip_contractors` (effective_from/to history,
  partial-unique one-open-per-strip).
- `134` `airstrip_change_status()` — atomic status UPDATE + log INSERT (eliminates **B9**).
- `136` `airstrip_overview` view — derived last-maintenance / last-verified + current contractor/manager.
- `137` `airstrip_assign_contractor()` — atomic close-open reassignment.
- `135` `DROP POLICY airstrip_option_types_write` (**B10**) — ✅ **APPLIED** (Part B). Code-gated: verified
  zero client-context writes to `airstrip_option_types` (only a service-role read route exists), so the
  retired-role policy was dead. Post-drop: only `airstrip_option_types_read` remains; reads work (34 rows),
  service-role writes still work (verified in a rolled-back transaction).

**Warning engine** `lib/airstrips/warnings.ts` (pure, client-safe, serializable for a future cron digest):
`computeAirstripWarnings` → overdue / upcoming / verification_stale, each naming contractor + manager (or
flagging responsibility unassigned). Overdue = last_maintenance + (per-strip ?? global) interval, via the
TZ-safe Guyana date helpers (`addDays`/`daysBetween` added to `lib/airstrip-types.ts`). **B8** (6-month
`isOverdue`) deleted from list + detail. `lib/airstrips/queries.ts` augments view rows for list/detail/PDF.

**Routes:** list + detail GET now return cadence + responsibility; status/[id] PATCH/bulk route status
through the atomic RPC; new `settings` (GET/PATCH), `contractors` (GET/POST + [id] PATCH), `[id]/contractor`
(POST assign / DELETE clear), `managers` (eligible-user list). All `requireAirstripAccess`-gated.

**UI:** "Needs Attention" pinned section + filter + StatCards + row/detail warning badges on the list;
Maintenance Health + Responsibility cards on detail. `CadenceSettingsModal` (edit thresholds),
`ResponsibilityModal` (assign/create contractor + manager). Shared `WarningBadges` component.

**Deferred:** payment model (report section stays conditional); B10 application (awaiting confirm).

## Phase 2 — Per-airstrip PDF report — ✅ shipped (Part C)

- `GET /api/airstrips/[id]/report.pdf?from=&to=` — `requireAirstripAccess`, `runtime=nodejs`, default last
  12 months. Mirrors the intel `report.pdf` route.
- `lib/airstrips/report/prepare-airstrip-report.ts` (data-gather, split from render so a future network rollup
  reuses it) → `lib/pdf/airstrip-report-render.tsx` (`@react-pdf/renderer`, MPUA letterhead like nptab).
  Sections: profile, maintenance health (cadence/warnings), maintenance timeline with **photos embedded as
  bytes** (`storage.download()` → base64 data URI — no URL layer), inspection history, quarterly activity trend.
- Payment section **conditional and omitted** (no payment model). Pure helpers `resolveReportRange` /
  `buildTrend` / `photoFormat` are unit-tested.
- "Report" button + date-range modal (`GenerateReportModal`) on the airstrip detail.
- **Tests (10 files / 46 airstrip tests):** prepare returns correct structured data + embeds photo bytes;
  no-maintenance strip → valid PDF (doesn't throw); photo embed proven by PDF-size delta (not just validity);
  route auth-gated (401/403/404/200); static guard extended to the renderer.

## Phase 3 — clean hooks only — pending

## ⚠️ Deploy checklist (MUST hold at deploy time)
- **Migration `131` (bucket → private) and the Phase 0 proxy route MUST ship in the SAME deploy.** The proxy
  code works whether the bucket is public or private, but flipping the bucket private *before* the proxy code
  is live would break photo display in the running app; flipping it *after* leaves photos briefly world-readable.
  Apply `131` as part of the deploy that ships this branch, not before. (131 is intentionally NOT applied yet.)
- All other airstrip migrations (132–137) are already applied to prod (additive; invisible to the deployed app).
  `135` (B10 policy drop) is applied.
