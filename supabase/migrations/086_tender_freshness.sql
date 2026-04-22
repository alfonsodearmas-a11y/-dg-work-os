-- ============================================================
-- Tender Freshness — Today v1.1 Part 3
--
-- Weekly snapshot + stagnant_weeks counter. The PSIP workbook is edited by
-- agencies on Google Drive before the DG's weekly upload; .xlsx gives us no
-- per-cell edit history. To detect tenders that weren't touched across
-- successive uploads, we snapshot the diffable fields per upload and diff
-- consecutive snapshots. A tender's `stagnant_weeks` counter increments on
-- each upload where its snapshot is unchanged and resets to 0 on any change.
-- ============================================================

CREATE TABLE IF NOT EXISTS tender_upload_snapshot (
  upload_id         UUID NOT NULL REFERENCES upload(id) ON DELETE CASCADE,
  tender_id         UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  snapshot_fields   JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, tender_id)
);

CREATE INDEX IF NOT EXISTS idx_tender_upload_snapshot_tender_created
  ON tender_upload_snapshot (tender_id, created_at DESC);

ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS stagnant_weeks INTEGER NOT NULL DEFAULT 0;

-- Partial index: only rows that matter for Today signals.
CREATE INDEX IF NOT EXISTS idx_tender_stagnant
  ON tender (stagnant_weeks DESC, agency)
  WHERE stagnant_weeks >= 3 AND is_rollover = false AND has_exception = false AND missing_from_last_upload = false;

-- RLS: authenticated read, service_role full. Matches migration 078 pattern.
ALTER TABLE tender_upload_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read tender_upload_snapshot"
  ON tender_upload_snapshot FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full tender_upload_snapshot"
  ON tender_upload_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);
