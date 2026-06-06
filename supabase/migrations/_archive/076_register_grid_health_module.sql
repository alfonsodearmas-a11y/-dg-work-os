-- ============================================================
-- 076: Register grid-health module
-- Adds the GPL Grid Health module so ModuleGate can gate access.
-- ============================================================

INSERT INTO modules (name, slug, description, default_roles)
VALUES (
  'GPL Grid Health',
  'grid-health',
  'GPL feeder performance, outage patterns, and live grid status',
  ARRAY['dg','minister','ps','parl_sec','agency_admin','officer']
)
ON CONFLICT (slug) DO NOTHING;
