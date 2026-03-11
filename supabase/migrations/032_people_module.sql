-- ============================================================
-- People Module: HubSpot-style permissions, access control,
-- activity logging, delegation, and invitation tokens.
-- ============================================================
-- Adapted for DG Work OS:
--   - References users(id) (custom table), NOT auth.users(id)
--   - Role names match existing: dg, minister, ps, agency_admin, officer
--   - RLS skipped (API routes use supabaseAdmin / service role key)
-- ============================================================

-- 1. Roles with hierarchy levels
CREATE TABLE IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text,
  hierarchy_level integer NOT NULL,
  is_custom boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO roles (name, display_name, description, hierarchy_level, is_custom) VALUES
  ('dg',           'Director General',    'Highest access. Can do anything, see everything, manage all users.', 5, false),
  ('minister',     'Minister',            'Highest access. Full system visibility and control.', 5, false),
  ('ps',           'Permanent Secretary', 'System-wide access. Can view all data, manage dashboards, assign roles.', 4, false),
  ('agency_admin', 'Agency Manager',      'Manages specific agency. Full visibility and control within assigned agency.', 3, false),
  ('officer',      'Officer',             'Creates content (dashboards, reports, tasks). Access scoped to assigned objects.', 2, false)
ON CONFLICT (name) DO NOTHING;

-- 2. Core permissions
CREATE TABLE IF NOT EXISTS core_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  description text NOT NULL,
  is_admin_only boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

INSERT INTO core_permissions (name, resource, action, description, is_admin_only) VALUES
  ('dashboard.create', 'dashboard', 'create', 'Create new dashboards', false),
  ('dashboard.read',   'dashboard', 'read',   'View dashboards', false),
  ('dashboard.edit',   'dashboard', 'update', 'Edit dashboard content and layout', false),
  ('dashboard.delete', 'dashboard', 'delete', 'Delete dashboards', true),
  ('dashboard.share',  'dashboard', 'share',  'Share dashboards with users/teams', false),
  ('dashboard.export', 'dashboard', 'export', 'Export dashboard data', false),
  ('report.create',    'reports',   'create', 'Create new reports', false),
  ('report.read',      'reports',   'read',   'View reports', false),
  ('report.edit',      'reports',   'update', 'Edit reports', false),
  ('report.delete',    'reports',   'delete', 'Delete reports', true),
  ('report.share',     'reports',   'share',  'Share reports with users/teams', false),
  ('report.export',    'reports',   'export', 'Export report data', false),
  ('user.read',        'users',     'read',   'View team members and their roles', false),
  ('user.create',      'users',     'create', 'Create new user accounts', true),
  ('user.edit',        'users',     'update', 'Edit user details (name, email, role)', true),
  ('user.delete',      'users',     'delete', 'Delete user accounts', true),
  ('user.invite',      'users',     'invite', 'Send invitations to new users', false),
  ('user.manage_roles','users',     'manage_roles', 'Assign and change user roles', true),
  ('settings.read',    'settings',  'read',   'View system settings', false),
  ('settings.edit',    'settings',  'update', 'Modify system settings', true),
  ('audit.read',       'audit_logs','read',   'View audit logs and activity history', true),
  ('audit.export',     'audit_logs','export', 'Export audit logs', true),
  ('agency.create',    'agency',    'create', 'Create new agencies', true),
  ('agency.read',      'agency',    'read',   'View agency data', false),
  ('agency.edit',      'agency',    'update', 'Edit agency information', false),
  ('agency.manage',    'agency',    'manage', 'Full management of agency', false),
  ('task.create',      'tasks',     'create', 'Create new tasks', false),
  ('task.read',        'tasks',     'read',   'View tasks', false),
  ('task.edit',        'tasks',     'update', 'Edit tasks', false),
  ('task.delete',      'tasks',     'delete', 'Delete tasks', false),
  ('task.share',       'tasks',     'share',  'Assign tasks to users', false)
ON CONFLICT (name) DO NOTHING;

-- 3. Role → permission mapping
CREATE TABLE IF NOT EXISTS role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES core_permissions(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- DG + Minister get EVERYTHING
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'dg'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'minister'
ON CONFLICT DO NOTHING;

-- PS gets all non-admin permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'ps' AND p.is_admin_only = false
ON CONFLICT DO NOTHING;

-- Agency Admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'agency_admin' AND p.name IN (
  'dashboard.create','dashboard.read','dashboard.edit','dashboard.share','dashboard.export',
  'report.create','report.read','report.edit','report.share','report.export',
  'user.read','user.invite',
  'agency.read','agency.manage',
  'task.create','task.read','task.edit','task.delete','task.share'
)
ON CONFLICT DO NOTHING;

-- Officer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, core_permissions p
WHERE r.name = 'officer' AND p.name IN (
  'dashboard.create','dashboard.read','dashboard.edit','dashboard.share','dashboard.export',
  'report.create','report.read','report.edit','report.share','report.export',
  'user.read',
  'agency.read',
  'task.create','task.read','task.edit','task.share'
)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);

-- 4. Object ownership
CREATE TABLE IF NOT EXISTS object_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type text NOT NULL,
  object_id text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(object_type, object_id)
);

CREATE INDEX IF NOT EXISTS idx_object_ownership_owner ON object_ownership(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_object_ownership_object ON object_ownership(object_type, object_id);

-- 5. Object access grants
CREATE TABLE IF NOT EXISTS object_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_type text NOT NULL,
  object_id text,
  access_level text NOT NULL CHECK (access_level IN ('view', 'edit', 'manage')),
  reason text,
  granted_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(user_id, object_type, object_id)
);

CREATE INDEX IF NOT EXISTS idx_object_access_user ON object_access_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_object_access_object ON object_access_grants(object_type, object_id);

-- 6. Activity logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action text NOT NULL,
  object_type text,
  object_id text,
  object_name text,
  changes jsonb,
  reason text,
  result text CHECK (result IN ('success', 'denied', 'error')),
  denial_reason text,
  ip_address inet,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_object ON activity_logs(object_type, object_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

-- 7. Permission delegation
CREATE TABLE IF NOT EXISTS delegated_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES core_permissions(id) ON DELETE CASCADE,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(from_user_id, to_user_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_delegated_permissions_from ON delegated_permissions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_delegated_permissions_to ON delegated_permissions(to_user_id);

-- 8. Invitation tokens
CREATE TABLE IF NOT EXISTS invitation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  token text UNIQUE NOT NULL,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_agencies text[],
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_email ON invitation_tokens(email);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_token ON invitation_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_expires ON invitation_tokens(expires_at);
