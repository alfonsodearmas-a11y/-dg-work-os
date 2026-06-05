# Supabase Auth Migration Plan — DG Work OS

> **Status:** PLAN ONLY. No code or schema changes have been made. Nothing in §"Cutover" or any migration runs until you give explicit go-ahead. Migrations that DROP/RENAME/ALTER COLUMN/backfill are individually flagged and require your sign-off per project policy.

**Goal:** Make Supabase Auth (`auth.users`) the single source of truth for identity, password hashing, sessions, password resets, and admin user management — replacing NextAuth entirely in one cutover, while preserving every existing user ID, all 63–66 foreign keys, app-layer authorization, and the untouched Google Calendar/Drive integration.

**Architecture:** `auth.users` becomes canonical. The current `public.users` table stays physically named `users` (see §2 for why we do **not** rename it to `profiles`) and gains `id REFERENCES auth.users(id)`, preserving every UUID. `@supabase/ssr` owns the session cookie + middleware. The single `auth()` chokepoint is reimplemented over the Supabase session and must return a byte-for-byte-compatible session shape so the 249 `requireRole()` routes and 13 `useSession()` callsites keep working unchanged. Authorization stays 100% app-layer; RLS remains decorative and out of scope.

**Tech stack:** Next.js 16 (App Router, Turbopack) · TypeScript · `@supabase/ssr` + `@supabase/supabase-js` (NEW) · Supabase GoTrue · Postgres 17 (project `ozcdsnpieeetzzwjqvjo` / `dg-command-center`, us-west-2) · vitest.

---

## 0. Locked decisions (from you — restated so the plan is self-contained)

1. **Scope:** Full rip-and-replace, single cutover. Remove NextAuth. `@supabase/ssr` owns middleware + cookie sessions. `auth()` reimplemented over the Supabase session. Client `SessionProvider`/`useSession` replaced. Google login moves to the Supabase Google provider. All in one cutover.
2. **Passwords:** Transplant existing bcrypt hashes into `auth.users.encrypted_password` (cost 12 already matches GoTrue — and all 17 live hashes are verified `$2a$`, the variant GoTrue accepts natively). The 17 password users keep their current passwords. **No blanket reset.** The **2** invited-never-logged-in humans (no hash) get a Supabase `inviteUserByEmail` link (per-user decision fixed in P4). The **1** `system` account is handled separately (banned at import). You will personally notify the 3 Google-only users and anyone who must act.
3. **Google API tokens:** `integration_tokens` / Calendar / Drive refresh-token plumbing is **LEFT UNTOUCHED**. Only login identity moves to the Supabase Google provider. Daily Briefing and Doc Vault must not regress. (One additive exception forced by the audit — see §5.)
4. **Authorization:** Stays 100% app-layer (`requireRole()` / `canAccessAgency()`). RLS stays decorative — do **not** `FORCE` it, do **not** rewrite policies here. Noted as a deliberate later phase, out of scope.

---

## 1. Audit ground truth (verified — Phase 1 summary)

The full audit produced these load-bearing facts. They are the basis for every step below.

| Area | Finding (verified) |
|---|---|
| Session mechanism | NextAuth v5 beta, **JWT strategy** (stateless, no server session table). Cookie = signed NextAuth JWT. Providers: Google OAuth + Credentials (bcrypt cost 12 vs `users.password_hash`). |
| `auth()` shape | `{ user: { id, email, name, image, role, agency } }`. Field reads: `id` ×302, `role` ×169, `agency` ×93, `name` ×24, `email` ×11, `image` ×1. `agency` is **UPPERCASED** in the session callback (`lib/auth.ts:276`); DB stores lowercase historically, now uppercase (migration 106). |
| Authz chokepoints | `requireRole()` (lib/auth-helpers.ts) used by **249 routes**; raw `auth()` imported by **38 files**; client `useSession()` in **13 callsites + `ViewAsProvider`**. All ride the shape above. **No legacy/parallel auth path**; `jsonwebtoken` dep is unused/vestigial. |
| User model | `public.users.id` = **uuid** (`gen_random_uuid()`), **same type as `auth.users.id`**. **63–66 FKs across ~45 tables** reference it; several `ON DELETE RESTRICT` (`nptab_*`, `tasks.referred_to_minister_by`). |
| GoTrue state | `auth.users` = **0 rows**, no triggers, no `handle_new_user`, no `profiles` table. Greenfield. `@supabase/ssr` / `auth-helpers` **not installed**. |
| Users today (reconciled, sums to 23) | **17 password** (all `$2a$`) + **3 Google-only** (no password: `alfonso.dearmas@`/dg, `keisha.crighton@`/dg, `akeems@`/agency_admin·HAS) + **3 no-creds** = **2 invited-never-logged-in humans** (`indardeodat@gmail.com`/minister·pending, `teamleaderpa@gplinc.com`/agency_admin·GPL·pending) **+ 1 `system`** (`system@mpua.gov.gy`, no human login). The earlier "3 invited + 1 system" double-counted — the `system` row is one of the 3 no-creds rows. Note: both invited humans use **external domains** (gmail/gplinc) → cannot use Google sign-in (domain whitelist) → password/invite only. |
| Password reset | `PUT /api/admin/users/[id]/password` **exists and works** but is **orphaned** (zero UI callers). The DELETE route already calls `supabaseAdmin.auth.admin.deleteUser(id)` with the profile id — vestigial proof the intended design is `auth.users.id === users.id`. |
| Authorization reality | App-layer only. **RLS is decorative**: 76 tables RLS-enabled, `FORCE` off everywhere, all traffic uses service-role (bypasses RLS), policies reference `auth.uid()`/`auth.jwt()->>'userId'` against empty `auth.users` → would deny-all if ever engaged. |
| Secrets | **PASS** — service-role key server-only (zero `'use client'` imports), no leaks. |
| Schema drift (live) | `users_role_check` allows 7 values incl. unmodeled **`system`**. Redundant **`users_agency_values`** (lowercase) CHECK coexists with canonical uppercase `users_agency_check`. `status ∈ {pending,active,inactive,suspended,archived}`. Extra cols: `closure_mode`, `is_agency_head`, `aliases`. **No triggers on `users`.** |

