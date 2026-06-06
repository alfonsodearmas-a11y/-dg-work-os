# Role Simplification + Self-Service Auth — Investigation & Plan

**Date:** 2026-06-05 · **Status:** PROPOSED — nothing built. Investigation verified against the live prod DB (`ozcdsnpieeetzzwjqvjo`) and the current codebase (post Supabase Auth cutover).

---

## Part A — Self-service auth: findings

### What exists today

| Capability | Status | Where |
|---|---|---|
| Admin-initiated password reset | ✅ Works | `PUT /api/admin/users/[id]/password` — DG-only, calls `supabaseAdmin.auth.admin.updateUserById(id, { password })`. Correctly updates `auth.users` post-cutover. |
| Invite onboarding (set first password) | ⚠️ **BROKEN post-cutover** | See below. |
| "Forgot password?" link on login | ❌ Does not exist | `app/login/page.tsx` renders only email/password + submit. No link, no secondary action. |
| `/forgot-password` or `/reset-password` route | ❌ Does not exist | No such page or API route anywhere under `app/`. |
| `supabase.auth.resetPasswordForEmail` | ❌ Zero call sites | Verified by grep across `app/`, `lib/`, `components/`. |
| `signInWithOtp` / `verifyOtp` (magic link / OTP) | ❌ Zero call sites | Same grep — nothing. |

**Conclusion confirmed:** the only password recovery path is a user phoning/emailing you so you click Reset in the admin UI. There is no self-service anything.

### New finding: the invite flow is broken since the cutover

The invite path was never migrated to Supabase Auth:

1. `POST /api/admin/users` (invite) inserts into `public.users` only — **it never creates an `auth.users` record** (no `auth.admin.createUser` / `inviteUserByEmail`).
2. `POST /api/auth/set-password` (the invitee's "set your password" step) bcrypt-hashes the password into **`public.users.password_hash`** — a column GoTrue never reads (`app/api/auth/set-password/route.ts:35-49`).
3. Login is now exclusively `supabase.auth.signInWithPassword` → validates against `auth.users` → **a newly invited user can never log in.** (The 23 existing users work only because the cutover imported them into `auth.users`.)

This must be fixed in the same workstream as the reset flow (Phase 1 below) — it's the same plumbing.

---

## Part B — Current role/permission system map

### B1. The role values (7)

`users_role_check` (prod, `000_baseline_prod_schema.sql:2599`):
`dg | minister | ps | parl_sec | agency_admin | officer | system`

- `Role` TS union (`lib/auth.ts:16`) covers the 6 human roles; `system` is deliberately outside the union — `buildSession()` returns `null` for it (`lib/auth-session.ts:55`), so it can never hold a session. One row: `system@mpua.gov.gy` ("System (Procurement Reconciliation)"), referenced as `decided_role: 'system'` in `lib/psip/ingest.ts`.
- `MINISTRY_ROLES = ['dg','minister','ps','parl_sec']` (`lib/people-types.ts:119`) is the "sees everything" set, used in **45 files**.

### B2. Role vs title — already two fields, conflated in behavior

`public.users` has **both** `role` (permission) and **`formal_title`** (display text). All 22 human users have `formal_title` populated. Proof they already diverge: **Keisha Crighton is `role=dg` (full permissions) with `formal_title='Analyst'`**. The UI already prefers `formal_title` over the role label where present (`UserDetailDrawer.tsx:464`, `UserRolesSection.tsx:61`). So "title separated from permission" is mostly a formalization of what the schema already has — the work is collapsing `role` and making `formal_title` the only human-facing label.

### B3. Where role gates access (the full surface)

**1) `requireRole()` — 327 call sites across 262 API route files.** Every distinct pattern in the codebase:

