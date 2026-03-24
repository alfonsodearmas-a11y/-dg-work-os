-- ============================================================
-- 071: Register missing agency modules
-- Adds Hinterland Airstrips, HECI, and MARAD to the modules
-- table so they appear in the permissions panel and sidebar.
-- ============================================================

INSERT INTO modules (slug, name, description, icon, default_roles, sort_order) VALUES
  ('airstrips',       'Hinterland Airstrips',  'Hinterland airstrip management and monitoring',  'PlaneLanding',
   ARRAY['dg','minister','ps','parl_sec','agency_admin','officer'], 14),
  ('heci-deep-dive',  'HECI Electrification',  'Hinterland electrification operational data',    'Lightbulb',
   ARRAY['dg','minister','ps','parl_sec','agency_admin','officer'], 15),
  ('marad-deep-dive', 'MARAD Maritime',        'Maritime administration monitoring',              'Anchor',
   ARRAY['dg','minister','ps','parl_sec','agency_admin','officer'], 16)
ON CONFLICT (slug) DO NOTHING;
