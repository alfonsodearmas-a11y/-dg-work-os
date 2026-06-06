-- ============================================================
-- Tender Phantom Cleanup (Procurement Audit Rebuild — Phase A)
--
-- Removes 60 phantom rows that the pre-rebuild ingest accepted but the
-- updated spec rejects:
--   - 47 method-excluded rows (sole_source, quotation, restrictive, comm_participation)
--   - 10 method=null rows (6 MARAD summary-rollup + 1 GWI "New" divider +
--     1 GPL "Land Acquisition" + 2 HINTERLAND_AIRSTRIPS blank-method awards)
--   - 3 silent-default-Design rows (GWI Bartica PVC: 3 Mile Access / Black's Road / Fowl Cock)
--
-- Also fixes 32 parent-as-tender rows that have programme_activity
-- incorrectly set to the row's own description — should be NULL.
--
-- Snapshots `tender` before the deletes, so nothing is lost:
--   tender_cleanup_backup_20260417
--
-- See docs/procurement-audit-and-rebuild-plan.md §10.1 for the audit
-- that produced these counts.
--
-- Safety: every DELETE is scoped to source='psip' — Trello-sourced
-- records (HECI tenders from the Trello sync) are never touched.
-- ============================================================

-- Snapshot: idempotent via DROP/CREATE so re-running is safe in dev.
-- In production this runs exactly once; the snapshot is permanent.
DROP TABLE IF EXISTS tender_cleanup_backup_20260417;
CREATE TABLE tender_cleanup_backup_20260417 AS
  SELECT * FROM tender;

-- ── Phantom 1: summary-rollup rows (6 MARAD rows at R246–R251) ─────────────
DELETE FROM tender
 WHERE source = 'psip'
   AND agency = 'MARAD'
   AND description IN ('Award', 'Awaiting Award', 'Evaluation', 'Advertised', 'Design', 'Rollover')
   AND method IS NULL;

-- ── Phantom 2: divider row "New" consumed as data (GWI R105) ───────────────
DELETE FROM tender
 WHERE source = 'psip'
   AND description = 'New'
   AND method IS NULL;

-- ── Phantom 3: method-excluded rows (47 total) ─────────────────────────────
-- These should never enter the DB under the updated spec's method filter.
DELETE FROM tender
 WHERE source = 'psip'
   AND method IN ('sole_source', 'quotation', 'restrictive', 'comm_participation');

-- ── Phantom 4: blank-method PSIP rows (remaining after above) ──────────────
-- Trello rows have method=null legitimately; exclude them.
DELETE FROM tender
 WHERE source = 'psip'
   AND method IS NULL;

-- ── Phantom 5: silent-default-Design rows (3 Bartica + 1 GPL Land Acquisition) ──
-- Characteristics: Open Tender, status blank, all dates blank,
-- stage_source='inferred_from_dates', no rollover/exception flag.
-- Per the updated spec these should now route to the review queue
-- (review_reason='ambiguous_stage') instead of being silently ingested.
-- Delete here; the next upload will re-surface them as review rows.
DELETE FROM tender
 WHERE source = 'psip'
   AND stage = 'design'
   AND stage_source = 'inferred_from_dates'
   AND date_advertised IS NULL
   AND date_closed IS NULL
   AND date_eval_sent_mtb_rtb IS NULL
   AND date_eval_sent_nptab IS NULL
   AND date_of_award IS NULL
   AND is_rollover = false
   AND has_exception = false;

-- ── Fix-up: parent-as-tender programme_activity redundancy ─────────────────
-- When a parent line-item row has no children, the row IS the tender. In
-- that case the programme_activity column should be NULL — not a redundant
-- copy of the row's own description. The ingest bug stored them equal.
UPDATE tender
   SET programme_activity = NULL
 WHERE source = 'psip'
   AND programme_activity = description;
