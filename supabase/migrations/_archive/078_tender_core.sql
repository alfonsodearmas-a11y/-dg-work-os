-- ============================================================
-- Tender Core (Procurement Reformulation — Phase 0)
--
-- New canonical tender model sourced from the weekly MPUA PSIP
-- Monitoring Form xlsx. Supersedes procurement_packages (dropped
-- in a later migration). Trello-sourced procurement folds in via
-- tender.source='trello' in migration 080.
--
-- Design doc: docs/procurement-reformulation-plan.md (§5, §9)
-- ============================================================

-- ----------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------

-- Agencies in scope for the reformulated module.
-- LETHEM is intentionally absent — folded into HECI's Trello board.
CREATE TYPE tender_agency AS ENUM (
  'MPUA',
  'GPL',
  'GWI',
  'CJIA',
  'GCAA',
  'MARAD',
  'HINTERLAND_AIRSTRIPS',
  'HECI'
);

-- 5-stage pipeline. Linear flow.
CREATE TYPE tender_stage AS ENUM (
  'design',
  'advertised',
  'evaluation',
  'awaiting_award',
  'award'
);

-- Procurement method.
-- 'public_tender' is normalized to 'open_tender' on ingest (Q3).
-- 'nil' rows are skipped entirely on ingest (Q2).
CREATE TYPE tender_method AS ENUM (
  'open_tender',
  'quotation',
  'sole_source',
  'restrictive',
  'comm_participation'
);

-- Origin of a tender row.
CREATE TYPE tender_source AS ENUM (
  'psip',
  'trello',
  'manual'
);

-- How the stage was determined for a tender.
CREATE TYPE tender_stage_source AS ENUM (
  'status_column',        -- PSIP col J had one of the 5 real stages
  'inferred_from_dates',  -- col J was Rollover / See Remarks / blank
  'manual_override'       -- user edited stage in-app after ingest
);

-- Status of a match-review queue item.
CREATE TYPE tender_match_status AS ENUM (
  'pending',
  'matched',
  'created',
  'skipped'
);

-- Lifecycle of an upload.
CREATE TYPE tender_upload_status AS ENUM (
  'preview',
  'applied',
  'cancelled'
);