---

## 2. Identity model (confirmed against live schema)

**Decision (with a deliberate divergence from "rename to profiles"):** Keep the physical table named **`public.users`**. Do **not** rename it to `profiles`.

**Why divergence:** ~240 callsites do `supabaseAdmin.from('users')`, and the `is_dg_or_above()` SECURITY-DEFINER function + every RLS policy reference `users` by name. A physical `RENAME TO profiles` forces ~240 code edits **into the single cutover** (multiplying its blast radius) plus breaks the helper function and policy bodies — for **zero functional gain**, since "profile vs auth" separation is achieved structurally by the FK, not the name. The `profiles` naming is a Supabase convention, not a requirement. If you want the cosmetic rename, do it as an isolated later refactor (its own PR: rename + codemod `from('users')`→`from('profiles')` + update function/policies), never inside this cutover. **The plan below treats `public.users` as the profile table.**

**Structural change:** add `users.id REFERENCES auth.users(id) ON DELETE CASCADE`. Because every `users.id` already equals what the new `auth.users.id` will be (we insert with matching UUIDs — §"Prep"), this is a **metadata-only** constraint add (no data movement), and **all 63–66 child FKs stay valid and never move**.

What stays on `users` (the profile): `role, agency, name, avatar_url, status, is_active, formal_title, closure_mode, is_agency_head, aliases, login_count, last_login, last_seen_at, first_login_at, created_at, created_by, invited_by, invited_at, archived_at`. Auth-owned-going-forward: credentials (`encrypted_password` in `auth.users`), email (mirrored), Google identity (`auth.identities`).

Columns kept **temporarily** (do NOT drop during cutover — they make rollback clean): `password_hash`, `google_sub`, `invite_token`, `invite_token_expires_at`. Dropped only in a **later** cleanup migration after Supabase is proven (§"Migration policy", flagged DROP COLUMN).

`users.id` default `gen_random_uuid()` is **kept** during cutover (the new create-path sets `id` explicitly from `auth.admin.createUser`, so the default just sits unused; keeping it means a reverted NextAuth invite-insert still works). Reconsidered and rejected: dropping the default during cutover (would make rollback of the invite flow fail).

**FK cascade note (correct, keep):** `auth.users → users ON DELETE CASCADE` means deleting an auth user cascades to the profile; if that profile is referenced by an `ON DELETE RESTRICT` child (`nptab_*`, `tasks.referred_to_minister_by`), the delete is blocked — which is the desired "can't delete a user who generated NPTAB reports" behavior. No change needed.

---

## 3. Target session/identity architecture

```
Browser
  │  email+password  →  supabase.auth.signInWithPassword()
  │  Google          →  supabase.auth.signInWithOAuth({provider:'google'})
  ▼
Supabase GoTrue  ──issues──►  sb-<ref>-auth-token cookie (httpOnly, refreshed by middleware)
  ▼
middleware.ts (@supabase/ssr createServerClient)  ──refresh + gate──►  request
  ▼
Server: auth()  =  getClaims()/getUser()  →  user.id  ──►  read users(role,agency,…) by id
  │                                                         (app-layer authz, role fresh per request)
  ├─ requireRole([...])  (249 routes, UNCHANGED — calls auth())
  └─ /api/auth/me  →  returns the session shape to the client provider
       ▼
Client: <SessionProvider> (Supabase-backed)  →  useSession()  (13 callsites + ViewAsProvider, shape UNCHANGED)
```

The contract that makes this tractable: **`auth()`'s return shape is the single interface**. Preserve it exactly (§ STEP 0b) and 249 routes + 13 client callsites need no logic change — only the *implementation behind* `auth()`/`useSession()` changes, plus import-path swaps.

---

## STEP 0a — bcrypt variant verification (FIRST, blocking, reversible)

**Risk addressed:** GoTrue's password check expects `$2a$`-prefixed bcrypt. `bcryptjs` may emit `$2a$` **or** `$2b$`/`$2y$`. If GoTrue rejected the stored variant, **all 17 password users would get "invalid credentials"** at once — everyone locked out. **Already de-risked (2026-06-04):** a live query confirmed **all 17 hashes are `$2a$`** — the variant GoTrue accepts natively, so the prefix-rewrite branch (step 6) is very unlikely to be needed. We still prove it end-to-end on ONE user before importing the other 16, because "prefix looks right" ≠ "GoTrue accepts this exact hash."

**Procedure (run on a Supabase branch or `mpua-staging`, not prod first):**

1. Re-confirm the stored variant (read-only, safe) — expected uniformly `$2a$`:
   ```sql
   SELECT left(password_hash, 4) AS prefix, count(*)
   FROM public.users WHERE password_hash IS NOT NULL GROUP BY 1;
   ```
   Expected (verified 2026-06-04): `$2a$ → 17`. If anything other than `$2a$` appears, flag before import.
