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
- `135` `DROP POLICY airstrip_option_types_write` (**B10**) — **written, NOT applied; awaiting confirm**.

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

## Phase 2 — Per-airstrip PDF report — pending
## Phase 3 — clean hooks only — pending