-- ----------------------------------------------------------
-- 2. Reference data — programmes and sub-programmes
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS programme (
  code        TEXT PRIMARY KEY,      -- '341', '342', '343', '344', '345'
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_programme (
  code            TEXT PRIMARY KEY,  -- 7-digit, e.g. '2611300'
  name            TEXT NOT NULL,
  programme_code  TEXT NOT NULL REFERENCES programme(code),
  agency          tender_agency NOT NULL,
  is_excluded     BOOLEAN NOT NULL DEFAULT false, -- true for 2606600, 2606700
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_programme_programme_code
  ON sub_programme (programme_code);
CREATE INDEX IF NOT EXISTS idx_sub_programme_agency
  ON sub_programme (agency) WHERE is_excluded = false;

-- ----------------------------------------------------------
-- 3. Uploads — every weekly xlsx is a first-class entity
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS upload (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by   UUID NOT NULL REFERENCES users(id),
  status        tender_upload_status NOT NULL DEFAULT 'preview',
  stats         JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_upload_status_uploaded_at
  ON upload (status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_uploaded_by
  ON upload (uploaded_by);

-- ----------------------------------------------------------
-- 4. Tender — the main record
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS tender (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity & scope
  source                     tender_source NOT NULL DEFAULT 'psip',
  external_id                TEXT,                 -- Trello card id; NULL for psip/manual
  agency                     tender_agency NOT NULL,
  programme_code             TEXT REFERENCES programme(code),
  sub_programme_code         TEXT REFERENCES sub_programme(code),
  programme_activity         TEXT,                 -- from parent row, nullable
  line_item_code             TEXT,                 -- PSIP col A when present

  -- Description & pipeline state
  description                TEXT NOT NULL,
  stage                      tender_stage NOT NULL,
  stage_source               tender_stage_source NOT NULL DEFAULT 'status_column',
  method                     tender_method,
  is_rollover                BOOLEAN NOT NULL DEFAULT false,
  has_exception              BOOLEAN NOT NULL DEFAULT false,

  -- Procurement timeline dates (PSIP cols E–I)
  date_advertised            DATE,
  date_closed                DATE,
  date_eval_sent_mtb_rtb     DATE,
  date_eval_sent_nptab       DATE,
  date_of_award              DATE,

  -- Implementation metadata (PSIP col K, O, P, Q, R)
  contractor                 TEXT,
  implementation_start_date  DATE,
  implementation_end_date    DATE,
  implementation_status_pct  INTEGER,
  remarks                    TEXT,

  -- Ingest provenance
  last_raw_row               JSONB,
  first_seen_upload_id       UUID REFERENCES upload(id),
  last_seen_upload_id        UUID REFERENCES upload(id),
  missing_from_last_upload   BOOLEAN NOT NULL DEFAULT false,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trello (and any future external source) identity uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tender_source_external_id
  ON tender (source, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tender_agency         ON tender (agency);
CREATE INDEX IF NOT EXISTS idx_tender_stage          ON tender (stage);
CREATE INDEX IF NOT EXISTS idx_tender_prog_subprog   ON tender (programme_code, sub_programme_code);
CREATE INDEX IF NOT EXISTS idx_tender_source         ON tender (source);
CREATE INDEX IF NOT EXISTS idx_tender_missing
  ON tender (missing_from_last_upload)
  WHERE missing_from_last_upload = true;
CREATE INDEX IF NOT EXISTS idx_tender_updated_at     ON tender (updated_at DESC);

-- ----------------------------------------------------------
-- 5. Field-level change log (supersedes procurement_stage_history)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS tender_field_change (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id   UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  field_name  TEXT NOT NULL,   -- e.g. 'stage', 'method', 'contractor', '__presence'
  old_value   JSONB,
  new_value   JSONB,
  upload_id   UUID REFERENCES upload(id),
  changed_by  UUID REFERENCES users(id),  -- NULL when upload-driven
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_field_change_tender_time
  ON tender_field_change (tender_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_tender_field_change_upload
  ON tender_field_change (upload_id);
CREATE INDEX IF NOT EXISTS idx_tender_field_change_field_time
  ON tender_field_change (field_name, changed_at DESC);

-- ----------------------------------------------------------
-- 6. Match-review queue (human-resolved ambiguous ingests)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS tender_match_review (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id            UUID NOT NULL REFERENCES upload(id) ON DELETE CASCADE,
  incoming_row         JSONB NOT NULL,      -- parsed row + scope keys
  candidate_tender_ids UUID[] NOT NULL DEFAULT '{}',
  scores               JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {tender_id: score}
  status               tender_match_status NOT NULL DEFAULT 'pending',
  resolution_tender_id UUID REFERENCES tender(id),
  resolved_at          TIMESTAMPTZ,
  resolved_by          UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_match_review_upload
  ON tender_match_review (upload_id);
CREATE INDEX IF NOT EXISTS idx_tender_match_review_pending
  ON tender_match_review (upload_id, created_at)
  WHERE status = 'pending';

-- ----------------------------------------------------------
-- 7. Documents and notes (Q9 — ported forward from procurement_*)
-- ----------------------------------------------------------

CREATE TABLE IF NOT EXISTS tender_document (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id   UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  file_type   TEXT,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_document_tender
  ON tender_document (tender_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS tender_note (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id  UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tender_note_tender
  ON tender_note (tender_id, created_at DESC);

-- ----------------------------------------------------------
-- 8. RLS
--
-- Matches the pattern in migration 066: authenticated role can
-- read all rows; app-layer auth-helpers (requireRole,
-- canAccessAgency) enforce agency scoping in API handlers.
-- Service role has full access for ingest/sync jobs.
-- ----------------------------------------------------------

ALTER TABLE programme             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_programme         ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_field_change   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_match_review   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_document       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tender_note           ENABLE ROW LEVEL SECURITY;

-- Read policies (authenticated)
CREATE POLICY "auth read programme"           ON programme           FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read sub_programme"       ON sub_programme       FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read upload"              ON upload              FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tender"              ON tender              FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tender_field_change" ON tender_field_change FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tender_match_review" ON tender_match_review FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tender_document"     ON tender_document     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read tender_note"         ON tender_note         FOR SELECT TO authenticated USING (true);

-- Service role full access
CREATE POLICY "svc full programme"           ON programme           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full sub_programme"       ON sub_programme       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full upload"              ON upload              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full tender"              ON tender              FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full tender_field_change" ON tender_field_change FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full tender_match_review" ON tender_match_review FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full tender_document"     ON tender_document     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "svc full tender_note"         ON tender_note         FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ----------------------------------------------------------
-- 9. updated_at trigger for tender
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION tender_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tender_updated_at
  BEFORE UPDATE ON tender
  FOR EACH ROW EXECUTE FUNCTION tender_set_updated_at();

-- ----------------------------------------------------------
-- 10. Realtime (live kanban)
-- ----------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE tender;
