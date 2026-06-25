# Hinterland Airstrips — Production Promotion Checklist

Branch `feature/airstrips-accountability`. **Human-gated.** This document is the hand-back; the actual
promotion (deploy + Migration 131) is performed by a human. Nothing here was run against prod by the agent.

## State at hand-back
- Migrations **132–137 and 135 are already applied to prod** (additive + the B10 policy drop; invisible to the
  currently-deployed app).
- Migration **131 (bucket → private) is written but NOT applied.** It is the only outstanding migration and is
  **deploy-coupled** (below).
- The superadmin `alfonso.dearmas@mpua.gov.gy` is untouched (verified).
- `E2E_AUTH_BYPASS` is an E2E-only flag; it is **never set in production** and is additionally dead in any
  production build (`NODE_ENV=production`). Confirm it is absent from the prod environment before deploying.

## Why 131 and the proxy code MUST ship together
The proxy route `GET /api/airstrips/[id]/photos/[photoId]/file` serves photos via the **service role**, which
works whether the bucket is public or private. So:
- Applying 131 **before** the proxy code is live → breaks photo display in the running app.
- Deploying the proxy code but **never** applying 131 → photos remain world-readable by public URL.
Therefore: deploy the code first, then apply 131 immediately after, in the **same release window**.

## Promotion steps (ordered)
1. **Pre-flight:** confirm `E2E_AUTH_BYPASS` is NOT in the prod env; confirm prod is healthy; confirm a recent backup/PITR window exists.
2. **Merge & deploy** `feature/airstrips-accountability` to production. This ships the proxy route, the
   private-bucket-safe `photoFileUrl`, warnings/accountability UI, and the PDF report. At this point the bucket
   is still public, but the app already serves photos through the proxy — nothing breaks.
3. **Smoke the deploy** (bucket still public): log in as the real HAS manager, open an airstrip with photos,
   confirm thumbnails paint (they now flow through the proxy).
4. **Apply Migration 131** to prod:
   `update storage.buckets set public = false where id = 'airstrip-photos';`
   (or apply `supabase/migrations/131_airstrip_photos_private.sql`). Old public links stop resolving; the app is
   unaffected because it uses the proxy.
5. **Post-deploy human checks** — see below. These are the eyeball pass that even green E2E does not replace.

## Rollback
- **Photos break after 131:** revert the flip — `update storage.buckets set public = true where id =
  'airstrip-photos';` — restores public serving immediately (the proxy keeps working too).
- **App-level regression:** roll back the deployment to the previous release. 131 can be left applied or reverted
  independently (the flip is fully reversible and decoupled from the code rollback).
- Migrations 132–137/135 are additive/forward and need no rollback; if ever required, drops are destructive and
  must be done by hand with sign-off.

## Post-deploy human checks (REQUIRED — the visual pass E2E can't replace)
1. **Private-bucket photo round-trip (the item E2E could not verify):** open a real airstrip that has photos →
   the thumbnails AND the lightbox actually paint, served through `/api/airstrips/.../file` from the now-private
   bucket. Then confirm an **old public** `/object/public/airstrip-photos/...` URL **no longer resolves**.
2. **Needs Attention is real:** the list's Needs-Attention queue shows the real overdue strips, each naming the
   real responsible contractor + manager (or "responsibility unassigned").
3. **Report:** generate a PDF for a strip with photos → it downloads with the photos embedded.
4. **RBAC:** a non-HAS agency_manager is denied `/airstrips`; the HAS manager can manage contractors but the
   **Cadence Settings** control is absent; a superadmin sees and can edit it.
5. **Optional automated gate:** with a seeded preview/test user, run `npm run test:e2e` against the preview URL.

## Go / No-Go
**CONDITIONAL-GO.**
- ✅ Green: 641 unit/integration tests + 7 Playwright E2E pass against a real rendered build; 3 evidence
  screenshots captured (`e2e/screenshots/`); live-DB invariants hold (0 baked photo URLs, 0 double-open
  contractors, 0 orphans); superadmin intact; 135 applied & verified; 131 verified safe (no row stores a public URL).
- ⏳ The **one** pending item: the real **private-bucket photo round-trip** (131 applied + a real storage object
  served through the proxy in the deployed app) is **UNVERIFIED-PENDING-DEPLOY**. It was not provable in the
  sandbox without provisioning paid Supabase-branch + preview-deploy infra and seeding storage — judged
  disproportionate/fragile against the residual risk. E2E proved the UI uses the proxy URL and the image paints
  (mocked bytes, bucket still public); the route+storage logic is unit-tested with mocked storage. Close it with
  post-deploy check #1.
- 🚫 No no-go conditions triggered.
