-- ============================================================================
-- Migration 102: Action Items v1 — Foundation (rev 2026-05-03b)
-- Spec: docs/superpowers/specs/2026-05-03-action-items-pipeline-design.md
-- Plan: docs/superpowers/plans/2026-05-03-action-items-plan-1-foundation.md
--
-- Adds: users widening (3 columns) + tasks widening (extraction provenance,
-- verification flow, supersession, visibility) + 4 pipeline-side tables.
-- Disables the existing tasks RLS policy from migration 022 (visibility for
-- this module's flows is enforced app-layer, consistent with the rest of
-- DGOS — mixing RLS with app-layer guards is a footgun).
--
-- Idempotent: safe to re-run thanks to IF NOT EXISTS / DO blocks.
--
-- ATTRIBUTION ANCHOR (locked decision §0.1):
-- Every AI-generated commitment is attributed to the meeting itself.
-- Computed at render time from tasks.source + supporting lookups.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------------
-- Widen users
-- ----------------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS aliases TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS closure_mode TEXT NOT NULL DEFAULT 'self_close'
  CHECK (closure_mode IN ('self_close', 'dg_managed'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_agency_head BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN users.aliases IS
  'Alternative spoken names heard in transcripts. E.g., {"Kesh","Cash","Keche"} for Kesh Nandlall.';
COMMENT ON COLUMN users.closure_mode IS
  'self_close: user can mark their own items complete (default). dg_managed: only DG closes (Minister, PS, parl_sec, President).';
COMMENT ON COLUMN users.is_agency_head IS
  'True for the head of any portfolio agency, plus Minister and PS. Triggers mandatory review on owned items.';
