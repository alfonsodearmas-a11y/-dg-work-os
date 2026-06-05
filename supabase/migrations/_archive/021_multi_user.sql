-- Drop old auth tables
DROP TABLE IF EXISTS users CASCADE;

-- New users table — identity from Google only
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_sub      TEXT UNIQUE NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  avatar_url      TEXT,
  role            TEXT NOT NULL DEFAULT 'officer'
                    CHECK (role IN ('dg', 'minister', 'ps', 'agency_admin', 'officer')),
  agency          TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES users(id)
);

ALTER TABLE users ADD CONSTRAINT users_agency_check
  CHECK (
    (role IN ('dg', 'minister', 'ps') AND agency IS NULL) OR
    (role IN ('agency_admin', 'officer') AND agency IS NOT NULL)
  );

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_agency ON users(agency);
