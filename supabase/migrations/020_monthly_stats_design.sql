-- Add Design track columns to service_connection_monthly_stats
ALTER TABLE service_connection_monthly_stats
  ADD COLUMN IF NOT EXISTS design_completed integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS design_avg_days numeric,
  ADD COLUMN IF NOT EXISTS design_sla_pct numeric;
