# Auth Bypass — Security Review

**Read this before approving the release.** Written for a reviewer who assumes the worst.

The release branch `feature/airstrips-accountability` contains a test-only authentication affordance
(`lib/e2e-auth.ts`) that, when active, skips real authentication. This document states exactly what it does,
when it can activate, the proof that it is **physically absent from the production build**, and the blast
radius if it ever engaged.

## 1. What it does
`lib/e2e-auth.ts` exports two functions:
- `e2eAuthEnabled(): boolean` — the gate (see §2).
- `e2eSessionFromCookie(raw): Session | null` — when the gate is open, parses an **unsigned** `e2e_user`
  cookie (JSON: `{id, role, agency, …}`) into a normal app `Session` via the existing pure `buildSession()`.
  Returns `null` if the gate is closed or the cookie is missing/malformed.

Two call sites consume it (and nothing else does):
- `middleware.ts` — if the gate is open AND an `e2e_user` cookie is present, it returns a passthrough and
  **skips the Supabase `getUser()` check and the `/login` redirect**.
- `lib/auth-supabase.ts` `auth()` — if the gate is open, it returns the cookie-derived `Session` **without any
  Supabase or DB call**.

Purpose: let Playwright render authenticated pages deterministically, with all APIs mocked, without real
credentials. When active it performs **no real authentication** — it trusts the cookie. That is precisely why
the goal is **absence in production**, not mere gating.

## 2. Activation conditions — fails closed
`e2eAuthEnabled()` returns `true` only when **every** condition holds:
1. `process.env.NODE_ENV` is exactly `'development'` or `'test'`. Any other value — including **unset**,
   `'production'`, `'staging'`, or a typo — returns `false`.
2. `process.env.VERCEL_ENV !== 'production'` (belt against the Vercel production environment).
3. `process.env.E2E_AUTH_BYPASS === '1'` (exact string; `'true'`, `'yes'`, unset → `false`).

Additionally, a production indicator (`NODE_ENV` or `VERCEL_ENV` = `production`) forces `false` **first**,
before any flag is consulted. There is no code path where an ambiguous/unset environment yields `true`.
Pinned by `lib/__tests__/e2e-auth.test.ts` (8 tests): live only in dev/test+flag; dead in production even with
the flag; dead when `VERCEL_ENV=production`; dead when `NODE_ENV` is unset; dead for unexpected `NODE_ENV`;
dead without the flag; dead for a wrong flag value.

## 3. Proof it is ABSENT from the production build
The affordance and both call-site branches reference two **string literals** that minification never
rewrites: `'E2E_AUTH_BYPASS'` (the env flag) and `'e2e_user'` (the cookie name). If any of this code shipped,
these exact strings would appear in the executable bundle.

A production build (`npm run build`, `NODE_ENV=production`) inlines `process.env.NODE_ENV`, folds
`e2eAuthEnabled()` to `return false`, and Turbopack tree-shakes the affordance **and** the
`if (e2eAuthEnabled() && …)` branches out of the bundle.

**Verified on this release's build** (`npm run verify:no-bypass`):
```
✓ 'E2E_AUTH_BYPASS' absent from 1742 executable .js files
✓ 'e2e_user' absent from 1742 executable .js files
OK: the E2E auth bypass is absent from the production build (1742 executable .js files scanned).
```
The strings remain only in 285 `*.map` source-map files, which **do not execute**. The check excludes `*.map`.

**Durability — BUILD-ENFORCED:** the `build` script is `next build && npm run verify:no-bypass`, so the check
runs on every build (local **and** the Vercel production build) and a regression — a bundler change or a refactor
that defeats dead-code elimination — **fails the build before it can ship**. Proven: injecting
`_leakProbe: 'e2e_user'` into a shipped route made `npm run build` exit 1 ("AUTH BYPASS LEAK DETECTED");
reverting returned it to green (both symbols absent from 1741 executable `.js`).

## 4. How absence is achieved (and its one caveat — stated plainly)
Absence is achieved by **Turbopack dead-code elimination + tree-shaking**, driven by the `NODE_ENV ===
'production'` anchor that must remain the first statement of `e2eAuthEnabled()`. It is **not** achieved by a
separate production stub module — it relies on the bundler. This is a real dependency: if a future change
imported the bypass in a way the bundler could not eliminate, it would ship. The `verify:no-bypass` CI gate
exists precisely to catch that, and is now **build-enforced** (§3) — it cannot be skipped, since the build fails.
If you want stronger-than-bundler assurance still, the follow-up is a build-time module alias swapping
`lib/e2e-auth.ts` for a constant-`false` stub (the "Cloud Run prod-stub"): **deferred, not built** — judged
unnecessary given the proven absence + the build-enforced gate, but it remains the next lever.

## 5. Blast radius if it ever engaged in production (hypothetical)
The `e2e_user` cookie is **not cryptographically signed**. So IF the gate ever returned `true` in production,
any request carrying a forged `e2e_user={"role":"superadmin",…}` cookie would be treated as an authenticated
superadmin — full horizontal+vertical privilege escalation across the app. There is no second factor; the gate
is the only control. That is the worst case, and it is why this review insists on **absence**, not just gating.

Why that worst case cannot occur here: (a) the code is physically absent from the prod bundle (§3); (b) even if
present, the gate is off in production (`NODE_ENV`/`VERCEL_ENV`); (c) it requires `E2E_AUTH_BYPASS=1`, never set
in production; (d) the CI gate fails the build if (a) ever regresses. All four must fail simultaneously for the
blast radius to apply.

## 6. Recommendation
- **Ship-safe on the auth-bypass dimension**, contingent on: keep `E2E_AUTH_BYPASS` out of the production
  environment, and add `npm run verify:no-bypass` to the CI pipeline after build.
- If you prefer belt-and-suspenders over bundler-dependent absence, ask for the prod-stub module alias before go.
