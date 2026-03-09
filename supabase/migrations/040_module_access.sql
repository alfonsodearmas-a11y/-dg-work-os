-- ============================================================
-- Module Access Control System
-- Allows DG to grant/revoke access to dashboard modules per user
-- ============================================================

-- 1. Module registry
CREATE TABLE IF NOT EXISTS modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  icon        TEXT,
  default_roles TEXT[] NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_slug ON modules(slug);
CREATE INDEX IF NOT EXISTS idx_modules_active ON modules(is_active) WHERE is_active = true;

-- 2. User ↔ Module junction (explicit grants)
CREATE TABLE IF NOT EXISTS user_module_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id   UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  granted_by  UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_user_module_access_user ON user_module_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_module_access_module ON user_module_access(module_id);

-- 3. RLS policies
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_access ENABLE ROW LEVEL SECURITY;

-- Modules: everyone can read active modules
CREATE POLICY modules_select ON modules
  FOR SELECT TO authenticated
  USING (true);

-- user_module_access: DG can do everything
CREATE POLICY uma_dg_all ON user_module_access
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = (auth.jwt()->>'userId')::uuid AND role = 'dg'
    )
  );

-- user_module_access: users can read their own rows
CREATE POLICY uma_self_select ON user_module_access
  FOR SELECT TO authenticated
  USING (user_id = (auth.jwt()->>'userId')::uuid);

-- 4. Seed every existing module
-- NOTE: Since API routes use supabaseAdmin (service role key, bypasses RLS),
-- these policies are mainly for direct Supabase client access.
INSERT INTO modules (slug, name, description, icon, default_roles, sort_order) VALUES
  ('briefing',       'Mission Control',       'Daily briefing with tasks and calendar',     'LayoutDashboard', ARRAY['dg','minister','ps','agency_admin','officer'], 1),
  ('agency-intel',   'Agency Intel',          'Agency operational monitoring overview',      'Activity',        ARRAY['dg','minister','ps','agency_admin','officer'], 2),
  ('tasks',          'Tasks',                 'Task board with Kanban view',                'CheckSquare',     ARRAY['dg','minister','ps','agency_admin','officer'], 3),
  ('oversight',      'Oversight',             'Oversight dashboard',                        'Eye',             ARRAY['dg','minister','ps','agency_admin','officer'], 4),
  ('budget',         'Budget 2026',           'Budget tracking and analysis',               'DollarSign',      ARRAY['dg','minister','ps','agency_admin','officer'], 5),
  ('meetings',       'Meetings',              'Meeting management',                         'Mic',             ARRAY['dg','minister','ps','agency_admin','officer'], 6),
  ('calendar',       'Calendar',              'Calendar view and scheduling',               'CalendarDays',    ARRAY['dg','minister','ps','agency_admin','officer'], 7),
  ('documents',      'Documents',             'Document vault with AI-powered search',      'FileText',        ARRAY['dg','minister','ps','agency_admin','officer'], 8),
  ('gpl-deep-dive',  'GPL Deep Dive',         'GPL operational data and analytics',         'Zap',             ARRAY['dg','minister','ps','agency_admin','officer'], 10),
  ('cjia-deep-dive', 'CJIA Analytics',        'CJIA passenger analytics',                  'Plane',           ARRAY['dg','minister','ps','agency_admin','officer'], 11),
  ('gwi-deep-dive',  'GWI Metrics',           'GWI water metrics and monitoring',           'Droplets',        ARRAY['dg','minister','ps','agency_admin','officer'], 12),
  ('gcaa-deep-dive', 'GCAA Compliance',       'GCAA aviation compliance monitoring',        'Shield',          ARRAY['dg','minister','ps','agency_admin','officer'], 13),
  ('people',         'People',                'User management and team administration',    'Users',           ARRAY['dg','minister','ps'], 20),
  ('settings',       'Settings',              'System settings and configuration',          'Settings',        ARRAY['dg','minister','ps'], 21),
  ('applications',   'Pending Applications',  'Customer service application tracking',      'ClipboardList',   ARRAY[]::TEXT[], 30)
ON CONFLICT (slug) DO NOTHING;
