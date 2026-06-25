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

## Phase 1 — Warnings & accountability — pending
## Phase 2 — Per-airstrip PDF report — pending
## Phase 3 — clean hooks only — pending
