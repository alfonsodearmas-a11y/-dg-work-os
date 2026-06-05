-- 02_import_google_identities.sql — Part 1 / P4.
-- ⚠️ DO NOT RUN until the cutover sitting (step C1). Run AFTER 01_*.sql.
--
-- Links the 3 Google-only users in auth.identities so "Sign in with Google" lands
-- on the EXISTING auth.users.id (matching public.users.id) instead of minting a
-- new id. The Google `sub` (stored as users.google_sub) is the provider_id.
-- Idempotent: ON CONFLICT (provider, provider_id) DO NOTHING.

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  u.google_sub,
  u.id,
  jsonb_build_object('sub', u.google_sub, 'email', lower(u.email)),
  'google',
  now(), now(), now()
FROM public.users u
WHERE u.google_sub IS NOT NULL
ON CONFLICT (provider, provider_id) DO NOTHING;
