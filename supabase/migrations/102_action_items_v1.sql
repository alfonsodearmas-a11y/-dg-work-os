-- ============================================================================
-- Migration 102: Action Items v1 — Foundation
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + 5 new tables for the action items pipeline.
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated action item is attributed to the meeting itself,
-- not to the AI and not to the DG personally. This is non-negotiable
-- and reaches into the schema via action_items.source + extraction linkage.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- Widen users (locked decision: single users table carries staff metadata,
-- no separate staff_profile join table).
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, Parliamentary Secretary, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';
