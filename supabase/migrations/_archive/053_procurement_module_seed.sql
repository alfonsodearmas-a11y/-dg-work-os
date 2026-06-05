-- Register Procurement module for sidebar access control
INSERT INTO modules (slug, name, description, icon, default_roles, sort_order) VALUES
  ('procurement', 'Procurement', 'Procurement pipeline tracking and management', 'ShoppingCart', ARRAY['dg','minister','ps','agency_admin','officer'], 9)
ON CONFLICT (slug) DO NOTHING;
