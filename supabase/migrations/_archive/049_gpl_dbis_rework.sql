-- Migration 049: GPL DBIS Parser Rework
-- Add missing summary columns to gpl_daily_summary.
-- These fields are parsed from the Schedule sheet but were never stored.

ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS expected_capacity_mw DECIMAL(10,4);
ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS expected_reserve_mw DECIMAL(10,4);
ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS gen_availability_at_suppressed_peak DECIMAL(10,4);
ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS approx_suppressed_peak DECIMAL(10,4);
ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS system_utilization_pct DECIMAL(6,2);
ALTER TABLE gpl_daily_summary ADD COLUMN IF NOT EXISTS reserve_margin_pct DECIMAL(6,2);