| Pattern (current) | Count | Meaning |
|---|---|---|
| `['dg','minister','ps','agency_admin','officer']` | 215 | any authenticated user (parl_sec auto-aliased via the `ps` hack in `requireRole`) |
| `['dg']` | 34 | DG only — user mgmt, module access admin, task verify/refer/dispute, NPTAB, notifications digest |
| `['dg','minister','ps','agency_admin']` | 24 | everyone **except officer** — assign/verify-type actions |
| `['dg','minister','ps']` | 16 | ministry seniors (PSIP sync etc.) |
| `['dg','ps']` | 12 | NPTAB reports surface |
| `['dg','ps','agency_admin','officer']` | 6 | mixed |
| all 6 roles explicit | 6 | any authenticated user |
| `['dg','agency_admin']` | 5 | DG + agency managers |
| `['dg','minister']` | 3 | — |
| `['minister']` | 2 | **minister-only**: `tasks/[id]/minister/close`, `tasks/[id]/minister/acknowledge` |
| `['minister','dg']` | 1 | — |
| `['dg','ps','agency_admin']` | 1 | — |
| `['dg','agency_admin','officer']` | 2 | upload roles |

Plus wrappers: `requirePsipSyncAccess()` (= dg/minister/ps), `requireUploadRole()` (= dg/agency_admin/officer + `canUploadData`). Note `requireRole` contains a special-case hack: `ps` in the list implicitly admits `parl_sec` (`lib/auth-helpers.ts:30-32`).

**2) Pure permission helpers** (`lib/auth-roles.ts`, used by 48 files for `canAccessAgency` alone):

| Helper | Current logic |
|---|---|
| `canAccessAgency` | ministry roles → all agencies; agency roles → `userAgency === target` (own agency only — **confirmed enforced**, canonical UPPERCASE per migration 106) |
| `canUploadData` | `dg` → yes; `minister/ps/parl_sec` → **no**; `agency_admin/officer` → own agency only |
| `canAssignTasks` | everyone **except officer** |
| `canVerify` | ministry → any task; `agency_admin` → own-agency tasks; officer → never |
| `canAccessPsipSync` | ministry only |

**3) Module visibility system** (DB-driven, drives the Sidebar via `useModuleAccess`): `modules.default_roles` is a **text array of role names per module** (23 rows in prod), with per-user grant/deny overrides in `user_module_access` (incl. `can_edit` and optional agency scope). `lib/modules/access.ts` gives `MINISTRY_ROLES` an unconditional bypass (all modules, full edit). Role-skewed rows in prod: `action-items`/`people`/`settings` → ministry-only; `nptab-reports` → `['dg','ps']`; `minister-attention` → `['minister']`; `applications` → `[]` (override-only). **The migration must rewrite these arrays.**

**4) Client-side role checks — ~33 sites in components**, e.g. Sidebar `ADMIN_ROLES = MINISTRY_ROLES` + per-item `requireRole` (`Sidebar.tsx:107-108`), View-As is `role === 'dg'` only (`Sidebar.tsx:175`), KanbanBoard officer self-assign-only (`KanbanBoard.tsx:772`), WarRoom upload `dg||ps`, VerificationSurface `dg`-only, delayed-projects agency detection `agency_admin||officer`.

**5) RLS policies in prod** — the hidden surface. 38 policies match role keywords; **~28 encode user-role arrays** (e.g. `documents_ministry_read` → `role = ANY('dg','minister','ps','parl_sec')`, `projects_agency_read` → `role = ANY('agency_admin','officer') AND upper(agency) = …`), plus the `is_dg_or_above()` SQL function. Mitigating fact: the app reads/writes through `supabaseAdmin` (service role, bypasses RLS), so these are defense-in-depth, not the live path. Also: **5 policies still key off `auth.jwt()->>'userId'` — a NextAuth-era claim that no longer exists in Supabase JWTs; they are already dead** and should be rewritten in the same pass.

**6) People/permission-matrix subsystem** (`lib/people-permissions.ts`, `/api/people/*`): a `roles` table (6 rows, `hierarchy_level`), `role_permissions`, `core_permissions`, `delegated_permissions`, `object_access_grants`. Powers the People admin UI matrix; `ROLE_HIERARCHY` + `canManageUser()` gate who can manage whom. Collapses cleanly (see C6).

