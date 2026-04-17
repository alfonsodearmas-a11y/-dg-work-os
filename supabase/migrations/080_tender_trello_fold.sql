-- ============================================================
-- Trello Fold into Unified Tender Table (Procurement Reformulation — Phase 2)
--
-- Copies procurement_items rows (Trello mirror) into the new
-- `tender` table with source='trello'. Renames procurement_boards
-- to trello_board. Drops procurement_items and
-- trello_item_stage_history (the Trello mirror tables). Drops the
-- old `procurement_stage` enum used only by Trello.
--
-- No Trello data is lost: Trello cards become tender rows, and the
-- trello webhook writer is updated (in app code) to target
-- `tender` instead of `procurement_items`.
-- ============================================================

-- 1. Copy Trello items into tender. The stage enums differ between
--    the old Trello model and the new pipeline; map them explicitly.
INSERT INTO tender (
  id, source, external_id, agency, description, stage, stage_source,
  method, is_rollover, has_exception,
  remarks, created_at, updated_at
)
SELECT
  pi.id,
  'trello'::tender_source,
  pi.trello_card_id,
  -- Trello boards are currently scoped to HECI (sub-programmes 2606600 +
  -- 2606700 fold together per Q7). Fall back to HECI if board.agency is
  -- anything else since Lethem is subsumed.
  CASE
    WHEN pb.agency IS NULL THEN 'HECI'
    WHEN upper(pb.agency) = 'HECI' THEN 'HECI'
    WHEN upper(pb.agency) = 'LETHEM' THEN 'HECI'
    ELSE 'HECI'
  END::tender_agency,
  pi.title,
  -- Stage mapping: old procurement_stage → new tender_stage.
  CASE pi.stage::text
    WHEN 'not_advertised'     THEN 'design'
    WHEN 'advertised'         THEN 'advertised'
    WHEN 'evaluation'         THEN 'evaluation'
    WHEN 'nptab_no_objection' THEN 'awaiting_award'
    WHEN 'contract_awarded'   THEN 'award'
    ELSE 'design'
  END::tender_stage,
  'manual_override'::tender_stage_source,  -- Trello is hand-curated
  NULL,  -- no procurement method on Trello cards
  false,
  false,
  pi.description,
  pi.created_at,
  pi.updated_at
FROM procurement_items pi
LEFT JOIN procurement_boards pb ON pb.id = pi.board_id
ON CONFLICT DO NOTHING;

-- 2. Rename procurement_boards → trello_board to match the new model.
ALTER TABLE procurement_boards RENAME TO trello_board;

-- 3. Drop the Trello mirror tables that are now superseded by `tender`.
--    trello_item_stage_history depends on procurement_items via FK, so
--    drop the history first, then the items table.
DROP TABLE IF EXISTS trello_item_stage_history CASCADE;
DROP TABLE IF EXISTS procurement_items CASCADE;

-- 4. Drop the old Trello-only stage enum.
DROP TYPE IF EXISTS procurement_stage;

-- 5. Stop publishing realtime changes for the old table (no-op if it's
--    already gone due to the DROP above).

-- 6. Ensure RLS/triggers on the renamed trello_board survive. The
--    policies from migration 066 reference the old name; recreate.
DROP POLICY IF EXISTS "Authenticated users can read procurement_boards" ON trello_board;
DROP POLICY IF EXISTS "Service role full access on procurement_boards"  ON trello_board;

CREATE POLICY "auth read trello_board"
  ON trello_board FOR SELECT TO authenticated USING (true);

CREATE POLICY "svc full trello_board"
  ON trello_board FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 7. Rename the updated_at trigger on the renamed table for clarity.
DROP TRIGGER IF EXISTS trg_procurement_boards_updated_at ON trello_board;
CREATE TRIGGER trg_trello_board_updated_at
  BEFORE UPDATE ON trello_board
  FOR EACH ROW EXECUTE FUNCTION trello_set_updated_at();
