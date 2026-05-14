-- Canonicalize agency values to uppercase across users and tasks. Earlier
-- drafts mixed lowercase ('gpl', 'gwi', ...) and uppercase ('GPL', 'GWI', ...);
-- the spec §0 #5 fixes the canonical values as 7 uppercase three- to five-
-- letter codes. Applied directly to production via Supabase tools on
-- 2026-05-05; this file is committed for git history alignment.
--
-- Distribution after migration: 19 GPL, 17 MARAD, 14 Ministry, 9 GWI,
-- 9 CJIA, 8 HECI, 8 GCAA, 5 HAS, 27 NULL. No case-folded duplicates.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_agency_check;
UPDATE users SET agency = upper(agency) WHERE agency IS NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (agency IS NULL OR agency = ANY(ARRAY['GPL','GWI','CJIA','GCAA','MARAD','HECI','HAS']));

UPDATE tasks SET agency = upper(agency)
WHERE agency IN ('gpl','gwi','cjia','gcaa','marad','heci','has');

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_agency_check;
ALTER TABLE tasks ADD CONSTRAINT tasks_agency_check
  CHECK (agency IS NULL OR agency = ANY(ARRAY['GPL','GWI','CJIA','GCAA','MARAD','HECI','HAS','Ministry']));
