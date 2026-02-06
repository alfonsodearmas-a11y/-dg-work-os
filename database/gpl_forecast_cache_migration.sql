-- Enhanced forecast cache table
-- Stores Claude Opus multivariate forecast results with data hash for cache invalidation

CREATE TABLE IF NOT EXISTS gpl_forecast_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  forecast_json jsonb NOT NULL,
  generated_at timestamptz DEFAULT now(),
  data_hash text NOT NULL,
  model_used text DEFAULT 'claude-opus-4-6',
  prompt_tokens integer,
  completion_tokens integer,
  processing_time_ms integer,
  UNIQUE(data_hash)
);

CREATE INDEX IF NOT EXISTS idx_gpl_forecast_cache_generated ON gpl_forecast_cache(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gpl_forecast_cache_hash ON gpl_forecast_cache(data_hash);
