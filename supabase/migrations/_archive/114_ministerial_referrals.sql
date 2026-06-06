-- Ministerial Referrals — formal referrals from the DG office to the Minister.
-- Pairs with referral_audit_log (115) and the modules seed (116).

-- ── Enums ────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE referral_source_type AS ENUM ('tender', 'project', 'agency_issue', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE referral_requested_action AS ENUM ('review', 'decision', 'intervention', 'information');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE referral_status AS ENUM ('drafted', 'submitted', 'with_minister', 'direction_given', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE referral_delivery_method AS ENUM ('email', 'hand_delivered', 'in_meeting', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sequence for reference numbers (global, monotonic, never reused) ─────
CREATE SEQUENCE IF NOT EXISTS referral_ref_seq START 1;

-- ── Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ministerial_referrals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  referred_by              UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_type              referral_source_type NOT NULL,
  source_id                TEXT,
  agency                   TEXT NOT NULL,
  title                    TEXT NOT NULL,
  days_overdue             INTEGER,
  contract_value           NUMERIC,
  background               TEXT NOT NULL DEFAULT '',
  current_status           TEXT NOT NULL DEFAULT '',
  recommendation           TEXT NOT NULL,
  requested_action         referral_requested_action NOT NULL,
  reference_number         TEXT UNIQUE,
  status                   referral_status NOT NULL DEFAULT 'drafted',
  submitted_at             TIMESTAMPTZ,
  delivery_method          referral_delivery_method,
  delivered_to             TEXT,
  delivered_at             TIMESTAMPTZ,
  minister_direction       TEXT,
  direction_logged_at      TIMESTAMPTZ,
  closed_at                TIMESTAMPTZ,
  closure_note             TEXT,
  minister_acknowledged_at TIMESTAMPTZ,
  minister_notes           TEXT,
  CONSTRAINT recommendation_min_length CHECK (
    status = 'drafted' OR char_length(btrim(recommendation)) >= 50
  ),
  CONSTRAINT no_em_dash_recommendation CHECK (position(chr(8212) IN recommendation) = 0),
  CONSTRAINT no_em_dash_background     CHECK (position(chr(8212) IN background)     = 0),
  CONSTRAINT no_em_dash_current_status CHECK (position(chr(8212) IN current_status) = 0),
  CONSTRAINT no_em_dash_closure_note   CHECK (closure_note IS NULL OR position(chr(8212) IN closure_note) = 0),
  CONSTRAINT no_em_dash_minister_direction CHECK (minister_direction IS NULL OR position(chr(8212) IN minister_direction) = 0),
  CONSTRAINT no_em_dash_minister_notes  CHECK (minister_notes IS NULL OR position(chr(8212) IN minister_notes) = 0),
  CONSTRAINT no_em_dash_title           CHECK (position(chr(8212) IN title) = 0)
);

-- ── Indexes ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS referrals_status_idx        ON ministerial_referrals(status);
CREATE INDEX IF NOT EXISTS referrals_agency_idx        ON ministerial_referrals(agency);
CREATE INDEX IF NOT EXISTS referrals_referred_by_idx   ON ministerial_referrals(referred_by);
CREATE INDEX IF NOT EXISTS referrals_submitted_at_idx  ON ministerial_referrals(submitted_at DESC);
CREATE INDEX IF NOT EXISTS referrals_source_idx        ON ministerial_referrals(source_type, source_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE ministerial_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referrals_service_role         ON ministerial_referrals;
DROP POLICY IF EXISTS referrals_authenticated_select ON ministerial_referrals;

CREATE POLICY referrals_service_role
  ON ministerial_referrals FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY referrals_authenticated_select
  ON ministerial_referrals FOR SELECT
  TO authenticated
  USING (true);

-- ── updated_at trigger (reuse the project-wide helper from migration 072) ─
DROP TRIGGER IF EXISTS set_referrals_updated_at ON ministerial_referrals;
CREATE TRIGGER set_referrals_updated_at
  BEFORE UPDATE ON ministerial_referrals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Documentation ────────────────────────────────────────────────────────
COMMENT ON TABLE ministerial_referrals IS
  'Formal referrals from the DG office to the Minister of Public Utilities and Aviation. '
  'All rows are addressed to the Minister by construction. If the system ever needs to '
  'refer items to PS, Cabinet, or another principal via the same machinery, add an '
  'addressed_to column (enum) and migrate existing rows to ''minister''.';

COMMENT ON COLUMN ministerial_referrals.reference_number IS
  'Format: MPUA-MR-YYYY-NNNN. YYYY is the Guyana local year (America/Guyana, UTC-4) at allocation. '
  'NNNN is the zero-padded value from referral_ref_seq. Sequential, never reused; sequence may have gaps.';

COMMENT ON COLUMN ministerial_referrals.minister_acknowledged_at IS
  'Set when the Minister clicks Acknowledge in /minister/referrals/[id]. May remain NULL forever.';