2. Pick ONE password user whose plaintext you can obtain (a test account, or coordinate with one cooperating user; ideally seed a throwaway via `bcryptjs` so you know the plaintext).
3. Insert exactly one `auth.users` row with that user's `id`, `email`, and `encrypted_password = password_hash` (see §"Prep — auth.users import" for the full INSERT column list).
4. From a script/Node REPL using the **anon** client:
   ```ts
   const { data, error } = await supabase.auth.signInWithPassword({ email, password: KNOWN_PLAINTEXT });
   ```
   **Confirm `error == null` and `data.session` is returned.**
5. **If it succeeds:** the variant is accepted → proceed to bulk import the other 16 unchanged.
6. **If it fails with `invalid_grant`/invalid credentials:** the variant is rejected. **Rollback:** `DELETE FROM auth.users WHERE id = '<test id>';` (no other state touched). **Remediation:** GoTrue accepts `$2a$`; if hashes are `$2b$`/`$2y$`, rewrite the prefix to `$2a$` on import (bcrypt `$2a$`/`$2b$`/`$2y$` are cross-compatible for verification in standard implementations — but this must be **re-verified by repeating steps 3–4 with the rewritten prefix**, not assumed). Only after a green sign-in do we bulk import.

**Do not bulk-import until step 4 is green.**

> **Rehearsal result (2026-06-04, isolated test on `mpua-staging`):** GoTrue **accepts** a `bcryptjs $2a$12$` hash inserted directly into `auth.users` — a correct-password `signInWithPassword` returned `HTTP 200` + access token; wrong password cleanly returned `400 invalid_credentials`. **Caveat that becomes a hard requirement:** the row's string-token columns must be `''` not `NULL` (see the ⚠️ box in P4), or the same sign-in 500s. The microtest verified the hash mechanism end-to-end but did **not** run against the real `public.users`/FK schema (mpua-staging lacks it) — the full C1/C2 import + FK validation still needs an isolated branch of `dg-command-center`.

---

## STEP 0b — `auth()` contract lock (FIRST, blocking)

