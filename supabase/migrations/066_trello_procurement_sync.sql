-- ============================================================
-- Trello Procurement Sync
-- Syncs procurement pipeline data from agency Trello boards.
-- Source of truth is Trello — DG Work OS is read-only view.
-- ============================================================

-- 1. Stage enum for Trello procurement pipeline
CREATE TYPE procurement_stage AS ENUM (
  'not_advertised',
  'advertised',
  'evaluation',
  'nptab_no_objection',
  'contract_awarded'
);

-- 2. Boards — tracks which Trello boards are connected
CREATE TABLE IF NOT EXISTS procurement_boards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency          TEXT NOT NULL,
  trello_board_id TEXT NOT NULL UNIQUE,
  board_name      TEXT NOT NULL,
  webhook_id      TEXT,
  last_synced_at  TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  list_mapping    JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_procurement_boards_agency ON procurement_boards(agency);
CREATE INDEX idx_procurement_boards_trello_board_id ON procurement_boards(trello_board_id);

-- 3. Items — individual procurement items synced from Trello cards
CREATE TABLE IF NOT EXISTS procurement_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id          UUID NOT NULL REFERENCES procurement_boards(id) ON DELETE CASCADE,
  trello_card_id    TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL,
  description       TEXT,
  stage             procurement_stage NOT NULL DEFAULT 'not_advertised',
  trello_list_id    TEXT NOT NULL,
  due_date          DATE,
  labels            JSONB DEFAULT '[]',
  attachments_count INTEGER NOT NULL DEFAULT 0,
  comments_count    INTEGER NOT NULL DEFAULT 0,
  trello_url        TEXT,
  last_activity_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_procurement_items_board_id ON procurement_items(board_id);
CREATE INDEX idx_procurement_items_stage ON procurement_items(stage);
CREATE INDEX idx_procurement_items_trello_card_id ON procurement_items(trello_card_id);

-- 4. Stage history — audit trail of stage transitions
--    Named trello_item_stage_history to avoid conflict with existing procurement_stage_history
CREATE TABLE IF NOT EXISTS trello_item_stage_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id    UUID NOT NULL REFERENCES procurement_items(id) ON DELETE CASCADE,
  from_stage procurement_stage,
  to_stage   procurement_stage NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_trello_item_stage_history_item_id ON trello_item_stage_history(item_id);

-- 5. RLS
ALTER TABLE procurement_boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE trello_item_stage_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read procurement_boards"
  ON procurement_boards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read procurement_items"
  ON procurement_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read trello_item_stage_history"
  ON trello_item_stage_history FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything (webhooks, sync)
CREATE POLICY "Service role full access on procurement_boards"
  ON procurement_boards FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on procurement_items"
  ON procurement_items FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access on trello_item_stage_history"
  ON trello_item_stage_history FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 6. updated_at triggers
CREATE OR REPLACE FUNCTION trello_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_procurement_boards_updated_at
  BEFORE UPDATE ON procurement_boards
  FOR EACH ROW EXECUTE FUNCTION trello_set_updated_at();

CREATE TRIGGER trg_procurement_items_updated_at
  BEFORE UPDATE ON procurement_items
  FOR EACH ROW EXECUTE FUNCTION trello_set_updated_at();

-- 7. Enable realtime for procurement_items (live dashboard updates)
ALTER PUBLICATION supabase_realtime ADD TABLE procurement_items;
