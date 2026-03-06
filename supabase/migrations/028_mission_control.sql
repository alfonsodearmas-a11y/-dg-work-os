-- ============================================================
-- DG Work OS — Mission Control Schema
-- Run in Supabase dashboard > SQL Editor
-- Additive only — does not touch existing tables
-- ============================================================

-- Agency health snapshots — one row per agency per day
-- Stores computed health scores so Mission Control loads instantly
CREATE TABLE IF NOT EXISTS agency_health_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_slug   TEXT NOT NULL,
  health_score  INTEGER,
  status        TEXT DEFAULT 'building' CHECK (status IN ('live', 'building', 'offline')),
  kpi_snapshot  JSONB,
  computed_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agency_health_slug_idx
  ON agency_health_snapshots(agency_slug, computed_at DESC);

-- KPI alerts
CREATE TABLE IF NOT EXISTS kpi_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_slug   TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  severity      TEXT DEFAULT 'warning' CHECK (severity IN ('info', 'warning', 'critical')),
  resolved      BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

-- Seed: initial snapshots for all 7 agencies
INSERT INTO agency_health_snapshots (agency_slug, health_score, status, kpi_snapshot)
VALUES
  ('gpl',        87,   'live',     '{"saidi": 4.2, "saifi": 0.91, "label": "SAIDI / SAIFI"}'::jsonb),
  ('gwi',        82,   'live',     '{"nrw": 31.4, "coverage": 94, "label": "NRW / Coverage"}'::jsonb),
  ('gcaa',       null, 'building', null),
  ('cjia',       null, 'building', null),
  ('heci',       null, 'building', null),
  ('marad',      null, 'building', null),
  ('hinterland', null, 'building', null)
ON CONFLICT DO NOTHING;
