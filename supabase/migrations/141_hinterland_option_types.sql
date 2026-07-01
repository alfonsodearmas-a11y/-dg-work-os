-- 141_hinterland_option_types.sql
--
-- Data-driven vocabularies for the Hinterland Communities module, mirroring the
-- airstrip_option_types pattern (category / label / value / sort_order / is_active).
-- Status display colours live in lib/hinterland-types.ts (as airstrip STATUS_CONFIG
-- does); this table drives the editable dropdown values only.

CREATE TABLE public.hinterland_option_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category    text NOT NULL,
  label       text NOT NULL,
  value       text NOT NULL,
  sort_order  integer,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hinterland_option_types_unique UNIQUE (category, value)
);

INSERT INTO public.hinterland_option_types (category, label, value, sort_order) VALUES
  ('water_status', 'Adequate',         'adequate',   1),
  ('water_status', 'Partial / issues', 'partial',    2),
  ('water_status', 'No system',        'no_system',  3),
  ('water_status', 'Unfunded',         'unfunded',   4),
  ('water_status', 'Unknown',          'unknown',    5),

  ('water_source_type', 'Drilled well 4"',  'drilled_well_4', 1),
  ('water_source_type', 'Drilled well 6"',  'drilled_well_6', 2),
  ('water_source_type', 'Drilled well 8"',  'drilled_well_8', 3),
  ('water_source_type', 'Hand-dug well',    'hand_dug_well',  4),
  ('water_source_type', 'Gravity spring',   'gravity_spring', 5),
  ('water_source_type', 'Creek source',     'creek_source',   6),

  ('water_source_status', 'Active',             'active',             1),
  ('water_source_status', 'Inactive',           'inactive',           2),
  ('water_source_status', 'Pending activation', 'pending_activation', 3),

  ('electricity_status', 'Adequate', 'adequate', 1),
  ('electricity_status', 'Partial',  'partial',  2),
  ('electricity_status', 'None',     'none',     3),
  ('electricity_status', 'Unknown',  'unknown',  4),

  ('electricity_system_type', 'Grid',      'grid',      1),
  ('electricity_system_type', 'Solar',     'solar',     2),
  ('electricity_system_type', 'Hybrid',    'hybrid',    3),
  ('electricity_system_type', 'Generator', 'generator', 4),
  ('electricity_system_type', 'None',      'none',      5),

  ('electricity_source_type', 'Solar PV',    'solar_pv',    1),
  ('electricity_source_type', 'Generator',   'generator',   2),
  ('electricity_source_type', 'Grid feeder', 'grid_feeder', 3),
  ('electricity_source_type', 'Hydro',       'hydro',       4),
  ('electricity_source_type', 'Other',       'other',       5)
ON CONFLICT (category, value) DO NOTHING;

ALTER TABLE public.hinterland_option_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY hinterland_option_types_read ON public.hinterland_option_types
  AS PERMISSIVE FOR SELECT TO authenticated USING (true);
