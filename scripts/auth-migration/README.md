# Supabase Auth migration — cutover scripts (Part 1 / P4)

> ⚠️ **NOTHING IN THIS FOLDER RUNS DURING PART 1.** These SQL files seed Supabase
> `auth.users`/`auth.identities` and are executed **only during the cutover sitting
> (step C1)**, via the Supabase MCP, with explicit go-ahead. They are written and
> committed now so they can be reviewed; they are inert on `main`.

Plan reference: `docs/auth-migration-plan.md`. Project: `ozcdsnpieeetzzwjqvjo` (dg-command-center).

## What's here

| File | Purpose | When |
|---|---|---|
| `01_import_auth_users.sql` | Seed `auth.users` for all 23 profiles, id-preserved, token columns `''` | C1 |
| `02_import_google_identities.sql` | Link the 3 Google-only users (`auth.identities`) | C1, after 01 |
| `03_ban_system_account.sql` | Ban the `system` account indefinitely | C1, after 01 |
| `00_VERIFY.sql` | C1 confirmation queries (counts close, no NULL token cols) | C1, after 01–03 |

## Rehearsal-established facts baked in (2026-06-04, mpua-staging)

- GoTrue **accepts the existing bcrypt `$2a$` hashes** as-is — no prefix rewrite.
- Manual `auth.users` inserts **must** set the string-token columns
  (`confirmation_token`, `recovery_token`, `email_change`, `email_change_token_new`,
  `email_change_token_current`, `phone_change`, `phone_change_token`,
  `reauthentication_token`) to `''` (NOT NULL) and `email_change_confirm_status = 0`,
  or every sign-in 500s `"Database error querying schema"`. `00_VERIFY.sql` guards this.

## Cohorts (reconciled, sums to 23)

- 17 password (transplant hash) · 3 Google-only (identity-linked) · 3 no-creds:
  2 invited humans (`indardeodat@gmail.com` minister, `teamleaderpa@gplinc.com`
  agency_admin·GPL — both external domains → invite/password only) + 1 `system`
  (`system@mpua.gov.gy`, banned).

## Cutover ordering (from the plan)

1. **C1** — run `01` → `02` → `03`, then `00_VERIFY` (expect: 0 profiles without an
   auth user, 3 google identities, 1 banned, 0 NULL-token rows).
2. **C2** — apply `supabase/migrations/126_supabase_auth_fk.sql` (FK; `convalidated=t`).
3. **C3** — deploy the new `auth()`/`/api/auth/me` alongside live NextAuth; verify
   `/api/auth/me` shape (contract test `lib/__tests__/auth-contract.test.ts` is the
   pre-cutover gate).
4. **C4** — replace root `middleware.ts` with `lib/cutover/middleware.supabase.ts`.
5. **C5** — swap the client provider + codemod the import sites (below).
6. **C6** — point Google login at the Supabase provider; scope-complete
   `/api/integrations/google/authorize` (add `drive.readonly`).
7. **C7** — remove NextAuth.

## C5 codemod — `next-auth/react` import sites to swap

Replace `from 'next-auth/react'` → `from '@/components/providers/SupabaseSessionProvider'`
for `useSession`, and replace `signIn`/`signOut` with `supabase.auth.signInWithPassword` /
`signInWithOAuth({provider:'google'})` / `signOut`. Verified site list (re-grep
`next-auth/react` at cutover to catch any new ones):

**Provider swap (in the app layout, not a codemod):**
- `components/providers/SessionProvider.tsx` (`AuthSessionProvider` → `SupabaseSessionProvider`)

**`useSession` import sites (~14):**
- `components/providers/ViewAsProvider.tsx`
- `components/layout/Sidebar.tsx`
- `components/notifications/NotificationProvider.tsx`
- `components/notifications/PushNotificationSettings.tsx`
- `components/notifications/PushPromptBanner.tsx`
- `components/procurement/ProcurementDetailPanel.tsx`
- `components/procurement/ProcurementKanban.tsx`
- `components/procurement/ProcurementNewPackageForm.tsx`
- `components/tasks/TaskComments.tsx`
- `components/tasks/TaskDetailPanel.tsx`
- `hooks/useModuleAccess.ts`
- `hooks/usePeople.tsx`
- `app/procurement/page.tsx`, `app/procurement/inbox/page.tsx`, `app/procurement/archived/page.tsx`
- `app/projects/[id]/page.tsx`

**`signIn`/`signOut` sites (auth actions):**
- `app/login/page.tsx` (`signIn('credentials'|'google')` → Supabase)
- `app/403/page.tsx` (`signIn`/`signOut`)
- `components/layout/Sidebar.tsx` (`signIn`/`signOut`)

> Note: the earlier plan estimate of "~14" import sites undercounted — the verified
> total is ~17 files referencing `next-auth/react` (the extras: `usePeople.tsx`,
> `Sidebar`, `403`, `login`). Always re-grep at cutover.