**7) Legacy shims**: `authorizeRoles()/isDG()/isCEO()` etc. in `lib/auth.ts` — only **2 remaining call-site files** (`app/api/tm/tasks/[id]/route.ts`, `.../extension/route.ts`).

---

## Part C — Target design: two permission levels + display title

### C1. The model

```
role ∈ { superadmin, agency_manager }        ← permission, gates everything
title: string (free text, from formal_title)  ← display only, gates nothing
```

- **superadmin** — sees and does everything, all agencies. (Absorbs dg, minister, ps, parl_sec.)
- **agency_manager** — sees and does everything **for their own agency** (`users.agency` NOT NULL enforced). (Absorbs agency_admin; officer per recommendation C7.)
- `system` stays as a third *non-session* value in the DB CHECK — it is not a permission level (sessions impossible, unchanged `buildSession` guard).
- Title: reuse the existing `formal_title` column as-is (no rename — avoids touching 10+ query sites and a destructive op). "Director General", "Minister", "Permanent Secretary", "Parliamentary Secretary", "Agency Manager", "Analyst" become preset suggestions in a free-text field.

### C2. Session/auth() contract change

New shape returned by `auth()` → all 327 `requireRole()` sites + 13 `useSession` sites + ViewAsProvider:

```ts
SESSION_FIELDS = ['id','email','name','image','role','agency','title']  // +title
type Role = 'superadmin' | 'agency_manager';
```

- `lib/auth-supabase.ts` profile select adds `formal_title`; `buildSession()` maps it to `user.title` (string | null).
- **Transition normalization (the safety device):** `buildSession()` maps old stored values → new (`dg|minister|ps|parl_sec → superadmin`, `agency_admin|officer → agency_manager`) so code and DB can flip independently (Phase 2/3 sequencing below).
- **Contract test** (`lib/__tests__/auth-contract.test.ts`) updates: new `SESSION_FIELDS` snapshot, title pass-through + null coercion, old→new role normalization cases (one per legacy role), `system` still → null, agency uppercasing unchanged.

### C3. `requireRole()` collapse — every pattern mapped

`requireRole(allowed: Role[])` keeps its exact signature and NextResponse contract (zero churn in route-handler structure); the `parl_sec` aliasing hack is deleted.

| Current pattern | → New | Call sites |
|---|---|---|
| all-roles lists (rows 1, 7 of the B3 table) | `['superadmin','agency_manager']` | 221 |
| `['dg']`, `['dg','minister','ps']`, `['dg','ps']`, `['dg','minister']`, `['minister','dg']` | `['superadmin']` | 66 |
| `['minister']` ×2 | `['superadmin']` — **decision point D1** | 2 |
| `['dg','minister','ps','agency_admin']`, `['dg','agency_admin']`, `['dg','ps','agency_admin']`, `['dg','ps','agency_admin','officer']`, `['dg','agency_admin','officer']` | `['superadmin','agency_manager']` | 38 |

Mechanical, scriptable codemod (13 distinct literal strings). `requirePsipSyncAccess` → `requireRole(['superadmin'])`; `requireUploadRole` keeps its agency check.

### C4. Permission helpers — new logic

```ts
canAccessAgency:  superadmin → true; agency_manager → userAgency === target.toUpperCase()
canUploadData:    superadmin → true; agency_manager → own agency        // ⚠ broadens — D3
canAssignTasks:   true for both                                          // ⚠ broadens for ex-officers — D2
canVerify:        superadmin → any; agency_manager → own-agency tasks    // ⚠ broadens for ex-officers — D2
canAccessPsipSync: superadmin only
MINISTRY_ROLES → replaced by `role === 'superadmin'` (45 files; mostly one-line)
```

### C5. Module system, Sidebar, client checks

