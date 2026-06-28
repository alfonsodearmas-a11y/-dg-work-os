# Hinterland Airstrips — Production Promotion Runbook

**Human-gated.** This release contains an authentication affordance (see `AUTH_BYPASS_REVIEW.md` — read it
first) and flips a production storage bucket to private. The agent runs nothing against prod before an explicit
in-session go. Branch: `feature/airstrips-accountability`.

## 0. Pre-flight status (all green as of this hand-back)
- Production build: `npm run build` → exit 0.
- **Auth bypass absent from prod build:** `npm run verify:no-bypass` → `E2E_AUTH_BYPASS` and `e2e_user` absent
  from 1742 executable `.js` files. (Details + blast radius in `AUTH_BYPASS_REVIEW.md`.)
- Unit/integration: 646 tests green (`npm test`). E2E: 7 green (`npm run test:e2e`). `tsc`: 8 pre-existing errors
  in untouched test files (unchanged).
- Migration 131 dry-run (read-only): bucket `airstrip-photos` is currently `public=true`; 0 photo rows store a
  baked public URL → 131 is safe. Superadmin `alfonso.dearmas@mpua.gov.gy` intact.

## 1. ⚠️ Release scope — DECIDE before merging
This branch was cut off `feature/intel-report-redesign`, so `main..HEAD` carries **unrelated code** in addition
to the airstrip work: the **delayed-projects** feature + intel/today changes (~15 commits before `6200398`).
- The airstrip commits touched **none** of those files; they are inherited from the base branch.
- **Migrations are clean:** the delayed-projects migration (130) is **already applied** to prod, and **131 is the
  only unapplied migration**. So no surprise migration rides along — but the delayed-projects/intel **code** does.
- **Decision required:** either (a) ship the whole branch (if delayed-projects is intended for this release), or
  (b) isolate the airstrip work onto a clean branch off `main` first. This is a release-scoping call for the DG;
  the agent did not decide it.

## 2. Auth-bypass preconditions (must hold before deploy)
- `AUTH_BYPASS_REVIEW.md` has been read and approved.
- `E2E_AUTH_BYPASS` is **not** set in the production environment (and `NODE_ENV=production` there anyway, which
  hard-disables the gate).
- The no-bypass check is **build-enforced**: `build` = `next build && npm run verify:no-bypass`, so the Vercel
  production build fails if the bypass ever leaks (proven: a planted leak failed the build; reverting passed).

## 3. Why 131 and the proxy code ship together
The proxy route `GET /api/airstrips/[id]/photos/[photoId]/file` serves photos via the **service role**, which
works whether the bucket is public or private. Applying 131 before the proxy code is live breaks photo display;
deploying the code but never applying 131 leaves photos world-readable. So: **deploy code first, then apply 131,
same window.**

## 4. Promotion — exact ordered steps
```bash
# (run from the release commit; replace the merge step with your isolation choice from §1)

# 4.1  Final local gates
npm ci
npm run build
npm run verify:no-bypass          # MUST print "absent ... OK"
npm test                          # 646 green
# (optional) npm run test:e2e against a preview with a seeded user

# 4.2  Deploy the proxy-containing build to production (your normal deploy path), e.g.:
#      merge feature/airstrips-accountability -> main, or vercel deploy --prod
#      Confirm E2E_AUTH_BYPASS is NOT in the prod env.

# 4.3  Smoke the deploy (bucket still public): log in as the real HAS manager,
#      open an airstrip with photos, confirm thumbnails paint (now via the proxy).

# 4.4  Apply Migration 131 (bucket -> private). Apply the file
#      supabase/migrations/131_airstrip_photos_private.sql, i.e.:
#         update storage.buckets set public = false where id = 'airstrip-photos';
```

## 5. Rollback (literal)
```sql
-- Revert 131 immediately if photos break — restores public serving (proxy keeps working too):
update storage.buckets set public = true where id = 'airstrip-photos';
```
For an app-level regression, roll back the deployment to the previous release; 131 can be reverted independently
(the flip is fully reversible and decoupled from the code rollback). Migrations 132–137/135 are additive/forward.

## 6. Post-deploy verification (run on the LIVE app)
1. **Private-bucket photo round-trip (the item E2E could only mock):** open a real airstrip with photos → the
   thumbnails AND the lightbox paint through `/api/airstrips/.../file` from the now-private bucket; then confirm
   an **old** `/object/public/airstrip-photos/...` URL **no longer resolves**.
2. The Needs-Attention queue shows real overdue strips, each naming the real contractor + manager (or "unassigned").
3. Generate a report for a strip with photos → PDF downloads with photos embedded.
4. A non-HAS agency_manager is denied `/airstrips` and its photos; the HAS manager has no Cadence Settings
   control; a superadmin can edit it.

## 7. Go / No-Go
**CONDITIONAL-GO**, contingent on §1 (release-scope decision) and §2 (auth-bypass preconditions).
- ✅ Auth bypass proven absent from the prod build; fail-closed gate pinned by tests; review written.
- ✅ 646 unit/integration + 7 E2E green; build green; 131 verified safe + reversible; superadmin intact; 131 is
  the only unapplied migration.
- ⏳ The real private-bucket photo round-trip is UNVERIFIED-PENDING-DEPLOY (close with §6.1).
- 🧭 The delayed-projects/intel code riding along (§1) needs a DG release-scoping decision.
- 🚫 No no-go conditions triggered on the airstrip dimension.
