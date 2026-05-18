# Known Issues

Tracked items that are deliberately deferred and need eventual resolution. Not blockers for any single PR.

## Open

### Vercel alias `dashboard.mpua.gov.gy` still bound to production

The production deploys of `dg-work-os` are aliased to both `dg-work-os.vercel.app` (the canonical target) and `dashboard.mpua.gov.gy` (legacy). Per the operator's convention, only `dg-work-os.vercel.app` should serve production. The extra alias is bound at the Vercel project level and needs to be detached from the Vercel dashboard.

- Surfaced in: PR review for the Ministerial Referrals feature (2026-05-16) and reaffirmed at 2026-05-17.
- Owner: project operator (Vercel dashboard access required).
- Fix: in the Vercel dashboard under the `dg-work-os` project's domain settings, remove `dashboard.mpua.gov.gy` from the production deploy aliases.
