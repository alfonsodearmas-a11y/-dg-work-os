-- Migration 069: GPL outage & feeder cache tables for Grid Health module
-- File: supabase/migrations/069_gpl_outage_cache.sql
-- DO NOT RUN AUTOMATICALLY. Alfonso runs manually via Supabase Dashboard.

-- ── Outage cache (synced from GPL System Control Dashboard API) ─────────────

CREATE TABLE IF NOT EXISTS gpl_outage_cache (
  id SERIAL PRIMARY KEY,
  outage_id INTEGER NOT NULL,
  feeder_id INTEGER,
  date DATE NOT NULL,
  time_out TIME,
  time_in TIME,
  duration_minutes INTEGER,
  customers_affected INTEGER,
  mw_lost DECIMAL(6,2),
  ens_mwh DECIMAL(8,3),
  cause_category TEXT,
  cause_subcategory TEXT,
  cause_detail TEXT,
  root_cause TEXT,
  status TEXT,
  feeder_code TEXT,
  substation_code TEXT,
  areas_affected TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(outage_id)
);

CREATE INDEX IF NOT EXISTS idx_gpl_outage_date ON gpl_outage_cache(date);
CREATE INDEX IF NOT EXISTS idx_gpl_outage_feeder ON gpl_outage_cache(feeder_code);
CREATE INDEX IF NOT EXISTS idx_gpl_outage_sub ON gpl_outage_cache(substation_code);
CREATE INDEX IF NOT EXISTS idx_gpl_outage_status ON gpl_outage_cache(status);

-- ── Feeder master cache ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gpl_feeder_cache (
  id SERIAL PRIMARY KEY,
  feeder_id INTEGER NOT NULL,
  code TEXT,
  name TEXT,
  substation_code TEXT,
  area_served TEXT,
  customer_count INTEGER,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feeder_id)
);

CREATE INDEX IF NOT EXISTS idx_gpl_feeder_code ON gpl_feeder_cache(code);

-- ── Pulse score history ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gpl_pulse_scores (
  id SERIAL PRIMARY KEY,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  overall INTEGER NOT NULL,
  frequency_score INTEGER,
  restoration_score INTEGER,
  impact_score INTEGER,
  outage_count_30d INTEGER,
  avg_restoration_min DECIMAL(5,1),
  cmi_per_1000 INTEGER,
  score_breakdown JSONB
);

CREATE INDEX IF NOT EXISTS idx_gpl_pulse_computed ON gpl_pulse_scores(computed_at DESC);

-- ── RLS policies ────────────────────────────────────────────────────────────

ALTER TABLE gpl_outage_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_feeder_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpl_pulse_scores ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users (ministry + agency)
CREATE POLICY "gpl_outage_cache_read" ON gpl_outage_cache
  FOR SELECT USING (true);

CREATE POLICY "gpl_feeder_cache_read" ON gpl_feeder_cache
  FOR SELECT USING (true);

CREATE POLICY "gpl_pulse_scores_read" ON gpl_pulse_scores
  FOR SELECT USING (true);

-- Service role can insert/update (sync runs server-side with admin client)
CREATE POLICY "gpl_outage_cache_write" ON gpl_outage_cache
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "gpl_feeder_cache_write" ON gpl_feeder_cache
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "gpl_pulse_scores_write" ON gpl_pulse_scores
  FOR ALL USING (true) WITH CHECK (true);
