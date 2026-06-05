-- ============================================================
-- 075: Audit Test Accounts
-- Creates 4 test accounts for agency user UX audit.
-- Password for all accounts: TestAudit2026!
--
-- CRITICAL: Does NOT modify the superadmin account.
-- Run in Supabase Dashboard > SQL Editor.
-- ============================================================

-- Pre-computed bcrypt hash for 'TestAudit2026!' (10 salt rounds)
-- Generated via: bcrypt.hashSync('TestAudit2026!', 10)

-- 1. GPL Agency Manager
INSERT INTO users (email, name, role, agency, formal_title, is_active, status, password_hash, created_at)
VALUES (
  'test.gpl.manager@mpua.gov.gy',
  'Test GPL Manager',
  'agency_admin',
  'gpl',
  'Agency Manager',
  true,
  'active',
  '$2a$10$EkDNktuMmaeZR5V.9631BurdXq2xuQlkCcKP2M06qfg6yBRUZmJM2',
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  status = 'active';

-- 2. GWI Agency Manager
INSERT INTO users (email, name, role, agency, formal_title, is_active, status, password_hash, created_at)
VALUES (
  'test.gwi.manager@mpua.gov.gy',
  'Test GWI Manager',
  'agency_admin',
  'gwi',
  'Agency Manager',
  true,
  'active',
  '$2a$10$EkDNktuMmaeZR5V.9631BurdXq2xuQlkCcKP2M06qfg6yBRUZmJM2',
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  status = 'active';

-- 3. HECI Analyst (Officer)
INSERT INTO users (email, name, role, agency, formal_title, is_active, status, password_hash, created_at)
VALUES (
  'test.heci.analyst@mpua.gov.gy',
  'Test HECI Analyst',
  'officer',
  'heci',
  'Analyst',
  true,
  'active',
  '$2a$10$EkDNktuMmaeZR5V.9631BurdXq2xuQlkCcKP2M06qfg6yBRUZmJM2',
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  status = 'active';

-- 4. MARAD Agency Manager
INSERT INTO users (email, name, role, agency, formal_title, is_active, status, password_hash, created_at)
VALUES (
  'test.marad.manager@mpua.gov.gy',
  'Test MARAD Manager',
  'agency_admin',
  'marad',
  'Agency Manager',
  true,
  'active',
  '$2a$10$EkDNktuMmaeZR5V.9631BurdXq2xuQlkCcKP2M06qfg6yBRUZmJM2',
  now()
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  is_active = true,
  status = 'active';


-- ============================================================
-- CLEANUP (uncomment and run after audit is complete)
-- ============================================================
-- DELETE FROM user_module_access WHERE user_id IN (
--   SELECT id FROM users WHERE email IN (
--     'test.gpl.manager@mpua.gov.gy',
--     'test.gwi.manager@mpua.gov.gy',
--     'test.heci.analyst@mpua.gov.gy',
--     'test.marad.manager@mpua.gov.gy'
--   )
-- );
-- DELETE FROM users WHERE email IN (
--   'test.gpl.manager@mpua.gov.gy',
--   'test.gwi.manager@mpua.gov.gy',
--   'test.heci.analyst@mpua.gov.gy',
--   'test.marad.manager@mpua.gov.gy'
-- );
