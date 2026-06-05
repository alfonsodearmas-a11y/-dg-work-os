-- 00_VERIFY.sql — Part 1 / P4. The C1 confirmation queries (run AFTER 01–03).
-- ⚠️ Read-only. Run at cutover to confirm the import closed before adding the FK (C2).

-- Every profile must have a matching auth.users row (this is what makes the FK addable).
SELECT count(*) AS profiles_without_auth_user
FROM public.users u
WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id);   -- expect 0

-- Cohort/seed counts.
SELECT
  (SELECT count(*) FROM public.users)                                          AS profiles_total,        -- expect 23
  (SELECT count(*) FROM auth.users a WHERE EXISTS
     (SELECT 1 FROM public.users u WHERE u.id = a.id))                          AS auth_users_for_profiles, -- expect 23
  (SELECT count(*) FROM auth.identities WHERE provider = 'google')             AS google_identities,     -- expect 3
  (SELECT count(*) FROM auth.users
     WHERE banned_until IS NOT NULL AND banned_until > now())                  AS banned_system;         -- expect 1 (system; 03_*.sql bans to 2999-01-01 — a '=infinity' check is stale and false-negatives)

-- REHEARSAL GOTCHA GUARD: no NULL string-token columns (would 500 GoTrue on sign-in).
SELECT count(*) AS rows_with_null_tokens
FROM auth.users
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;                            -- expect 0
