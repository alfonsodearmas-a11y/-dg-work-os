-- ============================================================
-- R5: Skip vocabulary, Match vocabulary, fingerprint dedup
--
-- Diagnostic finding: 13 review rows for 3 distinct GWI/Bartica fingerprints
-- across 5 uploads (2026-04-17 through 2026-05-03). The matcher had no
-- memory of prior pending/skipped reviews, so each upload manufactured fresh
-- review rows for the same parsed-row fingerprints.
--
-- This migration adds the substrate for the fix:
--   1. parsed_row_fingerprint + seen_in_uploads on tender_match_review.
--      The fingerprint format matches matcher.ts scopeKey + normalizeDescription:
--        agency|programme_code|sub_programme_code|norm(prog_activity)|norm(desc)
--   2. procurement_excluded_fingerprint: rows the user has named as not-a-tender.
--      Future uploads silently drop matching rows at the parse/match boundary.
--      Reason vocab (closed): header_or_subtotal | not_a_tender | agency_error.
--   3. procurement_match_decision: rows the user has named as the same procurement
--      as an existing tender. Future uploads carry the decision automatically.
--      Reason vocab (closed): supersedes (fold in diffs) | duplicates (drop).
--
-- The 'defer' Skip reason is intentionally NOT represented at the schema level.
-- Defer means "reappears next upload as expected" — it is a transient status
-- on the review row itself, not a persisted exclusion. Defer rows reset to
-- 'pending' on next sighting via the seen_in_uploads dedup path in code.
--
-- Backfill is non-destructive: existing review rows get their fingerprint
-- computed and seen_in_uploads initialized to [upload_id]. The collapse of
-- pre-R5 duplicate review rows (13 → 3 for Bartica) is a separate confirmable
-- step — see the data-cleanup script in scripts/, run by the operator.
-- ============================================================

ALTER TABLE tender_match_review
  ADD COLUMN IF NOT EXISTS parsed_row_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS seen_in_uploads UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tender_match_review_fingerprint_status
  ON tender_match_review (parsed_row_fingerprint, status)
  WHERE status IN ('pending', 'skipped');

-- Non-destructive backfill: populate fingerprint and seen_in_uploads for
-- pre-R5 rows. Mirrors normalizeDescription in lib/psip/parser.ts:550–552.
UPDATE tender_match_review
SET parsed_row_fingerprint =
  COALESCE(incoming_row->>'agency', '') || '|' ||
  COALESCE(incoming_row->>'programme_code', '') || '|' ||
  COALESCE(incoming_row->>'sub_programme_code', '') || '|' ||
  translate(
    regexp_replace(
      lower(trim(COALESCE(incoming_row->>'programme_activity', ''))),
      '\s+', ' ', 'g'
    ),
    '.,;:()[]', ''
  ) || '|' ||
  translate(
    regexp_replace(
      lower(trim(COALESCE(incoming_row->>'description', ''))),
      '\s+', ' ', 'g'
    ),
    '.,;:()[]', ''
  )
WHERE parsed_row_fingerprint IS NULL;

UPDATE tender_match_review
SET seen_in_uploads = ARRAY[upload_id]
WHERE seen_in_uploads = '{}'::uuid[]
  AND upload_id IS NOT NULL;

-- ── procurement_excluded_fingerprint ─────────────────────────────────────────
-- Permanent skip targets. The matcher consults this table BEFORE the
-- main matching loop and silently drops parsed rows whose fingerprint
-- is in here (and unexpired). expires_at is reserved for future TTL
-- semantics; today all rows are written with expires_at IS NULL.

CREATE TABLE IF NOT EXISTS procurement_excluded_fingerprint (
  fingerprint        TEXT PRIMARY KEY,
  reason_code        TEXT NOT NULL CHECK (reason_code IN (
    'header_or_subtotal', 'not_a_tender', 'agency_error'
  )),
  agency             TEXT NOT NULL,
  example_incoming   JSONB,                       -- the parsed row that triggered
  decided_by         UUID NOT NULL REFERENCES users(id),
  decided_role       TEXT NOT NULL,
  decided_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ                  -- NULL = permanent
);

CREATE INDEX IF NOT EXISTS idx_procurement_excluded_fingerprint_agency_time
  ON procurement_excluded_fingerprint (agency, decided_at DESC);

ALTER TABLE procurement_excluded_fingerprint ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read procurement_excluded_fingerprint"
  ON procurement_excluded_fingerprint FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full procurement_excluded_fingerprint"
  ON procurement_excluded_fingerprint FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── procurement_match_decision ──────────────────────────────────────────────
-- Persistent match resolutions. When a fingerprint appears on a future upload,
-- the matcher applies the latest decision automatically:
--   - 'supersedes': the parsed row is the same procurement as resolution_tender_id.
--     Diffs are folded in as field updates on that tender. (Same effect as the
--     pre-R5 'match' action.)
--   - 'duplicates': the parsed row is a redundant copy of resolution_tender_id.
--     The row is dropped from ingestion entirely (no field updates applied).

CREATE TABLE IF NOT EXISTS procurement_match_decision (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint              TEXT NOT NULL,
  resolution_tender_id     UUID NOT NULL REFERENCES tender(id) ON DELETE CASCADE,
  reason_code              TEXT NOT NULL CHECK (reason_code IN ('supersedes', 'duplicates')),
  agency                   TEXT NOT NULL,
  decided_by               UUID NOT NULL REFERENCES users(id),
  decided_role             TEXT NOT NULL,
  decided_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_procurement_match_decision_fingerprint_time
  ON procurement_match_decision (fingerprint, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_procurement_match_decision_agency_time
  ON procurement_match_decision (agency, decided_at DESC);

ALTER TABLE procurement_match_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read procurement_match_decision"
  ON procurement_match_decision FOR SELECT TO authenticated USING (true);
CREATE POLICY "svc full procurement_match_decision"
  ON procurement_match_decision FOR ALL TO service_role
  USING (true) WITH CHECK (true);
