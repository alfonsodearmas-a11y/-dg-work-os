-- =====================================================
-- MIGRATION 037: Add total_distributed and total_expended to projects
-- Quick-reference funding totals from the oversight scraper
-- =====================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS total_distributed NUMERIC,
  ADD COLUMN IF NOT EXISTS total_expended NUMERIC;
