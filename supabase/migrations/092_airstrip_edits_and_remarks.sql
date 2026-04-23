-- ============================================================
-- Migration 092: Airstrip module — edits, remarks, surface type fix
-- ============================================================
-- 1. Normalize existing airstrips.surface_type to the lookup codes
--    seeded in migration 070. Leaves unknown values untouched
--    (per product decision: legacy outliers stay as-is).
-- 2. Add "remarks" column to airstrip_inspections.
-- 3. Expand airstrip_photos.photo_type CHECK to accept 'maintenance'.
-- ============================================================

-- 1. Normalize surface_type on existing airstrips -----------------
UPDATE airstrips SET surface_type = 'bituminous'
  WHERE surface_type = 'Bituminous Surface Treatment';

UPDATE airstrips SET surface_type = 'concrete'
  WHERE surface_type = 'Concrete';

UPDATE airstrips SET surface_type = 'laterite'
  WHERE surface_type = 'Laterite';

UPDATE airstrips SET surface_type = 'sand_clay'
  WHERE surface_type IN ('Sand Clay', 'Sand-Clay', 'Sand/Clay');

UPDATE airstrips SET surface_type = 'grass'
  WHERE surface_type = 'Grass';

UPDATE airstrips SET surface_type = 'other'
  WHERE surface_type = 'Other';

-- 2. Remarks on inspections ---------------------------------------
ALTER TABLE airstrip_inspections
  ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 3. Allow 'maintenance' photo_type -------------------------------
ALTER TABLE airstrip_photos
  DROP CONSTRAINT IF EXISTS airstrip_photos_photo_type_check;

ALTER TABLE airstrip_photos
  ADD CONSTRAINT airstrip_photos_photo_type_check
  CHECK (photo_type IN (
    'verification', 'inspection', 'aerial', 'damage', 'general', 'maintenance'
  ));
