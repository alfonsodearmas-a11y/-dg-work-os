-- ============================================================
-- Tender soft archive
--
-- Replaces the previous hard-DELETE archive with a soft-archive flag set
-- so audit trail, field-change history, and the decision log are preserved.
-- Archived tenders are excluded from listTenders, getPipelineStats, the
-- match candidates pool in psip/ingest, and from the missing-tender queue.
-- They surface only in the dedicated /procurement/archived view, where DG
-- can unarchive.
--
-- archive_reason_code is free TEXT — vocabulary is owned by the application
-- layer (see ARCHIVE_REASON_CODES in lib/tender/types.ts) for the same
-- reasons documented in 095_procurement_decision_log.sql.
--
-- The CHECK constraint enforces that the archive fields move atomically:
-- a row is either fully un-archived (all NULL) or fully archived (timestamp,
-- actor, role, reason_code all NOT NULL). archive_reason_text remains
-- optional even when archived (free-form annotation).
-- ============================================================

ALTER TABLE tender
  ADD COLUMN IF NOT EXISTS archived_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by         UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS archived_role       TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS archive_reason_text TEXT;

ALTER TABLE tender
  DROP CONSTRAINT IF EXISTS tender_archive_consistency;

ALTER TABLE tender
  ADD CONSTRAINT tender_archive_consistency CHECK (
    (
      archived_at IS NULL
      AND archived_by IS NULL
      AND archived_role IS NULL
      AND archive_reason_code IS NULL
    )
    OR
    (
      archived_at IS NOT NULL
      AND archived_by IS NOT NULL
      AND archived_role IS NOT NULL
      AND archive_reason_code IS NOT NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_tender_archived
  ON tender (agency, archived_at DESC)
  WHERE archived_at IS NOT NULL;
