-- ============================================================
-- DG Work OS — Pulse Agency-Level RLS
-- Adds row-level security on agency_health_snapshots and kpi_alerts
-- so agency users can only see their own agency's data.
-- DO NOT run via supabase db push — apply manually.
-- ============================================================

-- ── agency_health_snapshots ────────────────────────────────────────────────

ALTER TABLE agency_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Ministry roles (dg, minister, ps) see all snapshots
CREATE POLICY agency_health_snapshots_ministry_read
  ON agency_health_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps')
    )
  );

-- Agency users see only their own agency's snapshots
CREATE POLICY agency_health_snapshots_agency_read
  ON agency_health_snapshots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('agency_admin', 'officer')
        AND UPPER(users.agency) = UPPER(agency_health_snapshots.agency_slug)
    )
  );

-- Service role (used by API routes) bypasses RLS automatically

-- ── kpi_alerts ─────────────────────────────────────────────────────────────

ALTER TABLE kpi_alerts ENABLE ROW LEVEL SECURITY;

-- Ministry roles see all alerts
CREATE POLICY kpi_alerts_ministry_read
  ON kpi_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('dg', 'minister', 'ps')
    )
  );

-- Agency users see only their own agency's alerts
CREATE POLICY kpi_alerts_agency_read
  ON kpi_alerts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('agency_admin', 'officer')
        AND UPPER(users.agency) = UPPER(kpi_alerts.agency_slug)
    )
  );
