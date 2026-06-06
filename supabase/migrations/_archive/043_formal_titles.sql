-- ============================================================
-- Add formal_title to users, update role hierarchy
-- Minister > PS > DG > Agency Manager > Analyst
-- ============================================================

-- 1. Add formal_title column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS formal_title text;

-- 2. Set defaults based on existing role
UPDATE users SET formal_title = 'Director General'    WHERE role = 'dg'           AND formal_title IS NULL;
UPDATE users SET formal_title = 'Minister'            WHERE role = 'minister'     AND formal_title IS NULL;
UPDATE users SET formal_title = 'Permanent Secretary' WHERE role = 'ps'           AND formal_title IS NULL;
UPDATE users SET formal_title = 'Agency Manager'      WHERE role = 'agency_admin' AND formal_title IS NULL;
UPDATE users SET formal_title = 'Analyst'             WHERE role = 'officer'      AND formal_title IS NULL;

-- 3. Update hierarchy levels in roles table: Minister(7) > PS(6) > DG(5) > agency_admin(3) > officer(2)
UPDATE roles SET hierarchy_level = 7 WHERE name = 'minister';
UPDATE roles SET hierarchy_level = 6 WHERE name = 'ps';
UPDATE roles SET hierarchy_level = 5 WHERE name = 'dg';

-- 4. Update display names in roles table to match new labels
UPDATE roles SET display_name = 'Agency Manager' WHERE name = 'agency_admin';
UPDATE roles SET display_name = 'Analyst'        WHERE name = 'officer';
