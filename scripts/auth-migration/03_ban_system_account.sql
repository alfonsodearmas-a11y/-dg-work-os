-- 03_ban_system_account.sql — Part 1 / P4.
-- ⚠️ DO NOT RUN until the cutover sitting (step C1). Run AFTER 01_*.sql.
--
-- The 'system' account (system@mpua.gov.gy) must exist in auth.users to satisfy
-- the FK, but must NEVER authenticate. Ban it far into the future. (Belt +
-- suspenders: the reimplemented auth() also returns null for role='system'.)
--
-- ⚠️ REHEARSAL-VERIFIED (2026-06-05, branch): use a FINITE far-future date, NOT
-- 'infinity'. GoTrue (Go) cannot deserialize a Postgres 'infinity' timestamptz and
-- returns HTTP 500 "unexpected_failure" whenever it loads that user; a finite date
-- yields a clean rejection. (Proven: 'infinity' → 500; '2999-01-01' → 400.)
UPDATE auth.users a
SET banned_until = '2999-01-01 00:00:00+00'
FROM public.users u
WHERE a.id = u.id AND u.role = 'system';