- `modules.default_roles` rewritten by migration: ministry-only arrays → `{superadmin}`; mixed arrays → `{superadmin,agency_manager}`; `nptab-reports {dg,ps}` → `{superadmin}`; `minister-attention {minister}` → `{superadmin}` (D1); `applications` stays `[]`. The `FULL_ACCESS_ROLES` ministry bypass in `lib/modules/access.ts` → `superadmin`. Per-user `user_module_access` grant/deny/can_edit overrides survive unchanged (they're keyed by user, not role) — this is the pressure valve if you ever want to hide a module from one specific person without a third role.
- Sidebar: `ADMIN_ROLES` → superadmin; item-level `requireRole` per the C3 table; View-As → superadmin (gains: Keisha, PS, Parl Sec — consistent with "superadmin does everything").
- ~33 client checks: `role === 'dg'` → `role === 'superadmin'`; `role === 'agency_admin' || role === 'officer'` → `role === 'agency_manager'`; officer-specific branches (KanbanBoard `selfAssignOnly`) deleted per D2 outcome.
- `ROLE_LABELS/OPTIONS/COLORS/DESCRIPTIONS/HIERARCHY` (10 files) shrink to 2 entries; user-facing displays switch to `title` (most already prefer `formal_title`).

### C6. People subsystem + role-change authority

- `roles` table → 2 rows (`superadmin` level 7, `agency_manager` level 3); `canManageUser` → `actor is superadmin` (or equal-level for agency_manager: none). `role_permissions` re-seeded for the 2 roles.
- **Who grants superadmin:** today role changes are `requireRole(['dg'])`; under the pure two-level model **any superadmin can manage users, including granting superadmin** — which satisfies "my account can designate anyone superadmin regardless of title" (you are one). Existing guardrails stay: cannot modify/delete own account, full `admin_audit_log` trail. ⚠ If you instead want *only your account* to mint superadmins, that is a hidden third tier (an "owner" flag) — see D4. Recommendation: pure two-level + audit log.
- `SENIOR_INVITE_ROLES` ("only DG invites senior roles") dissolves — any superadmin can invite either level.
- Legacy shims: `isDG/isCEO` → `role === 'superadmin'`; `authorizeRoles` map → `{director→superadmin, admin→superadmin|agency_manager, …}` (2 tm files keep working untouched).

### C7. `officer` and `system` — recommendations

**`officer` → `agency_manager`.** Officers today are *not* read-only — they already upload data for their agency (`canUploadData` includes officer) and use the full module set. What they'd **gain**: assign tasks (vs self-assign-only), verify own-agency tasks, and ~30 routes that excluded them (the 24+5+1 patterns). The 3 real officers (Alicia Lyken/MARAD, Christopher Vandeyar/GWI, Vashana Lall/CJIA) are trusted agency staff; their `title` stays "Analyst". This keeps the model cleanly two-level. **If** you want any of them view-only-for-their-agency instead, say so now — that is a genuine third permission tier (a `read_only` flag or role), and forcing it into two buckets would silently grant them write powers. The per-user module `can_edit`/deny overrides can *partially* approximate read-only, but do not gate the task/upload API routes. → **Decision D2.**

**`system` → keep exactly as-is.** It stays in the DB CHECK, stays outside the TS `Role` union, stays session-incapable. It is an attribution value for automated PSIP writes, not a permission level. Folding it into superadmin would be strictly worse (it would become session-capable if its auth record were ever created).

### C8. Current → target mapping, all 23 users

| User | Email | Current role | → New role | Title (formal_title, unchanged) |
|---|---|---|---|---|
| Alfonso De Armas | alfonso.dearmas@mpua.gov.gy | dg | **superadmin** | Director General |
| Keisha Crighton | keisha.crighton@mpua.gov.gy | dg | **superadmin** | Analyst |
| Deodat Indar *(inactive)* | indardeodat@gmail.com | minister | **superadmin** | Minister |
| Vishal Ambedkar | vambedkar@mpua.gov.gy | ps | **superadmin** | Permanent Secretary |
| Thandi McAllister | par_sec@mpua.gov.gy | parl_sec | **superadmin** | Parliamentary Secretary |
| Kesh Nandlall | knandlall@gplinc.com | agency_admin (GPL) | **agency_manager** | Agency Manager |
| Andrea Andrews *(inactive)* | teamleaderpa@gplinc.com | agency_admin (GPL) | **agency_manager** | Agency Manager |
| Mark David | markd@guyanawaterinc.com | agency_admin (GWI) | **agency_manager** | Agency Manager |
| Ramesh Ghir | rghir@cjairport-gy.com | agency_admin (CJIA) | **agency_manager** | Agency Manager |
| Rickford Samaroo | rickford.samaroo@civilaviation.gy | agency_admin (GCAA) | **agency_manager** | Agency Manager |
| Saheed Sulaman | saheed.sulaman@civilaviation.gy | agency_admin (GCAA) | **agency_manager** | Agency Manager |
| Stephen Thomas | stephenthomas@marad.gov.gy | agency_admin (MARAD) | **agency_manager** | Agency Manager |
| Horace Williams | horwilliams@gmail.com | agency_admin (HECI) | **agency_manager** | Agency Manager |
| Abraham Dorris | abraham.dorris@civilaviation.gy | agency_admin (HAS) | **agency_manager** | Agency Manager |
| Akeem St. Louis | akeems@mpua.gov.gy | agency_admin (HAS) | **agency_manager** | Agency Manager |
| Alicia Lyken | alyken@marad.gov.gy | officer (MARAD) | **agency_manager** *(D2)* | Analyst |
| Christopher Vandeyar | christopherv@guyanawaterinc.com | officer (GWI) | **agency_manager** *(D2)* | Analyst |
| Vashana Lall | vashanalall@yahoo.com | officer (CJIA) | **agency_manager** *(D2)* | Analyst |
| Test GPL Manager | test.gpl.manager@mpua.gov.gy | agency_admin (GPL) | agency_manager | Agency Manager |
| Test GWI Manager | test.gwi.manager@mpua.gov.gy | agency_admin (GWI) | agency_manager | Agency Manager |
| Test MARAD Manager | test.marad.manager@mpua.gov.gy | agency_admin (MARAD) | agency_manager | Agency Manager |
| Test HECI Analyst | test.heci.analyst@mpua.gov.gy | officer (HECI) | agency_manager *(D2)* | Analyst |
| System (Procurement Reconciliation) | system@mpua.gov.gy | system | **system** (unchanged) | — |

Result: **5 superadmin, 17 agency_manager, 1 system.**

---

## Part D — DB migration (the high-risk chokepoint)

⚠ **Same chokepoint shape as the auth cutover**: every one of the 327 `requireRole()` checks reads `session.user.role`, which comes straight from `users.role`. A bad flip = instant lockout for everyone. Mitigation = the normalization layer in C2 + branch rehearsal + snapshot table.

One migration file `supabase/migrations/1xx_role_simplification.sql`, applied via Supabase MCP **only after plan approval, and — because it contains a data backfill — I stop and confirm with you immediately before running it** (per CLAUDE.md). Contents, in order:

1. **Snapshot (rollback insurance):** `CREATE TABLE _role_migration_backup AS SELECT id, role, formal_title FROM users;` — preserves the dg/minister/ps/parl_sec distinctions that the collapse erases.
2. **Backfill titles** *(flagged: data backfill)*: `formal_title` is already populated for all 22 humans — backfill is a no-op safety `UPDATE … WHERE formal_title IS NULL` using the old ROLE_LABELS mapping.
3. **Constraint swap** *(flagged: ALTER + backfill)*: drop `users_role_check` → `UPDATE users SET role = CASE …` (per C8) → re-add CHECK `('superadmin','agency_manager','system')` + re-add the partial constraint that `agency IS NOT NULL` for agency_manager.
4. **`modules.default_roles` rewrite** *(data backfill)*: per C5 mapping, all 23 rows.
5. **`roles` table** re-seed to 2 rows; remap `role_permissions`.
6. **RLS rewrite**: DROP/CREATE the ~28 user-role policies with new arrays (`ministry_read` variants → `role = 'superadmin'`; `agency_read` variants → `role = 'agency_manager' AND upper(agency) = …`); replace `is_dg_or_above()` body with `role = 'superadmin'`; **rewrite the 5 dead `auth.jwt()->>'userId'` policies onto `auth.uid()`** while we're in there.
7. Nothing dropped: `password_hash`, `_role_migration_backup`, and old-name code normalization are cleaned up later in a separate, explicitly-flagged step after a soak period.

**Branch rehearsal (before prod):** `create_branch` (now rebuilds prod zero-diff per the DR work) → apply this migration on the branch → verify: CHECK accepts only new values; 23-user role/title distribution matches C8 exactly; `modules.default_roles` arrays correct; `pg_policies` shows zero references to old role names; `is_dg_or_above()` returns true for a superadmin row. Then delete the branch and run against prod.

---

## Part E — Self-service password reset + magic link (build design)

### E1. Email delivery decision (needed for everything here)

Two viable transports:

- **Option A — Supabase-native SMTP:** configure custom SMTP in Supabase Auth settings (built-in Supabase email is hard-limited to ~2 emails/hour and explicitly not for production), customize the Recovery/Magic-Link templates, set Redirect URLs. Client then calls `supabase.auth.resetPasswordForEmail()` directly.
- **Option B — App-managed (recommended):** server route calls `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })` and sends the link through the **existing, prod-proven Gmail SMTP transport** (`lib/email.ts`, `notifications@mpua.gov.gy`, already delivers invite emails). One email pipeline, full MPUA branding, no new Supabase config beyond the redirect allowlist, no Supabase rate-limit surprises. Anti-enumeration: route always returns `{ success: true }` whether or not the email exists.

**Recommendation: B.** Required Supabase config either way: add `https://dashboard.mpua.gov.gy/reset-password` (and the Vercel preview wildcard if desired) to Auth → URL Configuration → Redirect URLs. Gmail caps (~2,000/day on Workspace) are a non-issue at 23 users.

### E2. "Forgot password?" flow

1. **Login page**: add a "Forgot password?" link under the password field → `/forgot-password`.
2. **`/forgot-password` page** (public, `AuthPageShell`): email input → `POST /api/auth/forgot-password` → always "If that address has an account, a reset link is on its way."
3. **`POST /api/auth/forgot-password`** (public route): rate-limited (per-IP + per-email, reuse the simple in-memory/DB pattern used elsewhere), `generateLink({ type:'recovery' })`, branded email via `sendEmail()`.
4. **Recovery link** → Supabase verify endpoint → establishes a recovery session → redirects through the existing `/auth/callback` (code exchange already implemented) → `next=/reset-password`.
5. **`/reset-password` page**: added to middleware public paths (`middleware.ts:9`); guards that a session exists (else link expired → offer resend); new password + confirm (min 8, matching the existing validation) → `supabase.auth.updateUser({ password })` → full navigation to `/` (user ends up signed in).

### E3. Invite-flow fix (folds into the same phase)

- `POST /api/admin/users` additionally calls `supabaseAdmin.auth.admin.createUser({ email, email_confirm: true })` (id reused for the `public.users` row, mirroring how the 23 were imported).
- `POST /api/auth/set-password` keeps its token UX but swaps the dead `bcrypt → users.password_hash` write for `supabaseAdmin.auth.admin.updateUserById(authUserId, { password })`. `password_hash` goes unused (cleanup later, Part D §7).

### E4. Magic link / OTP sign-in (designed; ship decision is yours — D5)

- Login page gains a secondary action: "Email me a sign-in link".
- App-managed variant (consistent with E1-B): `POST /api/auth/magic-link` → `generateLink({ type: 'magiclink', email })` → branded email → link lands through `/auth/callback` → signed in. (Supabase-native variant is `signInWithOtp()` client-side.)
- Works per-user with zero config — it can ship *alongside* password for everyone, or be the primary path for low-friction users; nothing in the architecture forces the choice.
- Security note for the decision: a magic link makes inbox possession equal account access. For `@mpua.gov.gy` Workspace accounts that's acceptable; for the personal addresses in the user list (gmail.com / yahoo.com) it's weaker than password+admin-reset. Worth deciding per the D5 question.

---

## Part F — Phased, shippable sequence

**Phase 1 — Self-service auth (no schema risk, ships independently, closes live gaps):**
"Forgot password?" + `/forgot-password` + `/reset-password` + invite-flow fix (+ magic link if approved). Supabase redirect-URL config. *Reversible: pure code + one allowlist entry.*

**Phase 2 — Forward-compatible code cutover (DB untouched):**
New `Role` type, `buildSession` old→new normalization + `title` field, contract-test update, `requireRole` codemod (327 sites), helper rewrites, module-bypass change, Sidebar/client checks, label maps, People UI (role dropdown → 2 options, title → editable text with presets). Deploy. The app now runs the two-level model against the *old* DB values via normalization. *Reversible: redeploy previous build.*

**Phase 3 — DB migration (the flagged chokepoint, Part D):**
Branch rehearsal → verify → apply to prod (with the stop-before-destructive confirmation). Normalization makes the flip a no-op from the app's perspective; sessions pick up new values on next request since `auth()` reads the profile fresh per request. *Reversible: `_role_migration_backup` restores exact prior roles + constraint.*

**Phase 4 — Soak, then cleanup (separate, flagged):**
After a week of clean operation: optionally drop `users.password_hash`, drop `_role_migration_backup`, remove the old-name normalization branch. Each destructive item confirmed individually.

**Verification gates:** contract test green in CI (Phases 2–3); manual smoke as each persona (superadmin sees all + admin; agency_manager sees only own agency, blocked from others' intel/uploads with 403); invite a test user end-to-end; full forgot-password round trip in prod; `pg_policies` grep clean.

---

## Part G — Honest blast radius & decisions reserved for you

Routes/behaviors the two-level model **cannot express** — surfaced, not forced:

| # | Decision | What changes | My recommendation |
|---|---|---|---|
| **D1** | 2 minister-only routes (`minister/close`, `minister/acknowledge`) + `minister-attention` module | Become superadmin-wide. Mitigating fact: the only minister account is **inactive** — today these routes are usable by literally no one. | Collapse to superadmin. If minister-exclusivity ever matters again, gate by per-user module grant, not by role. |
| **D2** | **`officer` fate** (3 real users + 1 test) | As agency_manager they gain: task assignment, own-agency task verification, ~30 previously-excluded routes. They already upload data today — they are not read-only now. | Promote to agency_manager. **If you want any of them read-only, that is a hidden third tier — tell me and I'll design it explicitly rather than fake it.** |
| **D3** | `canUploadData` broadening | Keisha, Vishal, Thandi (ex minister/ps/parl_sec bucket) gain data-upload ability superadmins now imply. NPTAB (`dg/ps`) likewise opens to all 5 superadmins. | Accept — it's the definition of "superadmin does everything". |
| **D4** | Who mints superadmins | Pure model: any superadmin can (audited, can't edit own account). Alternative: an `is_owner` flag so only your account can — a de-facto third tier. | Pure two-level + audit log. |
| **D5** | Magic link: ship alongside password, instead-of for some users, or not at all? | Architecture supports any of the three with the same plumbing. | Ship alongside, password remains primary; note the personal-Gmail/Yahoo caveat in E4. |

Everything else in this plan is resolved and ready to build on your approval.
