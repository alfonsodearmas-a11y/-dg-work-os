-- 006: AI Cost Optimization tables
-- response cache, usage logging, metric snapshots

-- ── Response Cache ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_response_cache (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash    TEXT NOT NULL UNIQUE,
  query_text    TEXT NOT NULL,
  current_page  TEXT NOT NULL DEFAULT '/',
  model_tier    TEXT NOT NULL CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
  response_text TEXT NOT NULL,
  suggestions   JSONB,
  actions       JSONB,
  usage_input_tokens  INTEGER,
  usage_output_tokens INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_cache_hash ON ai_response_cache (query_hash);
CREATE INDEX IF NOT EXISTS idx_ai_cache_expires ON ai_response_cache (expires_at);

-- ── Usage Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      TEXT NOT NULL DEFAULT 'anonymous',
  model_tier      TEXT NOT NULL CHECK (model_tier IN ('haiku', 'sonnet', 'opus')),
  model_id        TEXT NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  query_type      TEXT,           -- e.g. 'factual', 'analytical', 'comparison'
  current_page    TEXT,
  cached          BOOLEAN NOT NULL DEFAULT FALSE,
  local_answer    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage_log (created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_session ON ai_usage_log (session_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tier ON ai_usage_log (model_tier);

-- ── Metric Snapshot ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_metric_snapshot (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_date         DATE NOT NULL UNIQUE,
  snapshot_data         JSONB NOT NULL,
  precomputed_briefing  TEXT,
  briefing_suggestions  JSONB,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_snapshot_date ON ai_metric_snapshot (snapshot_date);
