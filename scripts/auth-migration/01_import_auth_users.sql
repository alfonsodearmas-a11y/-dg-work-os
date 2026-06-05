-- 01_import_auth_users.sql — Part 1 / P4.
-- ⚠️ DO NOT RUN until the cutover sitting (step C1), with explicit go-ahead.
--
-- Seeds auth.users for all 23 public.users rows, PRESERVING each uuid so the FK
-- (migration 126) and all 63 child FKs stay valid. Run via the Supabase MCP at
-- cutover. Idempotent: ON CONFLICT (id) DO NOTHING.
--
-- REHEARSAL-VERIFIED (2026-06-04, mpua-staging):
--   * GoTrue accepts the existing bcrypt $2a$ hashes as-is — NO prefix rewrite.
--   * Every string-token column MUST be '' (not NULL) and email_change_confirm_status = 0,
--     or GoTrue returns HTTP 500 "Database error querying schema" on sign-in.
--
-- Expected cohort sizes (reconciled): 17 password + 3 google-only + 3 no-creds = 23.

-- Cohort 1 — 17 password users: transplant the bcrypt hash.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  lower(u.email), u.password_hash, now(), now(), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  '{}'::jsonb,
  '', '', '', '', '', '', '', '', 0
FROM public.users u
WHERE u.password_hash IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Cohort 2 — 3 Google-only users: no password; identity linked in 02_*.sql.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  lower(u.email), now(), now(), now(),
  jsonb_build_object('provider', 'google', 'providers', jsonb_build_array('google')),
  '{}'::jsonb,
  '', '', '', '', '', '', '', '', 0
FROM public.users u
WHERE u.google_sub IS NOT NULL AND u.password_hash IS NULL
ON CONFLICT (id) DO NOTHING;

-- Cohort 3 — 3 no-creds (1 system + 2 invited humans): no password yet.
-- The 2 invited users get a Supabase invite link post-cutover (Part 3b); the
-- system user is banned in 03_*.sql.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token,
  email_change_confirm_status
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
  lower(u.email), now(), now(), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
  '{}'::jsonb,
  '', '', '', '', '', '', '', '', 0
FROM public.users u
WHERE u.password_hash IS NULL AND u.google_sub IS NULL
ON CONFLICT (id) DO NOTHING;