**Risk addressed:** This is the single highest-risk surface. A subtly different `auth()` return shape (role null, agency not uppercased, returns null when it shouldn't) makes **every** `requireRole()` 401/403 → the whole app dies for all users simultaneously.

**The exact contract (enumerated from real reads):**

```ts
// auth() MUST return null (logged out / deactivated) OR exactly this:
type SessionUser = {
  id: string;            // auth.users.id (== users.id). Read 302×. NEVER null when logged in.
  email: string;         // mirrored. Read 11× + LegacyUser shim.
  name: string;          // users.name ?? ''. Read 24× (+ getSessionUser derives fullName/full_name).
  image: string | null;  // users.avatar_url. Read 1×.
  role: Role;            // users.role. Read 169×. Role = 'dg'|'minister'|'ps'|'parl_sec'|'agency_admin'|'officer'.
  agency: string | null; // users.agency, UPPERCASED. Read 93×. ToUpperCase() is REQUIRED (Sidebar/agency filters depend on it).
};
type Session = { user: SessionUser };
```

Deactivation parity: current `jwt` callback blanks the token (→ `user.id` empty → middleware → `/403`) when `!is_active`. The new `auth()` must return **null** when the profile is missing OR (`!is_active && status !== 'pending'`).

**Tasks (land in Prep, on main, behind no flag — pure additions):**

- [ ] Create `lib/auth-contract.ts` exporting `SESSION_FIELDS = ['id','email','name','image','role','agency'] as const` and a `assertSessionShape(s)` guard.
- [ ] Write `lib/__tests__/auth-contract.test.ts` (vitest) that:
  1. Mocks a logged-in Supabase user + a `users` row and asserts the **new** `auth()` returns an object structurally identical to the **old** shape — same keys, `agency` uppercased, `role` typed, `id` non-empty.
  2. Asserts deactivated (`is_active=false, status='active'`) → `auth()` returns `null`.
  3. Asserts pending (`is_active=false, status='pending'`) → still resolves (so invited users mid-onboarding aren't locked out — matches current `authorize()` allowance).
  4. Snapshots the key set against `SESSION_FIELDS` so any drift fails CI.
- [ ] Cross-check against the direct-`auth()` callers in `docs/auth-migration-checklist.md` (38 files) — several read `session?.user?.id` and a few fall back to `'system'`; the new shape must satisfy all of them. The contract test must pass **before** the middleware/client swap lands.

This test is the gate. If it isn't green, the cutover does not start.

---

## Part 1 — Pre-cutover prep (lands on `main` safely; Supabase sessions NOT yet active)

Everything here is inert until the cutover flips middleware. It can be merged, reviewed, and CI'd normally because NextAuth still issues sessions.

### P1. Dependencies + Supabase clients
- [ ] `npm i @supabase/ssr` (keep `@supabase/supabase-js`).
- [ ] `lib/supabase/server.ts` — `createServerClient` factory bound to `next/headers` cookies (anon key). Export `getServerSupabase()`.
- [ ] `lib/supabase/client.ts` — `createBrowserClient` (anon key). Export `getBrowserSupabase()`.
- [ ] Keep `lib/db.ts` `supabaseAdmin` (service role) for admin API + all existing `.from('users')` reads.

### P2. Schema migration (file only; apply is a FLAGGED step — see §"Migration policy")
- [ ] `supabase/migrations/126_supabase_auth_fk.sql`:
  - `ALTER TABLE public.users ADD CONSTRAINT users_id_authusers_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;` (added **after** auth.users seeded — see ordering in P4/Cutover).
  - (Optional, flagged) `ALTER TABLE public.users DROP CONSTRAINT users_agency_values;` to remove the redundant lowercase CHECK.
  - Leave `password_hash`, `google_sub`, `invite_token*` in place.
- The FK can only be added once all 23 `auth.users` rows exist; the migration is written now but its `ADD CONSTRAINT` runs in the cutover sequence (P4 → after import).

### P3. Reimplemented `auth()` + `/api/auth/me` (written, not yet wired into middleware)
- [ ] Rewrite `lib/auth.ts` → new server module (add `import 'server-only'` — closes the latent boundary gap the audit flagged):
  ```ts
  export async function auth(): Promise<Session | null> {
    const supabase = await getServerSupabase();
    // Prefer getClaims() (local JWT verify via JWKS) for the 249-route hot path;
    // fall back to getUser() (network) if asymmetric JWT signing keys are not enabled.
    const { data, error } = await supabase.auth.getClaims();
    const uid = data?.claims?.sub;
    if (error || !uid) return null;
    const { data: p } = await supabaseAdmin
      .from('users')
      .select('email, name, avatar_url, role, agency, is_active, status')
      .eq('id', uid).single();
    if (!p) return null;
    if (!p.is_active && p.status !== 'pending') return null;
    if (p.role === 'system') return null; // 'system' is not a human session role and is OUTSIDE the Role union — never surface it
    return { user: {
      id: uid,
      email: p.email ?? '',
      name: p.name ?? '',
      image: p.avatar_url ?? null,
      role: p.role as Role,
      agency: p.agency ? p.agency.toUpperCase() : null,
    }};
  }
  ```
  - Keep `requireRole()` (lib/auth-helpers.ts) **byte-identical** — it just calls the new `auth()`.
  - Keep the `LegacyUser` shims (`getSessionUser`, `canAccessTask`, etc.) pointed at the new `auth()` so the 2 `tm` routes still work.
  - **`system` role handling (explicit, verified):** The TS `Role` union (`lib/auth.ts:22`) is `'dg'|'minister'|'ps'|'parl_sec'|'agency_admin'|'officer'` — it **does not include `'system'`**, and `requireRole(allowedRoles: Role[])` therefore can never list `'system'` in an allow-list (a `system` session would always 403 anyway). To keep the return type honest rather than rely on that, `auth()` returns **null** for `role==='system'` (the `if (p.role === 'system') return null` line above). This is belt-and-suspenders on top of the import-time ban (P4): the `system` user cannot mint a session (banned), and even if a row leaked, `auth()` would not surface it. Verified against the 38 direct-`auth()` callers and the `requireRole()` signature: **no code path depends on `'system'` being a returnable session role** (the audit confirmed `system` has no `ROLE_HIERARCHY`/`ROLE_LABELS`/module entries either), so excluding it is safe.
  - Performance note: enable Supabase **asymmetric JWT signing keys** so `getClaims()` verifies locally (no per-request GoTrue round-trip). Without it, `getClaims()` falls back to a network call — correct but adds latency across 249 routes. This is a Supabase dashboard setting, not code.
- [ ] `app/api/auth/me/route.ts` — `GET` returns `await auth()` as `{ user }` or `401`. Add `/api/auth/me` to public-path handling so the client can call it pre-redirect.
- [ ] Run STEP 0b contract test → must pass.

### P4. `auth.users` seed/import scripts (WRITTEN; RUN is a FLAGGED cutover step)

Scripts live in `scripts/` and are **not run** in prep. They populate `auth.users`/`auth.identities` with **matching UUIDs** for all 23 profiles. Cohorts:

| Cohort | Count | Members | How |
|---|---|---|---|
| Password users | 17 | (all `$2a$`) | INSERT `auth.users` with `id = users.id`, `encrypted_password = users.password_hash`, `email_confirmed_at = now()`. (After STEP 0a green.) |
| Google-only | 3 | `alfonso.dearmas@` (dg), `keisha.crighton@` (dg), `akeems@` (agency_admin·HAS) | INSERT `auth.users` (id-matched, no password, `email_confirmed_at = now()`) **+** INSERT `auth.identities` (`provider='google'`, `provider_id = users.google_sub`, `identity_data` with `sub`/`email`). |
| Invited-never-logged-in (humans) | 2 | `indardeodat@gmail.com` (minister, pending), `teamleaderpa@gplinc.com` (agency_admin·GPL, pending) | INSERT `auth.users` (id-matched, no usable password) **+** `supabaseAdmin.auth.admin.inviteUserByEmail(email)` (Part 3b). **Per-user decision (fixed now): both get an emailed invite link**, not an admin-set password — both are external-domain addresses (gmail/gplinc) that can't use Google, and an emailed link avoids an admin handling plaintext for a VIP (minister) and an external GPL user. Fallback only if SMTP to those domains bounces: admin-set initial password. |
| `system` | 1 | `system@mpua.gov.gy` (role=`system`) | INSERT `auth.users` (id-matched) then **ban indefinitely** (`banned_until` far future) so it can **never** mint a Supabase session, while the FK is still satisfied. Because it's banned, `auth()` never observes `role='system'` at runtime (unreachable by construction). It is referenced by FKs (procurement actor), so the row must exist. |

The exact INSERT must include GoTrue's required columns: `instance_id = '00000000-0000-0000-0000-000000000000'`, `aud='authenticated'`, `role='authenticated'`, `id`, `email`, `encrypted_password` (or null), `email_confirmed_at`, `created_at`, `updated_at`, `raw_app_meta_data` (`{"provider":"email"|"google","providers":[...]}`), `raw_user_meta_data` (`{}`).

> **⚠️ REHEARSAL-VERIFIED REQUIREMENT (2026-06-04, mpua-staging):** the INSERT **must also set GoTrue's string-token columns to empty string `''`, never `NULL`** — specifically `confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`, `email_change_token_current`, `phone_change`, `phone_change_token`, `reauthentication_token` (and `email_change_confirm_status = 0`). GoTrue scans these into non-nullable Go strings; a `NULL` makes **every** affected user's `signInWithPassword` fail with **`HTTP 500 "Database error querying schema"`** — which on cutover day looks exactly like the "everyone locked out" failure mode. This was proven in the staging rehearsal: a row with `NULL` tokens 500'd; the identical row with tokens set to `''` returned `HTTP 200` with a valid session. Use `coalesce(col,'')` or explicit `''` for all token columns in the import script.

Direct `auth.users`/`auth.identities` INSERT is a **data backfill → FLAGGED** (§"Migration policy").

**Second unproven mechanism to verify on ONE account (parallel to STEP 0a):** Google identity linking. Before importing all 3 Google identities, insert ONE Google user's `auth.users`+`auth.identities`, then on staging do a real "Sign in with Google" and confirm it logs into the **existing** `auth.users.id` (matches `users.id`) rather than minting a new id. Only then import the other 2.

### P5. New middleware (written on the cutover branch; not merged to active middleware yet)
- [ ] `middleware.ts` rewrite using `@supabase/ssr` `createServerClient` with the request/response cookie bridge; call `supabase.auth.getUser()` (or `getClaims()`); preserve the **exact** public-path allowlist and matcher from the current file; redirect unauth → `/login`, and (deactivated → null user) → `/403`. **Must return the same response object the cookies were set on** (the #1 `@supabase/ssr` footgun). Held on the cutover branch until the cutover sitting.

### P6. New client session provider + `useSession` shim (written; swapped at cutover)
- [ ] Rewrite `components/providers/SessionProvider.tsx` to a Supabase-backed provider that: on mount + on `supabase.auth.onAuthStateChange` (`SIGNED_IN`/`SIGNED_OUT`/`TOKEN_REFRESHED`) fetches `/api/auth/me`, stores `{ data: Session|null, status }` in context.
- [ ] Export a drop-in `useSession()` from the same module returning the **NextAuth shape** `{ data, status }` so the 13 callsites + `ViewAsProvider` are import-path swaps only.
- [ ] Prepare (don't apply yet) the codemod: in the ~14 files, `import { useSession } from 'next-auth/react'` → `from '@/components/providers/SessionProvider'`; `signIn`/`signOut` → Supabase equivalents (login page + sign-out button).

### P7. Staging rehearsal (REQUIRED — hard gate, not optional)
- [ ] Rehearse the **entire** cutover end-to-end on a **Supabase branch** (MCP `create_branch`) or the existing `mpua-staging` project, against a copy of prod auth data: a full **import → C3 → C4 → C5 → C6** pass, plus a real password login and a real Google login. Capture the exact confirmation output of each step (the `/api/auth/me` shape, the cookie-persistence check, the Google same-id check). **The prod cutover does not begin until this rehearsal has completed a full green pass with captured outputs** (mirrored in the Part 2 pre-flight). For a single cutover with five named whole-app failure modes, this is the line between "rehearsed once" and "first run is prod" — it is a gate, not a recommendation.

---

## Part 2 — The cutover (single sitting, ordered, with per-step confirmation)

Run during a low-traffic window. **Everyone is logged out at the start** (NextAuth cookies stop being honored) and logs back in via Supabase. Do not advance a step until its confirmation passes.

> **Pre-flight (every box must be checked before C1):**
> - [ ] STEP 0a green (one password user signs in via `signInWithPassword` against an imported `$2a$` hash).
> - [ ] STEP 0b contract test green in CI.
> - [ ] **P7 staging rehearsal completed a full `import → C3 → C4 → C5 → C6` pass** on a Supabase branch / `mpua-staging`, with captured confirmation outputs (the `/api/auth/me` shape, cookie persistence, Google same-id).
> - [ ] **Every required key in `docs/auth-migration-secrets.md` present in prod** (4 public + 13 server secrets + 12 server config — verified against the named checklist, not a count). Confirm `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_ID`/`SECRET`, `GMAIL_*` (invite/reset email), `AUTH_SECRET`+`NEXTAUTH_URL` (still needed until C7).
> - [ ] Supabase dashboard: Google provider enabled with prod redirect URL; asymmetric JWT signing keys enabled; Site URL + redirect allowlist set for reset/invite links (`docs/auth-migration-secrets.md` § dashboard).

**C1 — Run `auth.users`/`auth.identities` import (FLAGGED: data backfill).**
- Confirm: `SELECT count(*) FROM auth.users;` = 23. `SELECT count(*) FROM auth.identities WHERE provider='google';` = 3. `SELECT count(*) FROM public.users u WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id=u.id);` = **0** (every profile has a matching auth user).

**C2 — Add the FK (FLAGGED: schema change; validates against data).** Run `ADD CONSTRAINT users_id_authusers_fkey ...` from migration 126.
- Confirm: constraint exists and is `VALID`: `SELECT convalidated FROM pg_constraint WHERE conname='users_id_authusers_fkey';` → `t`. (If it fails, an id is unmatched — fix C1, do not proceed.)

**C3 — Parallel-verify `auth()` BEFORE flipping the middleware (REQUIRED — no escape hatch).** Deploy the new `auth()` + `/api/auth/me` + the `@supabase/ssr` server client **while NextAuth middleware is still live**. Mint a Supabase session out-of-band with a scripted `signInWithPassword` (sets the `sb-…-auth-token` cookie), then hit `/api/auth/me`.
- Confirm: `/api/auth/me` returns the **exact** `{ user: {id, email, name, image, role, agency(UPPERCASE)} }` for a known user — `role` and `agency` correct, `agency` uppercased, `id` non-empty. Do this for at least one `dg`, one `agency_admin`, and one `officer`.
- **Why this step is mandatory:** in a no-bisect single cutover, C3 is the *only* moment that isolates **failure mode 1** (is `auth()` correct?) from **failure mode 2** (is the middleware cookie bridge correct?). If you skip straight to C4 and login breaks, you cannot tell which of the two it is. C3 proves `auth()` in isolation — the new server reads a real Supabase cookie and returns the contract shape — with NextAuth still carrying live traffic, so a failure here is contained (no user impact) and unambiguous.
- **Cost:** one extra deploy (new `auth()`/`/api/auth/me` shipped a beat before the middleware flip). **Benefit:** the two highest-severity failure modes are decoupled and individually proven before any user-facing change. Do **not** advance to C4 until C3 is green.

**C4 — Flip middleware to `@supabase/ssr`.** Merge the rewritten `middleware.ts`. Redeploy.
- Confirm: visiting `/` while unauthenticated → redirect to `/login` (no loop). Log in via password → land on `/`, and a `sb-…-auth-token` cookie is set and **persists** on the next request (no redirect loop). Refresh page → still authenticated (token refresh works).

**C5 — Swap the client provider + `useSession` imports.** Apply the P6 codemod across the ~14 files; replace `signIn('credentials'|'google')` in `app/login/page.tsx` with `supabase.auth.signInWithPassword` / `signInWithOAuth({provider:'google'})`; replace the sign-out button with `supabase.auth.signOut()`. Redeploy.
- Confirm: as a `dg` user, the Sidebar shows the **Admin** section (role resolved, not `officer` fallback); as an agency user, only their agency shows; `ViewAsProvider` "View As" appears for DG. Network tab: `/api/auth/me` 200 with correct role.

**C6 — Point Google login at Supabase + scope-complete the Connect-Google flow.** Confirm `signInWithOAuth({provider:'google'})` round-trips and lands on an **existing** `auth.users.id` (matches the pre-inserted identity). Apply the §5 scope fix to `/api/integrations/google/authorize`.
- Confirm: one Google-only `dg` signs in via Supabase Google → same id, correct role, Daily Briefing still loads calendar (existing `integration_tokens` row intact).

**C7 — Remove NextAuth.** Delete `app/api/auth/[...nextauth]/route.ts`, the NextAuth provider config, `AuthSessionProvider`'s next-auth import, and `next-auth` from `package.json` (also drop the unused `jsonwebtoken`). Keep `users.password_hash`/`google_sub`/`invite_token*` columns (rollback safety). Redeploy.
- Confirm: full regression pass — log in password + Google; load Briefing, Tasks, Documents, Procurement, Admin → People; perform one admin action; verify an agency user is correctly scoped. `grep -r "next-auth" app lib components` → only removed/none.

---

## Part 3 — Password reset + admin capabilities (lands AFTER the cutover; additive, NOT on the single-cutover critical path)

These are admin tooling, not the login path, so they ship incrementally once Supabase auth is live. Each uses the **service-role** `supabaseAdmin.auth.admin` API, server-side only.

**3a. Admin-initiated password reset (your hard requirement).**
- [ ] Rewrite `app/api/admin/users/[id]/password/route.ts` PUT: `requireRole(['dg'])` → `await supabaseAdmin.auth.admin.updateUserById(id, { password })` → write `admin_audit_log` (`action:'password_reset'`).
- [ ] **Dual-write during the grace window (committed default — see Part 4):** in the same handler, **also** `bcrypt.hash(password, 12)` and write `users.password_hash`, gated on an env flag `AUTH_DUAL_WRITE` (default ON for the 2–4 week grace window). This is what keeps NextAuth-revert lossless even after admin resets. When the window closes (the `127_drop_legacy_auth_columns` migration), set `AUTH_DUAL_WRITE=off` and remove this branch. (Do **not** drop the bcrypt write before the window closes — that was the gap in the prior draft.)
- [ ] Wire UI: in `components/admin/UserDetailDrawer.tsx` `SecuritySection` (currently the orphan's natural home), add a **Reset Password** `ActionButton` + inline new-password input (min 8) calling `PUT /api/admin/users/${id}/password`. This is the ~1-hour fix that closes "no way to reset a password."

**3b. Admin-initiated user creation.**
- [ ] Change `POST /api/admin/users`: create the auth user first — `supabaseAdmin.auth.admin.createUser({ email, password?, email_confirm: true })` (set password) **or** `inviteUserByEmail(email)` (emailed link) — then insert the `users` profile row with the **returned auth id** (so the FK holds). Reconcile with / retire the legacy `users.invite_token` + `/set-password` path (migrate it onto Supabase invite/recovery links).

**3c. Self-service password reset (email flow).**
- [ ] `supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password' })`; add `app/reset-password/page.tsx` that, on the recovery session, calls `supabase.auth.updateUser({ password })`. Add a **"Forgot password?"** link on `/login` (absent today).
- [ ] **Dual-write during the grace window (committed default):** the self-service path establishes a recovery *session*, so the new password isn't available to the server route the way 3a's is. Implement the dual-write by adding a Supabase **Auth Hook** / a thin server endpoint the reset page also calls post-update, OR — simpler and recommended — handle the self-service reset **server-side**: the `/reset-password` page POSTs the new password to `app/api/auth/reset/route.ts`, which (after verifying the recovery token) calls `supabaseAdmin.auth.admin.updateUserById(uid, { password })` **and** bcrypt-writes `users.password_hash` (flag `AUTH_DUAL_WRITE`), identical to 3a. This keeps both self-service and admin resets lossless-revertible during the window. Remove when the window closes.

**3d. Account deactivation.**
- [ ] In `app/api/admin/users/[id]/route.ts` PATCH `suspend`/`archive`: alongside the profile `status`/`is_active` writes, call `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' })`; `reactivate`/`restore` → `ban_duration: 'none'`. (Also fixes the current **no-op `force_signout`** — banning + the middleware `getUser()` check actually ends the session.)

**Service-role confirmation:** every call in 3a–3d uses `supabaseAdmin` (service-role) inside API routes only. The audit verified the service-role key is server-only with zero client imports — keep it that way (no `auth.admin.*` in any `'use client'` file).

---

## Part 4 — Rollback & the point of no return (the real version)

**Code rollback mechanics:** `git revert` the cutover commit(s) + redeploy restores NextAuth. This works **only because** we deliberately keep `password_hash`/`google_sub`/`invite_token*` columns and the `gen_random_uuid()` default through the cutover. After revert: NextAuth reads `users.password_hash` again; the `auth.users` rows + the `users.id→auth.users` FK simply sit there inertly (NextAuth ignores `auth.users`; the FK stays satisfied). Every revert logs **everyone out once** (Supabase cookies stop being honored) — they re-log-in via NextAuth with their original passwords.

**Dual-write is the committed default (not optional).** 3a and 3c bcrypt-write every Supabase password change back to `users.password_hash` (flag `AUTH_DUAL_WRITE`, ON) for a **grace window of 2–4 weeks** after cutover. This is what makes the analysis below hold — without it, the first password reset would create per-user irreversibility. The window is closed deliberately by the `127_drop_legacy_auth_columns` migration (which drops `password_hash`/`google_sub`/`invite_token*` and is the **true, global point of no return**).

**What becomes irreversible — stated plainly (WITH dual-write on):**

During the grace window, a user can be cleanly reverted to NextAuth. The events that *would* break revert, and how dual-write handles them:

1. **A user resets/changes their password via Supabase** → **No longer irreversible.** Dual-write also bcrypt-writes `users.password_hash`, so NextAuth-revert finds the *current* password. (This was failure case 1 in the prior draft; dual-write removes it.)
2. **A brand-new user is created via Supabase** (auth.users-first) → **Still irreversible.** A user created only in `auth.users` has no `users.password_hash` history; on revert they cannot log in via NextAuth. Dual-write at *create* time (3b) can mitigate if you set a password (bcrypt-write it too), but invited/OAuth-only new users have nothing to dual-write — treat any post-cutover-created user as Supabase-only.
3. **A Google-only user re-links** under Supabase → **Not irreversible.** Identity stays in `auth.identities`; NextAuth's `google_sub` match still works on revert because `users.google_sub` is preserved. Google users are the safest to revert.

**Therefore, the point of no return reduces to exactly two things:**
- **(a) New users created Supabase-first** during the window that you need to keep (case 2) — these are lost on revert regardless of dual-write.
- **(b) Running the `127_drop_legacy_auth_columns` migration** — this is the **single global point of no return**. The moment `password_hash`/`google_sub` are dropped, NextAuth-revert is impossible for everyone. Until then, the existing 20 credentialed users (17 password + 3 Google) revert losslessly, and so do any in-window password resets (thanks to dual-write).

**Operational guidance:** keep `AUTH_DUAL_WRITE=on` and the legacy columns for the full 2–4 weeks. Only after a clean window (no auth incidents, resets working, admin tooling proven) do you set `AUTH_DUAL_WRITE=off`, run `127_drop_legacy_auth_columns` (FLAGGED DROP COLUMN), and accept the global point of no return.

---

## Part 5 — Google login move + the forced scope fix (honoring "Briefing/Vault must not regress")

- Login identity → Supabase Google provider (C6). Existing `integration_tokens` rows (provider `google_calendar`, keyed by the preserved user UUID) are **untouched** and keep working — Briefing/Vault unaffected for already-connected users.
- **Forced additive fix (audit finding):** the calendar/drive refresh-token capture currently rides the NextAuth login callback (`lib/auth.ts:196-214`, scopes `calendar.events` **+ `drive.readonly`**). Removing NextAuth removes the only flow that requests `drive.readonly`. The dedicated `/api/integrations/google/authorize` requests `calendar` + `calendar.events` + `userinfo.email` — **no Drive**. So **add `https://www.googleapis.com/auth/drive.readonly` (and confirm `calendar.events`) to that route's `SCOPES`** (`app/api/integrations/google/authorize/route.ts:5-9`) so the standalone "Connect Google" step can (re)authorize **both** Calendar and Drive independently of login. Without this, a user who must re-grant Drive post-cutover has no path.
- Behavioral change to communicate: Google sign-in no longer **opportunistically** grabs API tokens. New/re-authorizing users use the explicit "Connect Google" step (which you’re making scope-complete). The 3 existing Google users keep their stored tokens; you’ve said you’ll notify them.

---

## Honesty: single-cutover failure modes (no bisect — four subsystems move together)

| # | Failure (login breaks for everyone) | Originating step | Fastest diagnostic |
|---|---|---|---|
| 1 | `auth()` contract mismatch → every `requireRole()` 401/403; whole app dead | C3/P3 (server `auth()`) | `GET /api/auth/me` for a known user — compare keys/values to the §STEP 0b contract. Caught pre-cutover by the contract test if it’s green. |
| 2 | Cookie bridge wrong → login "succeeds" then immediate redirect-to-`/login` loop | C4 (middleware) | After login, inspect `Set-Cookie` for `sb-…-auth-token` and whether it’s **sent back** on the next request. Classic `@supabase/ssr` "didn’t return the response you set cookies on." |
| 3 | bcrypt variant rejected → all 17 password users "invalid credentials" | C1 (hash import) | Caught by STEP 0a on ONE user before the other 16. If live: `signInWithPassword` → `invalid_grant`; check `left(encrypted_password,4)`. |
| 4 | Google identity not linked → Google sign-in mints a NEW `auth.users.id` with no profile → DG has no role / `officer` fallback / FK orphan | C6 (Google) | After Google sign-in: compare `auth.users.id` to `users.id`; check `auth.identities` has the `google_sub`. Caught by the P4 one-account Google rehearsal. |
| 5 | Client `useSession` shape off / null → `ViewAsProvider` falls back to `role:'officer'` for everyone → app renders lowest-privilege even though API auth works | C5 (client swap) | Browser network: `/api/auth/me` 200 + correct role; check `ViewAsProvider.realUser.role`. UI symptom: Admin section vanishes for DG. |

**This is not clean.** Five distinct ways the whole login surface can break, across four subsystems that change in one sitting, with no incremental bisect once live. The mitigations are: STEP 0a + 0b as hard gates, a full **staging rehearsal** (P7), per-step confirmations in Part 2, and the dual-write safety net (Part 4).

**Steps I recommend splitting OUT of the single sitting (even though you chose rip-and-replace):**
- **`auth.users` import + STEP 0a verification (C1) must run and be confirmed as PREP, before the code cutover sitting** — not inside it. The import is reversible (delete rows) and idempotent; a hash-variant failure discovered mid-sitting is the worst-case lockout. Treat C1/C2 as "data prep, verified green" and start the code sitting (C4→C7) only after.
- **Part 3 (admin/reset tooling) stays after the cutover** — it’s additive and off the login path; do not bundle it into the sitting.
- Everything else (C4 middleware, C5 client, C6 Google, C7 NextAuth removal) genuinely must move together — they all depend on the Supabase session being the one in effect. I do **not** recommend trying to half-split those; a partial state (NextAuth cookie + Supabase middleware, or mixed providers) is more fragile than the atomic flip.

---

## Migration policy — operations requiring your explicit go-ahead

Per project policy, I will STOP and confirm before each of these (none run without your sign-off):

| Operation | File / action | Why flagged |
|---|---|---|
| **Data backfill** | INSERT into `auth.users` (23 rows) + `auth.identities` (3 rows) | Data backfill into Supabase-managed schema. |
| **Schema change** | `ALTER TABLE users ADD CONSTRAINT users_id_authusers_fkey ... REFERENCES auth.users(id)` | Adds a validated FK; fails if any id unmatched. |
| **DROP CONSTRAINT** (optional) | `DROP CONSTRAINT users_agency_values` | Removes redundant lowercase CHECK. Optional cleanup. |
| **DROP COLUMN** (LATER, post-proof) | drop `password_hash`, `google_sub`, `invite_token`, `invite_token_expires_at` | Only after Supabase is proven and the dual-write window closes. Destructive + ends rollback ability. |
| **RENAME** (NOT planned) | `users` → `profiles` | Explicitly **not** in this plan (§2). If you ever want it, it’s an isolated PR and a flagged RENAME. |

Migration files: `supabase/migrations/126_supabase_auth_fk.sql` (+ a later `127_drop_legacy_auth_columns.sql` for the post-proof cleanup). Applied via the Supabase MCP, only with your go-ahead, against project `ozcdsnpieeetzzwjqvjo`.

---

## Effort & risk summary (direct)

- **Effort:** Prep ≈ 2–3 focused days (clients, schema file, `auth()` rewrite + contract test, import scripts, new middleware/provider on a branch, staging rehearsal). Cutover sitting ≈ a few hours. Part 3 tooling ≈ 1–2 days, incremental. The orphaned-password-reset UI alone is ~1 hour and could ship **today** independent of all of this.
- **Risk:** HIGH and concentrated in one sitting by design. The `auth()` contract (STEP 0b) and the middleware cookie bridge (C4) are where "everyone locked out" lives; the hash variant (STEP 0a) and Google linking (P4) are pre-verifiable on one account each. The staging rehearsal is the difference between "rehearsed once" and "first run is prod."
- **Honest caveat on "fully Supabase-managed":** authorization deliberately stays app-layer — Supabase owns *identity, credentials, sessions, resets, admin*, but **not** request authz. Making RLS the enforcement layer is a separate, large project (rewrite ~180 policies onto one identity convention, per-request authenticated clients at ~240 callsites, stop using the service-role key, `FORCE` RLS). It is explicitly **out of scope** here and noted as a future, optional phase.

---

## Separate note — two unauthenticated routes (do NOT fix in this migration)

The audit found two routes with no code-level auth check that are also **not** in the middleware public-path allowlist (so they are reachable without a session):
- `app/api/integrations/google/authorize/route.ts` — public OAuth initiator (only a CSRF state cookie). Consider a session gate.
- `app/api/pulse/gpl/score/route.ts` — returns computed GPL operational metrics with no auth.

Flagged for visibility only; out of scope for the auth migration. Decide separately whether each should be gated or explicitly allowlisted.
