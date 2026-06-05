# Auth Migration — Environment Variable Checklist

Referenced by `docs/auth-migration-plan.md` Part 2 pre-flight. Verify every **required** key is present in the **production** environment before the cutover begins. Enumerated from the actual `process.env.*` references in `app/`, `lib/`, `middleware.ts`, `components/` (plus NextAuth's implicit secret).

> Counts: **4** public (`NEXT_PUBLIC_*`) vars, **13** server secrets, **12** server config vars. (The earlier "19 + 3" was an approximation; this is the enumerated truth.)

## Public — exposed to browser (`NEXT_PUBLIC_*`) — 4
- [ ] `NEXT_PUBLIC_SUPABASE_URL` — used by `@supabase/ssr` browser + server clients **and** the existing `lib/db.ts`. **Auth-critical.**
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — `@supabase/ssr` clients. **Auth-critical.**
- [ ] `NEXT_PUBLIC_APP_URL` — base URL for redirects (login, reset, Google connect).
- [ ] `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — web push (unrelated to auth; do not lose it).

## Server secrets — 13
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — **the** key for the GoTrue admin API (`auth.admin.createUser/updateUserById/inviteUserByEmail/deleteUser`) and all `supabaseAdmin` reads. **Auth-critical. Server-only — never `NEXT_PUBLIC_`.**
- [ ] `AUTH_SECRET` / `NEXTAUTH_SECRET` — read **internally** by NextAuth v5 (no literal `process.env` ref in code). **Required until C7**, then **OBSOLETE** (remove after NextAuth is deleted).
- [ ] `GOOGLE_CLIENT_SECRET` — OAuth token exchange (login move + the Calendar/Drive connect flow). **Auth-critical.**
- [ ] `GOOGLE_REFRESH_TOKEN` — service-level Google token (calendar fallbacks).
- [ ] `GMAIL_APP_PASSWORD` — SMTP for invite/reset emails. **Needed for Part 3 reset/invite delivery.**
- [ ] `CRON_SECRET` — cron/webhook bearer (unchanged by migration).
- [ ] `ANTHROPIC_API_KEY`
- [ ] `OPENAI_API_KEY`
- [ ] `FIREFLIES_API_KEY`
- [ ] `TRELLO_API_KEY`
- [ ] `TRELLO_TOKEN`
- [ ] `VAPID_PRIVATE_KEY` — web push signing.
- [ ] `PG_PASSWORD` — direct Postgres pool (`lib/db-pg.ts`), separate from Supabase.

## Server config — non-secret but required — 12
- [ ] `GOOGLE_CLIENT_ID` — also configure in the Supabase dashboard Google provider (see below).
- [ ] `GOOGLE_CALENDAR_ID`
- [ ] `ALLOWED_GOOGLE_DOMAINS` — domain whitelist. **Note:** the 2 invited humans use external domains (`gmail.com`, `gplinc.com`) → they cannot use Google sign-in; they get password/invite links (see plan P4/Fix 6).
- [ ] `GMAIL_USER` — SMTP sender.
- [ ] `DG_EMAIL`
- [ ] `NEXTAUTH_URL` — **Required until C7**, then **OBSOLETE**.
- [ ] `VAPID_PUBLIC_KEY` (server-side counterpart) · [ ] `VAPID_SUBJECT`
- [ ] `PG_HOST` · [ ] `PG_PORT` · [ ] `PG_USER` · [ ] `PG_DATABASE`

## Supabase dashboard config — NOT env vars, but required for the cutover
- [ ] **Google provider** enabled with `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and the prod **redirect URL** (`https://<app>/auth/callback` or the Supabase callback) registered in both Supabase and Google Cloud console.
- [ ] **Asymmetric JWT signing keys** enabled so `auth.getClaims()` verifies locally (avoids a GoTrue round-trip on all 249 routes; see plan P3).
- [ ] **Site URL + redirect allowlist** set so `resetPasswordForEmail`/`inviteUserByEmail` links land on `/reset-password` / `/set-password` (Part 3).

## Not auth-critical (other env seen in code, listed for completeness)
`LOG_LEVEL`, `NEXT_PHASE`, `ANTHROPIC_ZDR_CONFIRMED`, `EARNED_TRUST_ENABLED`, `NOTIFICATIONS_DELIVERY_LOG`, `TASKS_GRACE_PERIOD_DAYS`.
