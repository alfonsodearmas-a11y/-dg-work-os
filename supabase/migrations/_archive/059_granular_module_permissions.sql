-- ============================================================
-- 059: Granular Module Permissions
-- Extends user_module_access with view/edit distinction and
-- optional per-agency scoping for module-level access control.
--
-- can_edit = false → view-only access
-- can_edit = true  → view + edit access
-- agency  = NULL   → applies across all agencies
-- agency  = 'gpl'  → applies only for GPL context
-- ============================================================

-- 1. Add can_edit column for view vs edit granularity
ALTER TABLE user_module_access
  ADD COLUMN IF NOT EXISTS can_edit BOOLEAN NOT NULL DEFAULT false;

-- 2. Add agency column for per-agency module scoping
ALTER TABLE user_module_access
  ADD COLUMN IF NOT EXISTS agency TEXT;

-- Validate agency values
DO $$
BEGIN
  ALTER TABLE user_module_access
    ADD CONSTRAINT uma_agency_values
    CHECK (agency IS NULL OR LOWER(agency) IN ('gpl', 'gwi', 'cjia', 'gcaa', 'marad', 'heci', 'has'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Replace unique constraint to include agency dimension
-- Drop old constraint (user_id, module_id)
ALTER TABLE user_module_access
  DROP CONSTRAINT IF EXISTS user_module_access_user_id_module_id_key;

-- New unique index: COALESCE handles NULL agency for uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS user_module_access_user_module_agency_idx
  ON user_module_access(user_id, module_id, COALESCE(agency, '__all__'));

-- 4. Index for agency-scoped lookups
CREATE INDEX IF NOT EXISTS idx_uma_agency
  ON user_module_access(agency) WHERE agency IS NOT NULL;

-- 5. Ensure procurement module is seeded (may not exist yet)
INSERT INTO modules (slug, name, description, icon, default_roles, sort_order) VALUES
  ('procurement', 'Procurement', 'Procurement tracking and management', 'ShoppingCart',
   ARRAY['dg','minister','ps','parl_sec','agency_admin','officer'], 9)
ON CONFLICT (slug) DO NOTHING;

-- 6. Ensure parl_sec is in default_roles for all standard modules
UPDATE modules
SET default_roles = array_append(default_roles, 'parl_sec')
WHERE NOT ('parl_sec' = ANY(default_roles))
AND slug != 'applications';
