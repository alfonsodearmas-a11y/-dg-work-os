-- NPTAB Procurement Performance Reports.
-- Quarterly aggregated reports to the National Procurement and Tender
-- Administration Board, replacing the Coming soon stub on the Escalate modal.
-- Individual tenders are queued via that modal; the DG generates a draft
-- report from the queue, edits the narrative, and submits with a PDF.

-- ── Enums ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE nptab_report_status AS ENUM ('drafted', 'submitted', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE nptab_delivery_method AS ENUM ('email', 'hand_delivered', 'in_meeting', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sequence ──────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS nptab_report_ref_seq START 1;

-- ── nptab_reports ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_reports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_number TEXT UNIQUE,
  period_start     DATE NOT NULL,
  period_end       DATE NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status           nptab_report_status NOT NULL DEFAULT 'drafted',
  submitted_at     TIMESTAMPTZ,
  delivery_method  nptab_delivery_method,
  delivered_to     TEXT,
  narrative        TEXT NOT NULL DEFAULT '',
  tender_count     INTEGER NOT NULL DEFAULT 0,
  total_value      NUMERIC,
  closed_at        TIMESTAMPTZ,
  closure_reason   TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_em_dash_narrative      CHECK (position(chr(8212) IN narrative) = 0),
  CONSTRAINT no_em_dash_closure_reason CHECK (closure_reason IS NULL OR position(chr(8212) IN closure_reason) = 0),
  CONSTRAINT period_valid              CHECK (period_end >= period_start)
);

CREATE INDEX IF NOT EXISTS nptab_reports_status_idx       ON nptab_reports(status);
CREATE INDEX IF NOT EXISTS nptab_reports_submitted_at_idx ON nptab_reports(submitted_at DESC);
CREATE INDEX IF NOT EXISTS nptab_reports_period_idx       ON nptab_reports(period_end DESC);

-- ── nptab_report_queue ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_report_queue (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id               TEXT NOT NULL,
  queued_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_by               UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason                  TEXT,
  dequeued_at             TIMESTAMPTZ,
  dequeued_by             UUID REFERENCES users(id) ON DELETE RESTRICT,
  dequeue_reason          TEXT,
  included_in_report_id   UUID REFERENCES nptab_reports(id) ON DELETE SET NULL,
  CONSTRAINT no_em_dash_reason         CHECK (reason IS NULL OR position(chr(8212) IN reason) = 0),
  CONSTRAINT no_em_dash_dequeue_reason CHECK (dequeue_reason IS NULL OR position(chr(8212) IN dequeue_reason) = 0)
);

-- A tender can only sit in the active queue once at a time.
CREATE UNIQUE INDEX IF NOT EXISTS nptab_queue_active_unique
  ON nptab_report_queue(tender_id)
  WHERE dequeued_at IS NULL AND included_in_report_id IS NULL;

CREATE INDEX IF NOT EXISTS nptab_queue_tender_idx ON nptab_report_queue(tender_id);
CREATE INDEX IF NOT EXISTS nptab_queue_report_idx ON nptab_report_queue(included_in_report_id);

-- ── nptab_report_audit_log ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nptab_report_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     UUID NOT NULL REFERENCES nptab_reports(id) ON DELETE CASCADE,
  changed_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  field_changed TEXT NOT NULL,
  old_value     TEXT,
  new_value     TEXT,
  timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nptab_audit_report_idx ON nptab_report_audit_log(report_id, timestamp DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE nptab_reports          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nptab_report_queue     ENABLE ROW LEVEL SECURITY;
ALTER TABLE nptab_report_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nptab_reports_service_role         ON nptab_reports;
DROP POLICY IF EXISTS nptab_reports_authenticated_select ON nptab_reports;
DROP POLICY IF EXISTS nptab_queue_service_role           ON nptab_report_queue;
DROP POLICY IF EXISTS nptab_queue_authenticated_select   ON nptab_report_queue;
DROP POLICY IF EXISTS nptab_audit_service_role           ON nptab_report_audit_log;
DROP POLICY IF EXISTS nptab_audit_authenticated_select   ON nptab_report_audit_log;

CREATE POLICY nptab_reports_service_role
  ON nptab_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_reports_authenticated_select
  ON nptab_reports FOR SELECT TO authenticated USING (true);

CREATE POLICY nptab_queue_service_role
  ON nptab_report_queue FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_queue_authenticated_select
  ON nptab_report_queue FOR SELECT TO authenticated USING (true);

CREATE POLICY nptab_audit_service_role
  ON nptab_report_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY nptab_audit_authenticated_select
  ON nptab_report_audit_log FOR SELECT TO authenticated USING (true);

-- ── updated_at trigger (reuse project-wide helper from migration 072) ─────
DROP TRIGGER IF EXISTS set_nptab_reports_updated_at ON nptab_reports;
CREATE TRIGGER set_nptab_reports_updated_at
  BEFORE UPDATE ON nptab_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── Modules table: register nptab-reports, bump minister-referrals ────────
INSERT INTO modules (slug, name, description, icon, default_roles, is_active, sort_order)
VALUES (
  'nptab-reports',
  'NPTAB Reports',
  'Procurement performance reports to NPTAB',
  'FileBarChart',
  ARRAY['dg', 'ps'],
  true,
  76
)
ON CONFLICT (slug) DO UPDATE
  SET name          = EXCLUDED.name,
      description   = EXCLUDED.description,
      icon          = EXCLUDED.icon,
      default_roles = EXCLUDED.default_roles,
      is_active     = EXCLUDED.is_active,
      sort_order    = EXCLUDED.sort_order;

UPDATE modules SET sort_order = 77 WHERE slug = 'minister-referrals';

-- ── Documentation ─────────────────────────────────────────────────────────
COMMENT ON TABLE nptab_reports IS
  'Quarterly Procurement Performance Reports to the National Procurement and Tender '
  'Administration Board. Reference number MPUA-NPTAB-YYYY-NNNN is allocated at Mark '
  'Submitted (drafts never burn a sequence value). Sequence may have gaps if a '
  'submission rolls back due to PDF render failure.';

COMMENT ON COLUMN nptab_reports.reference_number IS
  'Allocated from nptab_report_ref_seq at submission time. NULL while drafted.';

COMMENT ON COLUMN nptab_report_queue.included_in_report_id IS
  'NULL while the tender is in the active queue. Set when a draft report is generated '
  'from the queue or when a tender is added directly to a drafted report. Once set, the '
  'queue row no longer participates in the active-queue uniqueness check.';
