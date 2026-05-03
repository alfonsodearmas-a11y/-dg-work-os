-- ============================================================
-- R5 verification: collapse pre-R5 duplicate review rows with full audit
--
-- Diagnostic state pre-collapse: 13 pending tender_match_review rows for
-- 3 distinct GWI/Bartica fingerprints (5+4+4), spread across 5 weekly
-- uploads. R5's dedup logic prevents future duplicates but does not touch
-- existing ones. This migration collapses them while writing one
-- procurement_decision row per delete so the cleanup is discoverable.
--
-- Pattern: any future system-driven mutation of review-queue state
-- (deletions, re-classifications, batch corrections) goes through the
-- same path:
--   1. Schema-level: 'system_collapse' is a structurally declared
--      decision_type in procurement_decision.
--   2. Actor: a stable system user row in `users` (role='system') owns
--      these decisions; actor_id and actor_role on the audit row tell
--      readers it was not a human action.
--   3. Audit: one procurement_decision row per affected target_id, with
--      reason_code identifying the cleanup batch and reason_text linking
--      to the canonical row that was preserved.
-- ============================================================

-- 1. Allow 'system_collapse' on procurement_decision.
ALTER TABLE procurement_decision
  DROP CONSTRAINT procurement_decision_decision_type_check;

ALTER TABLE procurement_decision
  ADD CONSTRAINT procurement_decision_decision_type_check
  CHECK (decision_type IN (
    'archive', 'unarchive',
    'resurrect', 'revoke_tracking',
    'skip', 'permanent_ignore',
    'match', 'create_from_review', 'assign_stage',
    'status_change',
    'system_collapse'
  ));

-- 2. Allow 'system' as a structural role on `users`. system users never
--    authenticate (no google_sub), but they own audit rows for
--    automated cleanups. agency must be NULL for system rows, matching
--    the existing pattern for ministry-level roles.
ALTER TABLE users
  DROP CONSTRAINT users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('dg', 'minister', 'ps', 'parl_sec', 'agency_admin', 'officer', 'system'));

ALTER TABLE users
  DROP CONSTRAINT users_agency_check;

ALTER TABLE users
  ADD CONSTRAINT users_agency_check
  CHECK (
    (role IN ('dg', 'minister', 'ps', 'parl_sec', 'system') AND agency IS NULL)
    OR
    (role IN ('agency_admin', 'officer') AND agency IS NOT NULL)
  );

-- 3. Stable system user row. Idempotent — does nothing on re-run.
INSERT INTO users (email, name, role, is_active)
VALUES (
  'system@mpua.gov.gy',
  'System (Procurement Reconciliation)',
  'system',
  true
)
ON CONFLICT (email) DO NOTHING;

-- 4. Merge seen_in_uploads from non-canonical duplicates into the
--    canonical (oldest pending) row per fingerprint.
WITH ranked AS (
  SELECT
    id,
    parsed_row_fingerprint AS fp,
    upload_id,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY parsed_row_fingerprint ORDER BY created_at ASC, id) AS rn,
    COUNT(*)    OVER (PARTITION BY parsed_row_fingerprint) AS dup_count
  FROM tender_match_review
  WHERE status = 'pending'
    AND parsed_row_fingerprint IS NOT NULL
),
extras_per_fp AS (
  SELECT fp, array_agg(upload_id) AS extras
  FROM ranked
  WHERE rn > 1 AND dup_count > 1
  GROUP BY fp
)
UPDATE tender_match_review tmr
SET seen_in_uploads = ARRAY(
  SELECT DISTINCT u
  FROM unnest(tmr.seen_in_uploads || e.extras) AS u
  WHERE u IS NOT NULL
)
FROM ranked r
JOIN extras_per_fp e ON e.fp = r.fp
WHERE tmr.id = r.id
  AND r.rn = 1
  AND r.dup_count > 1;

-- 5. Audit: one procurement_decision row per non-canonical review row
--    that is about to be deleted.
WITH ranked AS (
  SELECT
    id,
    parsed_row_fingerprint AS fp,
    incoming_row,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY parsed_row_fingerprint ORDER BY created_at ASC, id) AS rn,
    COUNT(*)    OVER (PARTITION BY parsed_row_fingerprint) AS dup_count
  FROM tender_match_review
  WHERE status = 'pending'
    AND parsed_row_fingerprint IS NOT NULL
),
canonicals AS (
  SELECT fp, id AS canonical_id FROM ranked WHERE rn = 1 AND dup_count > 1
),
non_canonicals AS (
  SELECT id, fp, incoming_row FROM ranked WHERE rn > 1 AND dup_count > 1
)
INSERT INTO procurement_decision (
  decision_type, target_kind, target_id, agency,
  actor_id, actor_role,
  reason_code, reason_text
)
SELECT
  'system_collapse',
  'review_row',
  nc.id,
  COALESCE(nc.incoming_row->>'agency', ''),
  (SELECT id FROM users WHERE email = 'system@mpua.gov.gy' LIMIT 1),
  'system',
  'fingerprint_dedup_post_r5',
  format(
    'Collapsed into canonical review_row %s for fingerprint %s',
    c.canonical_id, nc.fp
  )
FROM non_canonicals nc
JOIN canonicals c ON c.fp = nc.fp;

-- 6. Delete the non-canonical rows.
WITH ranked AS (
  SELECT
    id,
    parsed_row_fingerprint AS fp,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY parsed_row_fingerprint ORDER BY created_at ASC, id) AS rn,
    COUNT(*)    OVER (PARTITION BY parsed_row_fingerprint) AS dup_count
  FROM tender_match_review
  WHERE status = 'pending'
    AND parsed_row_fingerprint IS NOT NULL
)
DELETE FROM tender_match_review
WHERE id IN (
  SELECT id FROM ranked WHERE rn > 1 AND dup_count > 1
);
