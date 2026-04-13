-- ============================================================================
-- 074: Delayed Projects War Room
-- New tables for the revamped oversight module: delayed_projects,
-- delayed_project_snapshots, interventions.
-- The existing projects_oversight table is NOT dropped here.
-- ============================================================================

-- ── delayed_projects ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delayed_projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_reference TEXT UNIQUE NOT NULL,
  executing_agency  TEXT NOT NULL DEFAULT 'MOPUA',
  sub_agency        TEXT NOT NULL,
  project_name      TEXT NOT NULL,
  region            TEXT,
  tender_board_type TEXT,
  contract_value    BIGINT DEFAULT 0,
  contractors       TEXT,
  project_end_date  DATE,
  completion_percent DECIMAL(5,2) DEFAULT 0
    CHECK (completion_percent >= 0 AND completion_percent <= 100),
  has_images        BOOLEAN DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'DELAYED',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_dp_sub_agency       ON delayed_projects(sub_agency);
CREATE INDEX idx_dp_status           ON delayed_projects(status);
CREATE INDEX idx_dp_region           ON delayed_projects(region);
CREATE INDEX idx_dp_completion       ON delayed_projects(completion_percent);
CREATE INDEX idx_dp_contract_value   ON delayed_projects(contract_value DESC);
CREATE INDEX idx_dp_project_end_date ON delayed_projects(project_end_date);
CREATE INDEX idx_dp_ref              ON delayed_projects(project_reference);

-- RLS
ALTER TABLE delayed_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY dp_select ON delayed_projects FOR SELECT USING (true);
CREATE POLICY dp_service_all ON delayed_projects FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger (reuses existing function from migration 072)
CREATE TRIGGER trg_dp_updated_at
  BEFORE UPDATE ON delayed_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ── delayed_project_snapshots ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS delayed_project_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES delayed_projects(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  completion_percent DECIMAL(5,2),
  contract_value    BIGINT,
  project_end_date  DATE,
  status            TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dps_project_date ON delayed_project_snapshots(project_id, snapshot_date DESC);
CREATE INDEX idx_dps_date         ON delayed_project_snapshots(snapshot_date);

-- One snapshot per project per date
CREATE UNIQUE INDEX idx_dps_unique_project_date
  ON delayed_project_snapshots(project_id, snapshot_date);

-- RLS
ALTER TABLE delayed_project_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY dps_select ON delayed_project_snapshots FOR SELECT USING (true);
CREATE POLICY dps_service_all ON delayed_project_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- ── interventions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS interventions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID NOT NULL REFERENCES delayed_projects(id) ON DELETE CASCADE,
  intervention_type TEXT NOT NULL CHECK (intervention_type IN (
    'SITE_VISIT', 'CONTRACTOR_MEETING', 'ESCALATION_TO_PS',
    'BOND_WARNING', 'TERMINATION_NOTICE', 'TIMELINE_EXTENSION',
    'VARIATION_ORDER', 'OTHER'
  )),
  description       TEXT NOT NULL,
  assigned_to       TEXT,
  due_date          DATE,
  status            TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE')),
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_int_project    ON interventions(project_id);
CREATE INDEX idx_int_status     ON interventions(status);
CREATE INDEX idx_int_type       ON interventions(intervention_type);
CREATE INDEX idx_int_due_date   ON interventions(due_date);
CREATE INDEX idx_int_created_at ON interventions(created_at DESC);

-- RLS
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
CREATE POLICY int_select ON interventions FOR SELECT USING (true);
CREATE POLICY int_service_all ON interventions FOR ALL
  USING (auth.role() = 'service_role');

-- ── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE delayed_projects;
ALTER PUBLICATION supabase_realtime ADD TABLE interventions;
